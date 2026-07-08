import {
  tasks,
  phases,
  deliveryContexts,
  statuses
} from "../src/data/trackerData.js";

const errors = [];

function addError(message) {
  errors.push(message);
}

// Allowed Enums
const allowedRecordTypes = ["Task", "Deliverable", "Recurring Activity", "Approval Gate", "Milestone", "Risk", "Decision", "Context"];
const allowedScopeTreatments = ["Current Delivery", "Current Delivery if Minor", "Requires Client Approval", "Separate Cost Likely", "Third-Party Cost", "Separate Scope", "Future Context Only"];
const allowedCadenceStatuses = ["Not Yet Assessed", "On Track", "At Risk", "Behind", "Awaiting Inputs"];
const allowedDeliveryLanes = ["Now", "This Week", "Next", "Awaiting Approval", "Blocked", "Completed"];
const allowedDeliveryWeeks = ["Week 1: Stabilise & Confirm", "Week 2: Organise & Publish", "Week 3: Build Credibility", "Week 4: Review & Recommend", "Cross-Period / Recurring"];
const allowedApprovalStatuses = ["Not Required", "Drafting", "Ready for Review", "Awaiting Approval", "Changes Requested", "Approved", "Superseded"];

// 1. Enum checks & Structure Checks
let hasPhase1 = false;
let hasPackage3Context = false;

tasks.forEach((task, index) => {
  const context = `tasks[${index}] (${task.id || 'no-id'})`;

  // Enums
  if (task.recordType && !allowedRecordTypes.includes(task.recordType)) {
    addError(`Invalid recordType "${task.recordType}" in ${context}`);
  }
  if (task.scopeTreatment && !allowedScopeTreatments.includes(task.scopeTreatment)) {
    addError(`Invalid scopeTreatment "${task.scopeTreatment}" in ${context}`);
  }
  if (task.cadenceStatus && !allowedCadenceStatuses.includes(task.cadenceStatus)) {
    addError(`Invalid cadenceStatus "${task.cadenceStatus}" in ${context}`);
  }
  if (task.deliveryLane && !allowedDeliveryLanes.includes(task.deliveryLane)) {
    addError(`Invalid deliveryLane "${task.deliveryLane}" in ${context}`);
  }
  if (task.deliveryWeek && !allowedDeliveryWeeks.includes(task.deliveryWeek)) {
    addError(`Invalid deliveryWeek "${task.deliveryWeek}" in ${context}`);
  }
  if (task.approvalStatus && !allowedApprovalStatuses.includes(task.approvalStatus)) {
    addError(`Invalid approvalStatus "${task.approvalStatus}" in ${context}`);
  }
  if (task.deliveryContext && !deliveryContexts.includes(task.deliveryContext)) {
    addError(`Invalid deliveryContext "${task.deliveryContext}" in ${context}`);
  }

  // Preservation checks
  if (task.phase === "Phase 1") {
    hasPhase1 = true;
  }

  // Separation check
  if (task.phase === "Separate Scope" && task.deliveryLane) {
    addError(`Separate Scope item has deliveryLane set in ${context}`);
  }

  // Delivery check
  if (task.phase === "Phase 3" && task.deliveryContext === "Package 3 Review") {
    hasPackage3Context = true;
  }

  // Legacy field check for all new items
  const isNewItem = task.id && (task.id.startsWith("p2-") || task.id.startsWith("p3-") || task.id.startsWith("risk-") || task.id.startsWith("milestone-") || task.id.startsWith("scope-") || task.id.startsWith("context-"));

  if (isNewItem) {
    if (!task.id) addError(`Missing 'id' in ${context}`);
    if (!task.task) addError(`Missing 'task' (title) in ${context}`);

    // Entity check
    const validEntities = ["Chasm Bridge Charity", "Filament", "Both"];
    if (!task.entity) {
      addError(`Missing 'entity' in ${context}`);
    } else if (!validEntities.includes(task.entity)) {
      addError(`Invalid 'entity' "${task.entity}" in ${context}`);
    }

    if (!task.phase) addError(`Missing 'phase' in ${context}`);
    if (!task.category) addError(`Missing 'category' in ${context}`);

    if (!task.status) {
      addError(`Missing 'status' in ${context}`);
    } else if (!statuses.includes(task.status)) {
      addError(`Invalid 'status' "${task.status}" in ${context}`);
    }

    if (!task.priority) addError(`Missing 'priority' in ${context}`);
    if (!task.responsible) addError(`Missing 'responsible' (owner_label) in ${context}`);

    // isPublic check
    if (task.isPublic !== undefined && typeof task.isPublic !== "boolean") {
      addError(`Invalid 'isPublic' type in ${context}`);
    }
  }
});

