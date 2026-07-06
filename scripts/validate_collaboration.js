import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validate() {
  console.log("Starting Client Collaboration V4A validation...");
  const errors = [];

  // 1. Check SQL exists
  const sqlPath = path.join(__dirname, '../supabase/collaboration_layer_schema.sql');
  if (!fs.existsSync(sqlPath)) {
    errors.push("Missing collaboration_layer_schema.sql");
  } else {
    const sqlContent = fs.readFileSync(sqlPath, 'utf8').toLowerCase();
    if (!sqlContent.includes('create table if not exists client_input_requests')) {
      errors.push("Missing client_input_requests in SQL schema");
    }
  }

  // 2. Check React views
  const requiredViews = [
    'ClientInputRequirements.jsx',
    'SupportIssues.jsx',
    'WeeklyDeliveryReview.jsx',
    'Login.jsx'
  ];

  for (const view of requiredViews) {
    if (!fs.existsSync(path.join(__dirname, `../src/views/${view}`))) {
      errors.push(`Missing React view: ${view}`);
    }
  }

  // 3. Check App.jsx routing
  const appJsx = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
  if (!appJsx.includes('import ClientInputRequirements')) {
    errors.push("App.jsx is missing ClientInputRequirements import");
  }

  // 4. Check Template Options in Seed
  const seedPath = path.join(__dirname, '../supabase/seed_v4a_templates.sql');
  if (fs.existsSync(seedPath)) {
    const seedContent = fs.readFileSync(seedPath, 'utf8');
    const valuesMatches = seedContent.match(/\(.*?template-.*?\)/g) || [];
    valuesMatches.forEach(val => {
      if (val.includes("'Select'") || val.includes("'Checklist'")) {
        const jsonMatch = val.match(/'(\[.*?\])'::jsonb/);
        if (!jsonMatch) {
           errors.push(`Select/Checklist section missing controlled_options: ${val}`);
        } else {
           try {
             const parsed = JSON.parse(jsonMatch[1]);
             if (!Array.isArray(parsed) || parsed.length === 0) {
               errors.push(`Select/Checklist must have at least one valid option: ${val}`);
             }
           } catch (e) {
             errors.push(`Invalid JSON in controlled_options: ${val}`);
           }
        }
      }
    });
  }

  // 5. Tier 3 SQL tracker_items INSERT contract check
  const tier3SqlPath = path.join(__dirname, '../supabase/tier3_reclassification_schema.sql');
  if (fs.existsSync(tier3SqlPath)) {
    const tier3Sql = fs.readFileSync(tier3SqlPath, 'utf8');
    const physicalColumns = [
      'id', 'title', 'entity', 'phase', 'category', 'status', 'priority', 'owner_label',
      'due_date', 'description', 'next_action', 'notes', 'is_public', 'sort_order',
      'created_at', 'updated_at', 'last_changed_by', 'last_changed_at', 'record_type',
      'workstream', 'delivery_context', 'delivery_lane', 'delivery_week', 'workflow_type',
      'workflow_stage', 'blocked_by', 'blocked_since', 'scope_treatment', 'content_pillar',
      'requires_approval', 'approval_status', 'cadence_status'
    ];
    const insertMatch = tier3Sql.match(/INSERT INTO tracker_items\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/i);
    if (insertMatch) {
      const cols = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
      cols.forEach(col => {
        if (!physicalColumns.includes(col)) {
          errors.push(`Tier 3 SQL attempts to INSERT into nonexistent column: ${col}`);
        }
      });
      
      const valuesStr = insertMatch[2];
      const values = valuesStr.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      
      const getValue = (colName) => {
        const idx = cols.indexOf(colName.toLowerCase());
        return idx !== -1 ? values[idx] : undefined;
      };

      if (getValue('id') !== 'decision-tier3-activation') {
        errors.push(`Missing decision-tier3-activation id in Tier 3 Decision INSERT`);
      }
      if (getValue('phase') !== 'Phase 3') errors.push(`Semantic defect: Tier 3 Decision phase must be 'Phase 3', got '${getValue('phase')}'`);
      if (getValue('status') !== 'Done') errors.push(`Semantic defect: Tier 3 Decision status must be 'Done', got '${getValue('status')}'`);
      if (getValue('delivery_context') !== 'Tier 3 Active Delivery') errors.push(`Semantic defect: Tier 3 Decision delivery_context must be 'Tier 3 Active Delivery', got '${getValue('delivery_context')}'`);
      if (getValue('record_type') !== 'Decision') errors.push(`Semantic defect: Tier 3 Decision record_type must be 'Decision', got '${getValue('record_type')}'`);
      if (getValue('scope_treatment') !== 'Current Delivery') errors.push(`Semantic defect: Tier 3 Decision scope_treatment must be 'Current Delivery', got '${getValue('scope_treatment')}'`);
      if (getValue('requires_approval') !== 'false') errors.push(`Semantic defect: Tier 3 Decision requires_approval must be false, got '${getValue('requires_approval')}'`);
    } else {
      errors.push(`Could not parse Tier 3 SQL INSERT INTO tracker_items statement`);
    }
  }

  if (errors.length > 0) {
    console.error("❌ Validation Failed. Errors:");
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log("✅ V4A Client Collaboration validation passed. All schemas and views present.");
    process.exit(0);
  }
}

validate();
