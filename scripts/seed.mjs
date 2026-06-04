import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  tasks,
  phaseDeliverables,
  clientAssets,
  launchChecklist,
  scopeItems,
  retainerItems,
  retainerTiers,
  futurePhaseItems
} from "../src/data/trackerData.js";

// 1. Load env variables manually from .env if present
function loadEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    console.warn("No .env file found; using process.env directly.");
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.substring(0, index).trim();
    const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = val;
  });
}
loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment or .env file.");
  process.exit(1);
}

// Initialize Supabase with the admin/service_role client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function runSeed() {
  console.log("Seeding Supabase database...");

  // Seed tasks
  console.log("Seeding tasks...");
  const mappedTasks = tasks.map((t) => ({
    id: t.id,
    task: t.task,
    category: t.category,
    status: t.status,
    client_input: t.clientInput,
    notes: t.notes,
    next_action: t.nextAction,
    responsible: t.responsible,
    phase: t.phase,
    priority: t.priority,
    due_date: t.dueDate,
    edited_by: "seed"
  }));
  const { error: tasksErr } = await supabase.from("tasks").upsert(mappedTasks);
  if (tasksErr) throw new Error(`Tasks seeding failed: ${tasksErr.message}`);

  // Seed deliverables
  console.log("Seeding deliverables...");
  const mappedDeliverables = phaseDeliverables.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    included: d.included,
    not_included: d.notIncluded,
    status: d.status,
    notes: d.notes,
    client_input: d.clientInput,
    edited_by: "seed"
  }));
  const { error: delivsErr } = await supabase.from("deliverables").upsert(mappedDeliverables);
  if (delivsErr) throw new Error(`Deliverables seeding failed: ${delivsErr.message}`);

  // Seed client assets
  console.log("Seeding client assets...");
  const mappedAssets = clientAssets.map((a) => ({
    id: a.id,
    asset: a.asset,
    requirement: a.requirement,
    status: a.status,
    responsible: a.responsible,
    notes: a.notes,
    due_date: a.dueDate,
    edited_by: "seed"
  }));
  const { error: assetsErr } = await supabase.from("client_assets").upsert(mappedAssets);
  if (assetsErr) throw new Error(`Client assets seeding failed: ${assetsErr.message}`);

  // Seed launch checklist items
  console.log("Seeding launch items...");
  const mappedChecklist = launchChecklist.map((c) => ({
    id: c.id,
    item: c.item,
    status: c.status,
    owner: c.owner,
    priority: c.priority,
    edited_by: "seed"
  }));
  const { error: launchErr } = await supabase.from("launch_items").upsert(mappedChecklist);
  if (launchErr) throw new Error(`Launch checklist seeding failed: ${launchErr.message}`);

  // Seed scope groups
  console.log("Seeding scope groups...");
  const mappedScope = scopeItems.map((s, index) => ({
    id: `scope-group-${index}`,
    label: s.label,
    items: s.items,
    tone: s.tone,
    edited_by: "seed"
  }));
  const { error: scopeErr } = await supabase.from("scope_groups").upsert(mappedScope);
  if (scopeErr) throw new Error(`Scope groups seeding failed: ${scopeErr.message}`);

  // Seed retainer items
  console.log("Seeding retainer items...");
  const mappedRetainerItems = retainerItems.map((item, index) => ({
    id: `ret-item-${index}`,
    item: item,
    edited_by: "seed"
  }));
  const { error: retItemsErr } = await supabase.from("retainer_items").upsert(mappedRetainerItems);
  if (retItemsErr) throw new Error(`Retainer items seeding failed: ${retItemsErr.message}`);

  // Seed retainer tiers
  console.log("Seeding retainer tiers...");
  const mappedRetainerTiers = retainerTiers.map((t, index) => ({
    id: `ret-tier-${index}`,
    name: t.name,
    price: t.price,
    recommended: t.recommended,
    description: t.description,
    edited_by: "seed"
  }));
  const { error: retTiersErr } = await supabase.from("retainer_tiers").upsert(mappedRetainerTiers);
  if (retTiersErr) throw new Error(`Retainer tiers seeding failed: ${retTiersErr.message}`);

  // Seed future phase items
  console.log("Seeding future phase items...");
  const mappedFutureItems = Object.entries(futurePhaseItems).map(([phaseName, items], index) => ({
    id: `future-phase-${index}`,
    phase_name: phaseName,
    items: items,
    edited_by: "seed"
  }));
  const { error: futureErr } = await supabase.from("future_phase_items").upsert(mappedFutureItems);
  if (futureErr) throw new Error(`Future phase items seeding failed: ${futureErr.message}`);

  console.log("Database seeding completed successfully!");
}

runSeed().catch((err) => {
  console.error("Seeding failed with error:", err.message);
  process.exit(1);
});
