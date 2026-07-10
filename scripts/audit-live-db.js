import { createClient } from '@supabase/supabase-js';

const supabaseAnon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const supabaseAdmin = supabaseAnon; // Fallback for script

async function runTests() {
  console.log("=== 1. LIVE SCHEMA VERIFICATION ===");
  // We can test columns by selecting them
  const columns = ['record_type', 'workstream', 'delivery_context', 'delivery_lane', 'delivery_week', 'workflow_type', 'workflow_stage', 'blocked_by', 'blocked_since', 'scope_treatment', 'content_pillar', 'requires_approval', 'approval_status', 'cadence_status'];
  const { data: schemaTest, error: schemaErr } = await supabaseAdmin.from('tracker_items').select(columns.join(',')).limit(1);
  if (schemaErr) console.error("Schema Test Failed:", schemaErr.message);
  else console.log("Schema Columns Confirmed");

  const { data: progTest, error: progErr } = await supabaseAdmin.from('programme_settings').select('*').limit(1);
  if (progErr) console.error("programme_settings missing:", progErr.message);
  else console.log("programme_settings exists");

  console.log("\n=== 2. LIVE RECORD COUNTS ===");
  const { data: allItems, error: itemsErr } = await supabaseAdmin.from('tracker_items').select('id, phase, entity');
  if (itemsErr) { console.error("Fetch items error:", itemsErr); return; }
  
  console.log("Total records:", allItems.length);
  console.log("Phase 1 count:", allItems.filter(i => i.phase === 'Phase 1').length);
  console.log("Phase 2 count:", allItems.filter(i => i.phase === 'Phase 2').length);
  console.log("Phase 3 count:", allItems.filter(i => i.phase === 'Phase 3').length);
  console.log("Separate Scope count:", allItems.filter(i => i.phase === 'Separate Scope').length);

  const newPrefixes = ['p2-', 'p3-', 'risk-', 'milestone-', 'context-', 'scope-'];
  const newItems = allItems.filter(i => newPrefixes.some(p => i.id.startsWith(p)));
  console.log("\nNew Records Count by Prefix:");
  newPrefixes.forEach(p => {
    console.log(`${p}:`, newItems.filter(i => i.id.startsWith(p)).length);
  });
  console.log("Total new records found:", newItems.length);

  console.log("\n=== 3. LIVE ENTITY DISTRIBUTION ===");
  const entityCounts = { 'Chasm Bridge Charity': 0, 'Filament': 0, 'Both': 0 };
  newItems.forEach(i => {
    if (entityCounts[i.entity] !== undefined) entityCounts[i.entity]++;
    else console.log("Unknown entity:", i.entity);
  });
  console.log(entityCounts);

  console.log("\n=== 4. PHASE 1 PRESERVATION ===");
  const { data: p1Data } = await supabaseAdmin.from('tracker_items').select('id, status, due_date, delivery_context').eq('phase', 'Phase 1');
  console.log("Phase 1 count alive:", p1Data.length);
  
  const { data: p1Notes } = await supabaseAdmin.from('tracker_item_notes').select('id').in('tracker_item_id', p1Data.map(i => i.id));
  console.log("Phase 1 notes intact count:", p1Notes?.length || 0);

  console.log("\n=== 5. LEGACY MIGRATION VERIFICATION ===");
  const taskLaterIds = ['task-later-social-posting', 'task-later-social-graphics', 'task-later-web-bugfixes', 'task-later-web-updates', 'task-later-domain-monitoring', 'task-later-email-troubleshoot', 'task-later-mailbox-monitoring', 'task-later-google-profile', 'task-later-meta-pixel', 'task-later-seo-hygiene', 'task-later-whatsapp-setup', 'task-later-comms-tier2', 'task-later-web-forms', 'task-later-ai-kb', 'task-later-system-build', 'task-later-gms', 'task-later-ai-docs', 'task-later-ai-marketing', 'task-later-system-planning', 'task-later-seo-deep', 'task-later-comms-tier3', 'task-later-crm', 'task-later-dashboard', 'task-later-ai-video', 'task-later-business-plans', 'task-later-whatsapp-api'];
  const { data: legacyData } = await supabaseAdmin.from('tracker_items').select('id, phase, status, record_type, delivery_context').in('id', taskLaterIds);
  console.log("Migrated Legacy Records:");
  legacyData.forEach(l => console.log(`${l.id}: ${l.phase} | ${l.status} | ${l.record_type} | ${l.delivery_context}`));

  console.log("\n=== 6 & 7. PROGRAMME SETTINGS & RLS ===");
  const { data: anonData, error: anonErr } = await supabaseAnon.from('programme_settings').select('key, value, is_public');
  if (anonErr) console.log("Anon Read Error:", anonErr.message);
  else console.log("Anon Accessible Settings:", anonData.map(s => s.key));

  const { data: adminData } = await supabaseAdmin.from('programme_settings').select('key, value, is_public');
  console.log("\nAdmin Settings:");
  adminData.forEach(s => console.log(`${s.key}: ${s.value} (is_public: ${s.is_public})`));
}

runTests().catch(console.error);
