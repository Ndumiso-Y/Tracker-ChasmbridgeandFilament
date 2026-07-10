import fs from 'fs';

const newRecords = [
  // Phase 2
  { id: 'p2-approval-authority', task: 'Confirm Primary Approvers & Turnaround Times', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 2', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Decision', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-access-control', task: 'Confirm Social Admin & Agency Access Levels', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-testimonial-workflow', task: 'Finalise Testimonial Collection Process & Template', entity: 'Both', category: 'Testimonials & Consent', phase: 'Phase 2', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Deliverable', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-content-calendar', task: 'Prepare First 30-Day Content Calendar', entity: 'Both', category: 'Content & Design', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Deliverable', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-website-update-process', task: 'Establish Website Update Request Process', entity: 'Both', category: 'Website Care', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task', responsible: 'Embark Digitals', priority: 'Medium' },
  { id: 'p2-analytics-reporting', task: 'Analytics Setup & July Reporting Baseline', entity: 'Both', category: 'Google / SEO', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task', responsible: 'Embark Digitals', priority: 'Medium' },
  { id: 'p2-email-signatures-cards', task: 'Finalise Email Signatures & Digital Cards', entity: 'Both', category: 'Content & Design', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Deliverable', responsible: 'Embark Digitals', priority: 'Medium' },
  { id: 'p2-google-business', task: 'Google Business Profile Setup Decision', entity: 'Both', category: 'Google / SEO', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Decision', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'p2-graduate-data-governance', task: 'Establish Graduate Data Governance & Alignment', entity: 'Both', category: 'Strategy', phase: 'Phase 2', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-monthly-deliverables', task: 'Confirm Monthly Deliverable Expectations', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 2', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Decision', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p2-priority-confirmation', task: 'Phase 2 Priority Confirmation', entity: 'Both', category: 'Strategy', phase: 'Phase 2', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Decision', responsible: 'Embark Digitals', priority: 'High' },

  // Phase 3
  { id: 'p3-website-care', task: 'Website Care & Monitoring', entity: 'Both', category: 'Website Care', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p3-coordination-tracking', task: 'Coordination & Approval Tracking', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p3-month1-review-prep', task: 'One-Month Review Preparation', entity: 'Both', category: 'Programme Review', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Task', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p3-social-posters', task: 'Finalise Social Follow Posters', entity: 'Both', category: 'Content & Design', phase: 'Phase 3', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Deliverable', responsible: 'Embark Digitals', priority: 'High' },
  { id: 'p3-cv-training-update', task: 'Publish CV Submission / Training Update', entity: 'Both', category: 'Content & Design', phase: 'Phase 3', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Deliverable', responsible: 'Embark Digitals', priority: 'High' },

  // Risks
  { id: 'risk-unclear-ownership', task: 'Unclear Content Ownership & Decision Maker', entity: 'Both', category: 'Strategy', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },
  { id: 'risk-missing-assets', task: 'Missing Photos & Testimonials', entity: 'Both', category: 'Content & Design', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },
  { id: 'risk-unapproved-claims', task: 'Unapproved Public Claims', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },
  { id: 'risk-access-limitations', task: 'Access Limitations & Delays', entity: 'Both', category: 'Social Media', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },
  { id: 'risk-scope-creep', task: 'Scope Changes Without Approval', entity: 'Both', category: 'Strategy', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },
  { id: 'risk-no-consent', task: 'No Consent for Graduate Photos/Stories', entity: 'Both', category: 'Testimonials & Consent', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Risk', responsible: 'Client Team', priority: 'High' },

  // Context & Scope
  { id: 'context-organic-reach', task: 'Reliance on Unpaid Organic Reach', entity: 'Both', category: 'Social Media', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-paid-media', task: 'Paid Advertising & Boosted Posts', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-premium-content', task: 'Premium Video, Photography & Animations', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-print-materials', task: 'Brochures, Pitch Decks & Printing', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-backend-dev', task: 'Backend Web Dev & Application Forms', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-automation', task: 'WhatsApp API & Email Automation', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-advanced-analytics', task: 'Advanced Analytics Dashboards', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-premium-software', task: 'Premium Software & Domain Renewals', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-emergency-work', task: 'Emergency Turnaround Work', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },
  { id: 'scope-advanced-seo', task: 'Advanced SEO Campaigns', entity: 'Both', category: 'Future Systems', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context', responsible: 'Embark Digitals', priority: 'Low' },

  // Milestones
  { id: 'milestone-package3-review-start', task: 'Package 3 Review Start Date Confirmation', entity: 'Both', category: 'Approval & Workflow', phase: 'Phase 3', status: 'In Progress', deliveryContext: 'Package 3 Review', recordType: 'Approval Gate', responsible: 'Embark Digitals', priority: 'High' }
];

let trackerData = fs.readFileSync('src/data/trackerData.js', 'utf8');
let scopeInsertIndex = trackerData.lastIndexOf('}');
let jsObjects = newRecords.map(r => `,\n  {\n    id: "${r.id}",\n    task: "${r.task}",\n    entity: "${r.entity}",\n    category: "${r.category}",\n    phase: "${r.phase}",\n    status: "${r.status}",\n    deliveryContext: "${r.deliveryContext}",\n    recordType: "${r.recordType}",\n    responsible: "${r.responsible}",\n    priority: "${r.priority}"\n  }`).join('');

trackerData = trackerData.substring(0, scopeInsertIndex + 1) + jsObjects + '\n];\n';
fs.writeFileSync('src/data/trackerData.js', trackerData);

let schemaContent = fs.readFileSync('supabase/phase2_phase3_delivery_schema.sql', 'utf8');
let sqlInsertValues = newRecords.map(r => `('${r.id}', '${r.task}', '${r.entity}', '${r.category}', '${r.phase}', '${r.status}', '${r.deliveryContext}', '${r.recordType}', '${r.responsible}', '${r.priority}')`).join(',\n');

schemaContent = schemaContent.replace(/ON CONFLICT \(id\) DO NOTHING;/g, ',\n' + sqlInsertValues + '\nON CONFLICT (id) DO NOTHING;');
fs.writeFileSync('supabase/phase2_phase3_delivery_schema.sql', schemaContent);

console.log('Added ' + newRecords.length + ' new records.');
