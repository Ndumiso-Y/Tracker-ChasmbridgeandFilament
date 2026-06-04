// scripts/generate-seed-sql.mjs
import fs from "fs";
import path from "path";
import {
  tasks,
  phaseDeliverables,
  clientAssets,
  launchChecklist
} from "../src/data/trackerData.js";

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

function formatDate(str) {
  if (!str) return "NULL";
  // Matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `'${str}'`;
  }
  return "NULL";
}

function getEntity(id, title) {
  const checkStr = (id + " " + title).toLowerCase();
  if (checkStr.includes("chasm bridge charity") || checkStr.includes("cbc")) {
    return "Chasm Bridge Charity";
  }
  if (checkStr.includes("filament")) {
    return "Filament";
  }
  return "Both";
}

let sql = `-- seed.sql\n-- Seed initial tracker items based on Phase 1 scope\n\n`;
sql += `truncate table tracker_items cascade;\n\n`;
sql += `insert into tracker_items (id, title, entity, phase, category, status, priority, owner_label, due_date, description, next_action, notes, is_public, sort_order)\nvalues\n`;

const values = [];
let sortOrder = 1;

// 1. Map Tasks
tasks.forEach((t) => {
  const entity = getEntity(t.id, t.task);
  values.push(`  (${escapeSql(t.id)}, ${escapeSql(t.task)}, ${escapeSql(entity)}, ${escapeSql(t.phase)}, ${escapeSql(t.category)}, ${escapeSql(t.status)}, ${escapeSql(t.priority)}, ${escapeSql(t.responsible)}, ${formatDate(t.dueDate)}, ${escapeSql(t.clientInput)}, ${escapeSql(t.nextAction)}, ${escapeSql(t.notes)}, true, ${sortOrder++})`);
});

// 2. Map Deliverables
phaseDeliverables.forEach((d) => {
  const entity = getEntity(d.id, d.title);
  // Deliverable has: description, notes, clientInput (next_action)
  values.push(`  (${escapeSql(d.id)}, ${escapeSql(d.title)}, ${escapeSql(entity)}, 'Phase 1', 'Deliverables', ${escapeSql(d.status)}, NULL, NULL, NULL, ${escapeSql(d.description)}, ${escapeSql(d.clientInput)}, ${escapeSql(d.notes)}, true, ${sortOrder++})`);
});

// 3. Map Client Assets
clientAssets.forEach((a) => {
  const entity = getEntity(a.id, a.asset);
  // Client asset has: requirement (stored as priority), notes, due_date
  values.push(`  (${escapeSql(a.id)}, ${escapeSql(a.asset)}, ${escapeSql(entity)}, 'Phase 1', 'Client Assets', ${escapeSql(a.status)}, ${escapeSql(a.requirement)}, ${escapeSql(a.responsible)}, ${formatDate(a.dueDate)}, NULL, NULL, ${escapeSql(a.notes)}, true, ${sortOrder++})`);
});

// 4. Map Launch Checklist
launchChecklist.forEach((c) => {
  const entity = getEntity(c.id, c.item);
  // Checklist item has: status, owner, priority
  values.push(`  (${escapeSql(c.id)}, ${escapeSql(c.item)}, ${escapeSql(entity)}, 'Phase 1', 'Launch Readiness', ${escapeSql(c.status)}, ${escapeSql(c.priority)}, ${escapeSql(c.owner)}, NULL, NULL, NULL, NULL, true, ${sortOrder++})`);
});

sql += values.join(",\n") + ";\n";

fs.writeFileSync(path.resolve("supabase/seed.sql"), sql, "utf8");
console.log("SQL seed file successfully generated at supabase/seed.sql!");
