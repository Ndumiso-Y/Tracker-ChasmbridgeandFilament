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