if (!hasPhase1) {
  addError("Preservation Failure: No Phase 1 items found in trackerData.");
}

if (!hasPackage3Context) {
  addError("Delivery Failure: No Phase 3 items with deliveryContext='Package 3 Review' found.");
}


import { calculatePhase3DeliveryHealth, getDaysOverdue } from "../src/utils/health.js";

// Health logic tests
const today = new Date('2026-07-05T12:00:00Z'); // Fixed test date

function testHealth(scenario, tasks, expected) {
  const result = calculatePhase3DeliveryHealth(tasks, today);
  if (result !== expected) {
    addError(`Health Test Failed: ${scenario} -> Expected ${expected}, got ${result}`);
  }
}

// 1. No assessed recurring records -> Not Yet Assessed
testHealth("1. No assessed recurring records", [
  { phase: "Phase 3", status: "In Progress" } // Active, but not recurring/assessed
], "Not Yet Assessed");

// 2. 20 assessed recurring activities: 19 On Track, 1 Behind -> On Track
const tasks2 = Array.from({ length: 20 }, (_, i) => ({
  phase: "Phase 3", status: "In Progress", recordType: "Recurring Activity",
  cadenceStatus: i === 0 ? "Behind" : "On Track"
}));
testHealth("2. 19 On Track, 1 Behind", tasks2, "On Track");

// 3. 10 assessed recurring activities: 6 Behind, 4 On Track -> Behind
const tasks3 = Array.from({ length: 10 }, (_, i) => ({
  phase: "Phase 3", status: "In Progress", recordType: "Recurring Activity",
  cadenceStatus: i < 6 ? "Behind" : "On Track"
}));
testHealth("3. 6 Behind, 4 On Track", tasks3, "Behind");

// 4. No Behind cadence, but one High priority active Phase 3 task is 5 days overdue -> Behind
testHealth("4. High priority 5 days overdue", [
  { phase: "Phase 3", status: "In Progress", priority: "High", dueDate: "2026-06-30" } // 5 days before 2026-07-05
], "Behind");

// 5. One normal-priority active Phase 3 item overdue -> At Risk
testHealth("5. Normal priority 1 day overdue", [
  { phase: "Phase 3", status: "In Progress", priority: "Medium", dueDate: "2026-07-04" }
], "At Risk");

// 6. 4 active Phase 3 records: 1 Blocked -> At Risk
testHealth("6. 4 active, 1 blocked", [
  { phase: "Phase 3", status: "Blocked" },
  { phase: "Phase 3", status: "In Progress" },
  { phase: "Phase 3", status: "In Progress" },
  { phase: "Phase 3", status: "In Progress" }
], "At Risk");

// 7. 10 active Phase 3 records: 6 Waiting on Client / Awaiting Approval / Awaiting Inputs, No Behind or At Risk -> Awaiting Inputs
const tasks7 = Array.from({ length: 10 }, (_, i) => ({
  phase: "Phase 3", status: i < 6 ? "Waiting on Client" : "In Progress",
  priority: "Medium", dueDate: "2026-07-10" // Not overdue
}));
testHealth("7. 6/10 Awaiting Inputs", tasks7, "Awaiting Inputs");

// 8. 10 assessed recurring activities: 7 On Track, 3 Awaiting Inputs -> On Track
const tasks8 = Array.from({ length: 10 }, (_, i) => ({
  phase: "Phase 3", status: "In Progress", recordType: "Recurring Activity",
  cadenceStatus: i < 7 ? "On Track" : "Awaiting Inputs"
}));
testHealth("8. 7 On Track, 3 Awaiting Inputs", tasks8, "On Track");

// Date test
if (getDaysOverdue("2026-07-01", today) !== 4) addError("getDaysOverdue failed");
if (getDaysOverdue("2026-07-05", today) !== 0) addError("getDaysOverdue failed for today");
if (getDaysOverdue("2026-07-10", today) !== -5) addError("getDaysOverdue failed for future");

if (phases.includes("Package 3")) {
  addError("Architecture Failure: 'Package 3' is still in the phases array.");
}

if (errors.length > 0) {
  console.error(`\n❌ DELIVERY VALIDATION FAILED WITH ${errors.length} ERRORS:\n`);
  errors.forEach((err) => console.error(` - ${err}`));
  process.exit(1);
} else {
  console.log("✅ Delivery validation passed. Phase boundaries and enums are intact.");
}
