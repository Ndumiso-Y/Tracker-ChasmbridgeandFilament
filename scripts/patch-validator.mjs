import fs from 'fs';
import path from 'path';

const validatorPath = path.resolve('./scripts/validate-delivery-data.mjs');
let content = fs.readFileSync(validatorPath, 'utf8');

const testSuite = `
import { calculatePhase3DeliveryHealth, getDaysOverdue } from "../src/utils/health.js";

// Health logic tests
const today = new Date('2026-07-05T12:00:00Z'); // Fixed test date

function testHealth(scenario, tasks, expected) {
  const result = calculatePhase3DeliveryHealth(tasks, today);
  if (result !== expected) {
    addError(\`Health Test Failed: \${scenario} -> Expected \${expected}, got \${result}\`);
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
`;

if (!content.includes('calculatePhase3DeliveryHealth')) {
  // Add tests before the end logic
  content = content.replace('if (phases.includes("Package 3"))', testSuite + '\nif (phases.includes("Package 3"))');
  fs.writeFileSync(validatorPath, content, 'utf8');
  console.log("Validator patched");
}
