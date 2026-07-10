import fs from 'fs';
import path from 'path';

const trackerDataPath = path.resolve('./src/data/trackerData.js');
let content = fs.readFileSync(trackerDataPath, 'utf8');

// 1. Per-item legacy migration
const updates = [
  { id: 'task-later-social-posting', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-social-graphics', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-web-bugfixes', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-web-updates', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-domain-monitoring', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-email-troubleshoot', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-mailbox-monitoring', phase: 'Phase 3', status: 'Recurring — Active', deliveryContext: 'Package 3 Review', recordType: 'Recurring Activity' },
  { id: 'task-later-google-profile', phase: 'Phase 2', status: 'Deferred', deliveryContext: 'Package 3 Review', recordType: 'Task' },
  { id: 'task-later-meta-pixel', phase: 'Phase 2', status: 'Deferred', deliveryContext: 'Package 3 Review', recordType: 'Task' },
  { id: 'task-later-seo-hygiene', phase: 'Phase 3', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task' },
  { id: 'task-later-whatsapp-setup', phase: 'Phase 2', status: 'Deferred', deliveryContext: 'Package 3 Review', recordType: 'Task' },
  { id: 'task-later-comms-tier2', phase: 'Phase 3', status: 'Not Started', deliveryContext: 'Package 3 Review', recordType: 'Task' },
  { id: 'task-later-web-forms', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-ai-kb', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-system-build', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-gms', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-ai-docs', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-ai-marketing', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-system-planning', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-seo-deep', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-comms-tier3', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-crm', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-dashboard', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-ai-video', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-business-plans', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
  { id: 'task-later-whatsapp-api', phase: 'Separate Scope', status: 'Separate Scope', deliveryContext: 'Future / Separate Scope', recordType: 'Context' },
];

for (const update of updates) {
  const idRegex = new RegExp(`id:\\s*"${update.id}",`);
  const startIdx = content.search(idRegex);
  if (startIdx > -1) {
    let blockStart = content.lastIndexOf('{', startIdx);
    let blockEnd = content.indexOf('},', startIdx);
    if (blockStart > -1 && blockEnd > -1) {
      let block = content.substring(blockStart, blockEnd + 1);
      block = block.replace(/phase:\s*"[^"]+",/, `phase: "${update.phase}",`);
      block = block.replace(/status:\s*"[^"]+",/, `status: "${update.status}",`);
      
      if (!block.includes('deliveryContext')) {
          block = block.replace(/id:\s*"[^"]+",/, `$& deliveryContext: "${update.deliveryContext}", recordType: "${update.recordType}",`);
      }
      content = content.substring(0, blockStart) + block + content.substring(blockEnd + 1);
    }
  }
}

// 2. Add Phase 1 historical context to existing tasks
content = content.replace(/phase:\s*"Phase 1",/g, 'phase: "Phase 1", deliveryContext: "Historical Foundation",');

// 3. New Phase 2, Phase 3, Risk, Scope, Milestone items.
const newTasks = `  {
    id: "p2-approval-workflow",
    task: "Establish Approval Workflows",
    category: "Approval & Workflow",
    phase: "Phase 2",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Task",
    responsible: "Embark Digitals",
    priority: "High"
  },
  {
    id: "p2-consent-process",
    task: "Confirm Graduate Consent Process",
    category: "Approval & Workflow",
    phase: "Phase 2",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Task",
    responsible: "Embark Digitals",
    priority: "High"
  },
  {
    id: "p2-recruitment-boundaries",
    task: "Set Recruitment Communication Boundaries",
    category: "Approval & Workflow",
    phase: "Phase 2",
    status: "Not Started",
    deliveryContext: "Package 3 Review",
    recordType: "Deliverable",
    responsible: "Embark Digitals",
    priority: "High"
  },
  {
    id: "p3-social-media-management",
    task: "Ongoing Social Media Management",
    category: "Social Media",
    phase: "Phase 3",
    status: "Recurring — Active",
    deliveryContext: "Package 3 Review",
    recordType: "Recurring Activity",
    responsible: "Embark Digitals",
    priority: "High"
  },
  {
    id: "p3-content-production",
    task: "Content Production",
    category: "Content & Design",
    phase: "Phase 3",
    status: "Recurring — Active",
    deliveryContext: "Package 3 Review",
    recordType: "Recurring Activity",
    responsible: "Embark Digitals",
    priority: "High"
  },
  {
    id: "p3-testimonial-collection",
    task: "Testimonial Collection & Design",
    category: "Testimonials & Consent",
    phase: "Phase 3",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Task",
    responsible: "Embark Digitals",
    priority: "Medium"
  },
  {
    id: "risk-delayed-approvals",
    task: "Delayed Approvals on Content",
    category: "Approval & Workflow",
    phase: "Phase 3",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Risk",
    responsible: "Client Team",
    priority: "High"
  },
  {
    id: "risk-graduate-availability",
    task: "Graduate Availability for Testimonials",
    category: "Testimonials & Consent",
    phase: "Phase 3",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Risk",
    responsible: "Client Team",
    priority: "Medium"
  },
  {
    id: "milestone-package3-continuation-review",
    task: "Package 3 Continuation Review",
    category: "Programme Review",
    phase: "Phase 3",
    status: "In Progress",
    deliveryContext: "Package 3 Review",
    recordType: "Approval Gate",
    responsible: "Client Team",
    priority: "High",
    approvalStatus: "Awaiting Approval",
    notes: "Package 3 one-month review period. At end of review, client decides: Continue Package 3 / Adjust Scope / Move to lighter arrangement. Record decision via note_type = decision_recorded. Do not update programme_review_outcome until client decides."
  },
  {
    id: "scope-crm-system",
    task: "CRM / Applicant Tracking System",
    category: "Future Systems",
    phase: "Separate Scope",
    status: "Separate Scope",
    deliveryContext: "Future / Separate Scope",
    recordType: "Context",
    responsible: "Embark Digitals",
    priority: "Low"
  },
  {
    id: "scope-graduate-management",
    task: "Graduate Management System",
    category: "Future Systems",
    phase: "Separate Scope",
    status: "Separate Scope",
    deliveryContext: "Future / Separate Scope",
    recordType: "Context",
    responsible: "Embark Digitals",
    priority: "Low"
  }`;

// Insert the new tasks at the end of the tasks array
content = content.replace(/];\s*export const scopeItems/, `,${newTasks}\n];\n\nexport const scopeItems`);

// 4. Update futurePhaseItems
content = content.replace(/export const futurePhaseItems = {[\s\S]*?};/, `export const futurePhaseItems = {
  "Phase 2: Operating Foundations": [
    "Google Profile setup",
    "Meta Pixel integration",
    "Basic SEO hygiene (Tier 2)",
    "WhatsApp setup",
    "Comms structures (Tier 2)"
  ],
  "Separate Scope / Future Systems": [
    "Web form integration",
    "AI knowledge base build",
    "System build",
    "Graduate Management System",
    "AI-supported docs (Tier 3)",
    "AI marketing planning (Tier 3)",
    "System planning (Tier 3)",
    "SEO deeper execution (Tier 3)",
    "Comms structures (Tier 3)"
  ],
  "Separate Scope / Requires Separate Costing": [
    "AI video (Tier 3 concept / separate quote)",
    "Business plans (Tier 3 / separate quote)",
    "WhatsApp API (Phase 3 / separate quote)",
    "CRM/applicant tracking",
    "Dashboards and reporting systems",
    "Video production",
    "Paid advertising management"
  ],
};`);

fs.writeFileSync(trackerDataPath, content, 'utf8');
console.log('trackerData.js updated successfully.');
