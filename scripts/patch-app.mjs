import fs from 'fs';
import path from 'path';

const appPath = path.resolve('./src/App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add DeliveryBoard import
if (!content.includes('import DeliveryBoard')) {
  content = content.replace(
    'import GraduatesCohort from "./views/GraduatesCohort";',
    'import GraduatesCohort from "./views/GraduatesCohort";\nimport DeliveryBoard from "./views/DeliveryBoard";'
  );
}

// 2. Add Delivery Board to baseNavItems
if (!content.includes('id: "delivery"')) {
  content = content.replace(
    '{ id: "scope", label: "Phase 1 Scope", icon: ShieldCheck },',
    '{ id: "delivery", label: "Delivery Board", icon: FolderKanban },\n  { id: "scope", label: "Phase 1 Scope", icon: ShieldCheck },'
  );
}

// 3. Update mapTaskFromDb
if (!content.includes('deliveryContext: t.delivery_context')) {
  content = content.replace(
    'entity: t.entity || "Both",\n  };',
    `entity: t.entity || "Both",
    deliveryContext: t.delivery_context || null,
    recordType: t.record_type || "Task",
    workstream: t.workstream || null,
    deliveryLane: t.delivery_lane || null,
    deliveryWeek: t.delivery_week || null,
    workflowType: t.workflow_type || "General",
    workflowStage: t.workflow_stage || null,
    blockedBy: t.blocked_by || null,
    blockedSince: t.blocked_since || null,
    scopeTreatment: t.scope_treatment || "Current Delivery",
    contentPillar: t.content_pillar || null,
    requiresApproval: t.requires_approval || false,
    approvalStatus: t.approval_status || "Not Required",
    cadenceStatus: t.cadence_status || null,
  };`
  );
}

// 4. Update isTask pattern
const isTaskOld = `const isTask = r.id.startsWith("task-") || r.id.startsWith("social-") || r.id.startsWith("later-");`;
const isTaskNew = `const isTask = r.id.startsWith("task-") || r.id.startsWith("social-") || r.id.startsWith("later-") || r.id.startsWith("p2-") || r.id.startsWith("p3-") || r.id.startsWith("risk-") || r.id.startsWith("decision-") || r.id.startsWith("milestone-") || r.id.startsWith("context-") || r.id.startsWith("scope-");`;

content = content.replace(/const isTask = [^;]+;/g, isTaskNew);

// Also update it in handleInlineUpdate
const handleIsTaskOld = `const isTask = itemId.startsWith("task-") || itemId.startsWith("social-") || itemId.startsWith("later-");`;
const handleIsTaskNew = `const isTask = itemId.startsWith("task-") || itemId.startsWith("social-") || itemId.startsWith("later-") || itemId.startsWith("p2-") || itemId.startsWith("p3-") || itemId.startsWith("risk-") || itemId.startsWith("decision-") || itemId.startsWith("milestone-") || itemId.startsWith("context-") || itemId.startsWith("scope-");`;
content = content.replace(/const isTask = itemId[^;]+;/g, handleIsTaskNew);

// 5. Update handleInlineUpdate payload
const inlineUpdateFieldsNew = `
    if (updatedFields.status !== undefined) updateData.status = updatedFields.status;
    if (updatedFields.dueDate !== undefined) updateData.due_date = updatedFields.dueDate || null;
    if (updatedFields.nextAction !== undefined) updateData.next_action = updatedFields.nextAction || null;
    if (updatedFields.priority !== undefined) updateData.priority = updatedFields.priority || null;
    if (updatedFields.responsible !== undefined) updateData.owner_label = updatedFields.responsible || null;
    if (updatedFields.notes !== undefined) updateData.notes = updatedFields.notes || null;
    if (updatedFields.deliveryLane !== undefined) updateData.delivery_lane = updatedFields.deliveryLane || null;
    if (updatedFields.deliveryContext !== undefined) updateData.delivery_context = updatedFields.deliveryContext || null;
    if (updatedFields.workflowStage !== undefined) updateData.workflow_stage = updatedFields.workflowStage || null;
    if (updatedFields.approvalStatus !== undefined) updateData.approval_status = updatedFields.approvalStatus || null;
    if (updatedFields.cadenceStatus !== undefined) updateData.cadence_status = updatedFields.cadenceStatus || null;
    if (updatedFields.blockedBy !== undefined) updateData.blocked_by = updatedFields.blockedBy || null;
    if (updatedFields.blockedSince !== undefined) updateData.blocked_since = updatedFields.blockedSince || null;
`;

content = content.replace(
  /if \(updatedFields\.status !== undefined\) updateData\.status = updatedFields\.status;\n.*?(?=if \(isDeliverable)/s,
  inlineUpdateFieldsNew
);

// Local fields update
const localFieldsNew = `
      const localFields = {};
      if (updatedFields.status !== undefined) localFields.status = updatedFields.status;
      if (updatedFields.dueDate !== undefined) localFields.dueDate = updatedFields.dueDate;
      if (updatedFields.nextAction !== undefined) localFields.nextAction = updatedFields.nextAction;
      if (updatedFields.notes !== undefined) localFields.notes = updatedFields.notes;
      if (updatedFields.deliveryLane !== undefined) localFields.deliveryLane = updatedFields.deliveryLane;
      if (updatedFields.deliveryContext !== undefined) localFields.deliveryContext = updatedFields.deliveryContext;
      if (updatedFields.workflowStage !== undefined) localFields.workflowStage = updatedFields.workflowStage;
      if (updatedFields.approvalStatus !== undefined) localFields.approvalStatus = updatedFields.approvalStatus;
      if (updatedFields.cadenceStatus !== undefined) localFields.cadenceStatus = updatedFields.cadenceStatus;
      if (updatedFields.blockedBy !== undefined) localFields.blockedBy = updatedFields.blockedBy;
      if (updatedFields.blockedSince !== undefined) localFields.blockedSince = updatedFields.blockedSince;
`;

content = content.replace(
  /const localFields = \{\};\n.*?(?=if \(isDeliverable)/s,
  localFieldsNew
);

fs.writeFileSync(appPath, content, 'utf8');
console.log("App.jsx patched successfully!");
