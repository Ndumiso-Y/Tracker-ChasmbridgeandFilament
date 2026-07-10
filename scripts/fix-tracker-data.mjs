import fs from 'fs';
import path from 'path';

const trackerDataPath = path.resolve('./src/data/trackerData.js');
let content = fs.readFileSync(trackerDataPath, 'utf8');

// The block we accidentally added to launchChecklist
const errorTasksStr = `  {
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

// Remove from launchChecklist
content = content.replace(`,${errorTasksStr}\n];\n\nexport const scopeItems`, `\n];\n\nexport const scopeItems`);

// Add to tasks
content = content.replace(/];\s*export const phaseDeliverables/, `,\n${errorTasksStr}\n];\n\nexport const phaseDeliverables`);

fs.writeFileSync(trackerDataPath, content, 'utf8');
console.log('Fixed trackerData.js array placement.');
