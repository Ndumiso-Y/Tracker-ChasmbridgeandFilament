import fs from 'fs';

// 1. Entity Updates
const chasmRecords = [
  'p2-consent-process',
  'p2-recruitment-boundaries',
  'p2-testimonial-workflow',
  'p2-graduate-data-governance',
  'p3-testimonial-collection',
  'p3-cv-training-update',
  'risk-graduate-availability',
  'risk-no-consent'
];

// 2. New Record
const newRecord = {
  id: 'p2-separate-cost-confirmation',
  task: 'Confirm Separate-Cost Items for Review Period',
  entity: 'Both',
  category: 'Approval & Workflow',
  phase: 'Phase 2',
  status: 'Not Started',
  deliveryContext: 'Package 3 Review',
  recordType: 'Approval Gate',
  responsible: 'Embark Digitals',
  priority: 'High',
  requiresApproval: true,
  approvalStatus: 'Ready for Review',
  nextAction: 'Review current Package 3 requests and roadmap scope boundaries; confirm which items require separate costing before work proceeds.'
};

// 3. Rename Risk
const riskId = 'risk-missing-assets';
const newRiskTitle = 'Missing or Late Content Inputs';

// UPDATE trackerData.js
let trackerData = fs.readFileSync('src/data/trackerData.js', 'utf8');

// Apply entity changes
chasmRecords.forEach(id => {
  const regex = new RegExp(`(id:\\s*"${id}"[\\s\\S]*?entity:\\s*")Both(")`);
  trackerData = trackerData.replace(regex, `$1Chasm Bridge Charity$2`);
});

// Rename risk
const riskRegex = new RegExp(`(id:\\s*"${riskId}"[\\s\\S]*?task:\\s*")[^"]+(")`);
trackerData = trackerData.replace(riskRegex, `$1${newRiskTitle}$2`);

// Add new record
const insertIndex = trackerData.lastIndexOf('}');
const newRecordString = `,\n  {\n    id: "${newRecord.id}",\n    task: "${newRecord.task}",\n    entity: "${newRecord.entity}",\n    category: "${newRecord.category}",\n    phase: "${newRecord.phase}",\n    status: "${newRecord.status}",\n    deliveryContext: "${newRecord.deliveryContext}",\n    recordType: "${newRecord.recordType}",\n    responsible: "${newRecord.responsible}",\n    priority: "${newRecord.priority}",\n    requiresApproval: ${newRecord.requiresApproval},\n    approvalStatus: "${newRecord.approvalStatus}",\n    nextAction: "${newRecord.nextAction}"\n  }`;

trackerData = trackerData.substring(0, insertIndex + 1) + newRecordString + '\n];\n';
fs.writeFileSync('src/data/trackerData.js', trackerData);


// UPDATE phase2_phase3_delivery_schema.sql
let schemaContent = fs.readFileSync('supabase/phase2_phase3_delivery_schema.sql', 'utf8');

// Apply entity changes
chasmRecords.forEach(id => {
  const regex = new RegExp(`(\\('${id}',\\s*'[^']+',\\s*')Both(')`);
  schemaContent = schemaContent.replace(regex, `$1Chasm Bridge Charity$2`);
});

// Rename risk
const riskSqlRegex = new RegExp(`(\\('${riskId}',\\s*')[^']+(')`);
schemaContent = schemaContent.replace(riskSqlRegex, `$1${newRiskTitle}$2`);

// Add new record
// Note: SQL columns: (id, title, entity, category, phase, status, delivery_context, record_type, owner_label, priority)
// We also need to add requires_approval and approval_status for this one? 
// Wait, the INSERT statement in schema.sql only has:
// INSERT INTO tracker_items (id, title, entity, category, phase, status, delivery_context, record_type, owner_label, priority)
// So we just add the standard columns. We will add a second INSERT for the new fields or alter the existing one.
// Let's just update the schemaContent ON CONFLICT line to add the new record with the available columns.
// Actually, let's just append an UPDATE for the additional fields.
const sqlInsertValues = `('${newRecord.id}', '${newRecord.task}', '${newRecord.entity}', '${newRecord.category}', '${newRecord.phase}', '${newRecord.status}', '${newRecord.deliveryContext}', '${newRecord.recordType}', '${newRecord.responsible}', '${newRecord.priority}')`;

schemaContent = schemaContent.replace(/ON CONFLICT \(id\) DO NOTHING;/g, `,\n${sqlInsertValues}\nON CONFLICT (id) DO NOTHING;\n\nUPDATE tracker_items SET requires_approval = true, approval_status = 'Ready for Review', next_action = 'Review current Package 3 requests and roadmap scope boundaries; confirm which items require separate costing before work proceeds.' WHERE id = 'p2-separate-cost-confirmation';`);

fs.writeFileSync('supabase/phase2_phase3_delivery_schema.sql', schemaContent);

console.log('Update script executed successfully.');
