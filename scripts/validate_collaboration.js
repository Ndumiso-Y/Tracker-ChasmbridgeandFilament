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

  // 6. Weekly Review assignment/lifecycle contract (V4A.2) — static checks only.
  // This cannot prove RLS runtime behaviour; it only confirms the migration
  // file exists and the frontend/migration reference the same lifecycle
  // contract consistently.
  const weeklyMigrationPath = path.join(__dirname, '../supabase/weekly_review_assignment_workflow.sql');
  if (!fs.existsSync(weeklyMigrationPath)) {
    errors.push("Missing supabase/weekly_review_assignment_workflow.sql migration");
  } else {
    const migrationSql = fs.readFileSync(weeklyMigrationPath, 'utf8');
    const REVIEW_STATUSES = ['Awaiting Client Review', 'Submitted', 'Reviewed'];

    REVIEW_STATUSES.forEach(status => {
      if (!migrationSql.includes(status)) {
        errors.push(`Weekly review migration is missing lifecycle status: ${status}`);
      }
    });

    if (!migrationSql.includes('assigned_contributor_user_id')) {
      errors.push("Weekly review migration does not add assigned_contributor_user_id");
    }

    if (!/ALTER COLUMN overall_delivery DROP NOT NULL/i.test(migrationSql)) {
      errors.push("Weekly review migration does not relax overall_delivery to allow a genuinely pending (unrated) review");
    }

    const bannedPlaceholders = [`overall_delivery = '0'`, `overall_delivery = 'Pending'`, `overall_delivery = 'N/A'`];
    bannedPlaceholders.forEach(p => {
      if (migrationSql.includes(p)) {
        errors.push(`Weekly review migration uses a fabricated placeholder rating: ${p}`);
      }
    });

    if (/DROP TABLE|TRUNCATE|DELETE FROM weekly_delivery_reviews|DELETE FROM weekly_review_feedback_items/i.test(migrationSql)) {
      errors.push("Weekly review migration contains a destructive operation against review data");
    }

    const weeklyReviewJsxPath = path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx');
    if (fs.existsSync(weeklyReviewJsxPath)) {
      const weeklyJsx = fs.readFileSync(weeklyReviewJsxPath, 'utf8');
      REVIEW_STATUSES.forEach(status => {
        if (!weeklyJsx.includes(status)) {
          errors.push(`WeeklyDeliveryReview.jsx does not reference lifecycle status: ${status}`);
        }
      });
      if (!weeklyJsx.includes('assigned_contributor_user_id')) {
        errors.push("WeeklyDeliveryReview.jsx does not reference assigned_contributor_user_id");
      }
    } else {
      errors.push("Missing src/views/WeeklyDeliveryReview.jsx");
    }
  }

  // 7. Client Input internal creation (locked operator model, V4A.4): the
  // historical no-session Active Editor workflow is now the approved path
  // for "New Input Request" — it must require selectedAuthorId and go
  // through the narrow create_internal_client_input_request RPC, never a
  // direct authenticated-admin-only insert.
  const clientInputJsxPath = path.join(__dirname, '../src/views/ClientInputRequirements.jsx');
  if (fs.existsSync(clientInputJsxPath)) {
    const clientInputJsx = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!/handleCreateRequest[\s\S]{0,400}!selectedAuthorId/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx internal request creation does not appear to require selectedAuthorId");
    }
    if (!clientInputJsx.includes('createInternalClientInputRequest')) {
      errors.push("ClientInputRequirements.jsx does not call the narrow create_internal_client_input_request RPC");
    }

    // 7b. New Input Request UX correction (V4A.5): the operator-facing
    // request-type picker must no longer expose the technical word
    // "Template" as its main label, the template architecture itself must
    // remain (template_id, live template records), assigned contributor
    // must no longer be a hard client-side requirement, the selected
    // Active Editor must never be sent as the assigned contributor, and the
    // deferred-attachments notice must be present (no real upload).
    if (/<label[^>]*>\s*Template\s*(<|\{)/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx still exposes the raw 'Template' label to the operator");
    }
    if (!clientInputJsx.includes('What do you need from the client?')) {
      errors.push("ClientInputRequirements.jsx is missing the operator-facing request-type label");
    }
    if (!clientInputJsx.includes('templateId')) {
      errors.push("ClientInputRequirements.jsx no longer references the template_id architecture");
    }
    if (/title\.trim\(\)[\s\S]{0,40}templateId[\s\S]{0,40}contributorUserId/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx still requires an assigned contributor at creation — it must be optional");
    }
    if (/contributorUserId:\s*selectedAuthorId/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx appears to map the selected Active Editor to the assigned contributor — these must remain separate identities");
    }
    if (!clientInputJsx.includes('V4A.1')) {
      errors.push("ClientInputRequirements.jsx is missing the V4A.1 Supporting Evidence Attachments deferred notice");
    }
    if (/Supabase\.storage|createSignedUrl|uploadFile|\.storage\.from\(/i.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx appears to implement a real file upload — attachments remain deferred to V4A.1");
    }

    // 7d. Later Contributor Assignment (V4A.6): must exist, must be gated
    // behind the internal operator, must require an Active Editor, and must
    // never expose assignment controls to a real client contributor session.
    if (!/Assign Contributor|Change Contributor/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx is missing the later contributor assignment action");
    }
    if (!/canOperateInternally &&[\s\S]{0,2000}(Assign Contributor|Change Contributor|showAssignPicker|handleOpenAssignPicker)/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx does not appear to gate contributor assignment controls behind the internal operator");
    }
    if (!/handleAssignContributor[\s\S]{0,200}!selectedAuthorId/.test(clientInputJsx)) {
      errors.push("ClientInputRequirements.jsx contributor assignment does not appear to require selectedAuthorId");
    }
    if (!clientInputJsx.includes('assignInternalClientInputContributor')) {
      errors.push("ClientInputRequirements.jsx does not call the narrow assign_internal_client_input_contributor RPC");
    }
    if (!clientInputJsx.includes('getInternalActiveClientContributors')) {
      errors.push("ClientInputRequirements.jsx does not load the active contributor list via the narrow read-only RPC");
    }
  }

  // 7c. The internal-operator RPC itself must not hard-require a
  // contributor (contract mirrors the frontend correction above).
  const internalOpMigrationPathForClientInput = path.join(__dirname, '../supabase/internal_operator_creation_workflow.sql');
  if (fs.existsSync(internalOpMigrationPathForClientInput)) {
    const opSqlForClientInput = fs.readFileSync(internalOpMigrationPathForClientInput, 'utf8');
    const clientInputFnMatch = opSqlForClientInput.match(/CREATE OR REPLACE FUNCTION create_internal_client_input_request[\s\S]*?\$\$;/);
    if (clientInputFnMatch) {
      const fnBody = clientInputFnMatch[0];
      if (/An assigned client contributor is required/.test(fnBody)) {
        errors.push("create_internal_client_input_request still hard-requires an assigned contributor — it must be optional");
      }
      if (!/p_assigned_contributor_user_id\s+uuid/.test(fnBody)) {
        errors.push("create_internal_client_input_request signature is missing p_assigned_contributor_user_id uuid");
      }
    } else {
      errors.push("Could not locate create_internal_client_input_request in internal_operator_creation_workflow.sql");
    }
  }

  // 8. Active Editor logic must remain untouched by this collaboration work.
  const appJsxForEditor = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
  if (!appJsxForEditor.includes('showActiveEditor') || !appJsxForEditor.includes('selectedAuthorId')) {
    errors.push("App.jsx Active Editor logic (showActiveEditor/selectedAuthorId) appears to be missing or altered");
  }

  // 9. Delivery Assurance Operational Fields (V4A.3) — static checks only.
  const operationalFieldsPath = path.join(__dirname, '../supabase/delivery_assurance_operational_fields.sql');
  if (!fs.existsSync(operationalFieldsPath)) {
    errors.push("Missing supabase/delivery_assurance_operational_fields.sql migration");
  } else {
    const opSql = fs.readFileSync(operationalFieldsPath, 'utf8');
    const URGENCY_VALUES = ['Normal', 'Time Sensitive', 'Urgent'];

    if (!opSql.includes('client_reported_urgency')) {
      errors.push("delivery_assurance_operational_fields.sql does not add client_reported_urgency");
    }
    URGENCY_VALUES.forEach(v => {
      if (!opSql.includes(v)) errors.push(`delivery_assurance_operational_fields.sql is missing urgency value: ${v}`);
    });
    // Client urgency must stay distinct from Embark's internal tracker priority —
    // this migration must never touch tracker_items.priority.
    if (/ALTER TABLE tracker_items[\s\S]{0,200}priority/i.test(opSql)) {
      errors.push("delivery_assurance_operational_fields.sql appears to modify tracker_items.priority — client urgency must remain separate from delivery priority");
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM support_tickets|DELETE FROM client_input_requests/i.test(opSql)) {
      errors.push("delivery_assurance_operational_fields.sql contains a destructive operation");
    }

    // issue_type must be consistent between the DB CHECK and the frontend
    // options — a mismatch would let the UI offer a value the insert rejects.
    const ISSUE_TYPE_VALUES = ['Task-Linked Issue', 'Standalone Issue'];
    ISSUE_TYPE_VALUES.forEach(v => {
      if (!opSql.includes(v)) errors.push(`delivery_assurance_operational_fields.sql is missing issue_type value: ${v}`);
    });
    const supportJsxForIssueType = path.join(__dirname, '../src/views/SupportIssues.jsx');
    if (fs.existsSync(supportJsxForIssueType)) {
      const supportJsx = fs.readFileSync(supportJsxForIssueType, 'utf8');
      ISSUE_TYPE_VALUES.forEach(v => {
        if (!supportJsx.includes(v)) errors.push(`SupportIssues.jsx is missing issue_type value: ${v}`);
      });
    }
  }

  // 10. Weekly review <-> tracker item relation must be a real junction
  // table, never comma-separated ids on weekly_delivery_reviews.
  if (fs.existsSync(weeklyMigrationPath)) {
    const migrationSql = fs.readFileSync(weeklyMigrationPath, 'utf8');
    if (!/CREATE TABLE IF NOT EXISTS weekly_review_tracker_items/i.test(migrationSql)) {
      errors.push("weekly_review_assignment_workflow.sql does not define the weekly_review_tracker_items junction table");
    }
  }
  const weeklyReviewJsxPath2 = path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx');
  if (fs.existsSync(weeklyReviewJsxPath2)) {
    const weeklyJsx = fs.readFileSync(weeklyReviewJsxPath2, 'utf8');
    if (/tracker_item_ids?\s*:\s*.*\.join\(/.test(weeklyJsx)) {
      errors.push("WeeklyDeliveryReview.jsx appears to encode linked tracker items as a comma-separated string instead of using the junction table");
    }
    if (!weeklyJsx.includes('linkReviewTrackerItem')) {
      errors.push("WeeklyDeliveryReview.jsx does not call linkReviewTrackerItem — task/deliverable linkage appears unwired");
    }
    // One-time submission freeze: the client edit form must gate on the
    // review still being in the pending status.
    if (!/isMyPendingReview[\s\S]{0,400}review_status === 'Awaiting Client Review'/.test(weeklyJsx)) {
      errors.push("WeeklyDeliveryReview.jsx does not appear to gate the client submission form on review_status === 'Awaiting Client Review'");
    }
  }

  // 11. Support & Issues create action (locked operator model, V4A.4): the
  // internal no-session Active Editor path must require selectedAuthorId
  // and go through the narrow create_internal_support_issue RPC; the
  // authenticated client_contributor path must remain on its existing
  // direct RLS-guarded insert (createTicket) — both must coexist, not be
  // replaced by one another.
  const supportJsxPath = path.join(__dirname, '../src/views/SupportIssues.jsx');
  if (fs.existsSync(supportJsxPath)) {
    const supportJsx = fs.readFileSync(supportJsxPath, 'utf8');
    if (!/isInternalOperator\s*&&\s*!selectedAuthorId/.test(supportJsx)) {
      errors.push("SupportIssues.jsx internal issue creation does not appear to require selectedAuthorId");
    }
    if (!supportJsx.includes('createInternalSupportIssue')) {
      errors.push("SupportIssues.jsx does not call the narrow create_internal_support_issue RPC");
    }
    if (!supportJsx.includes('collaborationService.createTicket(')) {
      errors.push("SupportIssues.jsx no longer preserves the authenticated client_contributor ticket creation flow (createTicket)");
    }
    if (!supportJsx.includes('linked_tracker_item_id')) {
      errors.push("SupportIssues.jsx does not use the existing linked_tracker_item_id relation for issue-to-task provenance");
    }
    // The issue→delivery disposition micro-workflow was retired with the
    // simplified ticket intake (V4A.14): its frontend handlers/state must
    // stay removed (dead code), while the createFollowUpTask service
    // capability itself is retained for future wiring.
    ['handleCreateFollowUp', 'handleLinkExisting', 'handleNoTaskRequired', 'deliveryActionMode'].forEach(dead => {
      if (supportJsx.includes(dead)) {
        errors.push(`SupportIssues.jsx still contains the retired dead disposition workflow: ${dead}`);
      }
    });
    const serviceJsForFollowUp = fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8');
    if (!/createFollowUpTask\(/.test(serviceJsForFollowUp)) {
      errors.push("collaborationService.js no longer retains the createFollowUpTask server capability");
    }
  }

  // 12. Weekly Review "Open Weekly Review" (locked operator model, V4A.4):
  // internal no-session path requires selectedAuthorId and uses the narrow
  // open_internal_weekly_review RPC; the authenticated client_contributor
  // review-submission path (createReview/updateReview) must remain intact.
  if (fs.existsSync(weeklyReviewJsxPath2)) {
    const weeklyJsx = fs.readFileSync(weeklyReviewJsxPath2, 'utf8');
    if (!/isInternalOperator\s*&&\s*!selectedAuthorId/.test(weeklyJsx)) {
      errors.push("WeeklyDeliveryReview.jsx internal review opening does not appear to require selectedAuthorId");
    }
    if (!weeklyJsx.includes('openInternalWeeklyReview')) {
      errors.push("WeeklyDeliveryReview.jsx does not call the narrow open_internal_weekly_review RPC");
    }
    if (!weeklyJsx.includes('collaborationService.createReview(')) {
      errors.push("WeeklyDeliveryReview.jsx no longer preserves the authenticated client_contributor review path (createReview)");
    }
  }

  // 12b. Add Delivery Item (Task Command Center, locked operator model,
  // V4A.4): requires selectedAuthorId and uses the narrow
  // create_internal_delivery_item RPC via App.jsx's handleCreateDeliveryItem.
  const taskCommandCenterPath = path.join(__dirname, '../src/views/TaskCommandCenter.jsx');
  if (fs.existsSync(taskCommandCenterPath)) {
    const tccJsx = fs.readFileSync(taskCommandCenterPath, 'utf8');
    if (!/handleCreateDeliveryItem[\s\S]{0,300}!selectedAuthorId/.test(tccJsx)) {
      errors.push("TaskCommandCenter.jsx 'Add Delivery Item' does not appear to require selectedAuthorId");
    }
  }
  if (!appJsxForEditor.includes('createInternalDeliveryItem')) {
    errors.push("App.jsx does not call the narrow create_internal_delivery_item RPC for Add Delivery Item");
  }

  // 13. Delivery Board must mutate through the shared tracker_items path
  // (the onUpdateTask prop), never a direct/duplicate Supabase write.
  const deliveryBoardPath = path.join(__dirname, '../src/views/DeliveryBoard.jsx');
  if (fs.existsSync(deliveryBoardPath)) {
    const deliveryBoardJsx = fs.readFileSync(deliveryBoardPath, 'utf8');
    if (/from\s+['"]\.\.\/lib\/supabase['"]/.test(deliveryBoardJsx)) {
      errors.push("DeliveryBoard.jsx imports the Supabase client directly — execution controls must mutate only through the shared onUpdateTask/tracker_items path");
    }
    if (!deliveryBoardJsx.includes('onUpdateTask')) {
      errors.push("DeliveryBoard.jsx quick execution controls do not appear to use the shared onUpdateTask mutation path");
    }
  }

  // 14. Internal Operator Creation Workflow Bridge (V4A.4) — the narrow
  // SECURITY DEFINER RPC bridge for the four approved internal-operator
  // creation actions. Static checks only; cannot prove runtime RLS/grant
  // behaviour — that requires a live Supabase test after Ndumiso runs the
  // migration.
  const internalOpMigrationPath = path.join(__dirname, '../supabase/internal_operator_creation_workflow.sql');
  if (!fs.existsSync(internalOpMigrationPath)) {
    errors.push("Missing supabase/internal_operator_creation_workflow.sql migration");
  } else {
    const opSql = fs.readFileSync(internalOpMigrationPath, 'utf8');
    // Structural checks below must ignore prose in "--" comments (the
    // migration's own explanatory text legitimately mentions terms like
    // "SECURITY DEFINER" and "FOR ALL" while describing what it does NOT
    // do, which would otherwise trip a naive substring/count check).
    const opSqlCode = opSql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const REQUIRED_FUNCTIONS = [
      'create_internal_delivery_item',
      'create_internal_support_issue',
      'create_internal_client_input_request',
      'open_internal_weekly_review',
      'assign_internal_client_input_contributor',
    ];
    // Auxiliary functions approved alongside the assignment bridge (V4A.6):
    // a trigger-compatibility override (not a creation RPC, no author param)
    // and a read-only reference-data helper. The helper DOES require an
    // Active Editor id (V4A.8) even though it mutates nothing — every
    // function in this bridge stays attributed, no anonymous reads.
    const AUXILIARY_FUNCTIONS = ['protect_request_columns', 'get_internal_active_client_contributors'];
    const AUTHOR_VALIDATED_AUXILIARY_FUNCTIONS = ['get_internal_active_client_contributors'];

    REQUIRED_FUNCTIONS.forEach(fn => {
      if (!opSql.includes(`FUNCTION ${fn}(`)) {
        errors.push(`internal_operator_creation_workflow.sql is missing function: ${fn}`);
      }
      if (!new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\)\\s+TO anon, authenticated`).test(opSql)) {
        errors.push(`internal_operator_creation_workflow.sql does not grant EXECUTE on ${fn} to anon, authenticated`);
      }
      if (!new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\)\\s+FROM PUBLIC`).test(opSql)) {
        errors.push(`internal_operator_creation_workflow.sql does not revoke default PUBLIC execute on ${fn}`);
      }
    });
    if (!opSql.includes(`FUNCTION ${AUXILIARY_FUNCTIONS[1]}(`)) {
      errors.push(`internal_operator_creation_workflow.sql is missing function: ${AUXILIARY_FUNCTIONS[1]}`);
    }
    if (!new RegExp(`GRANT EXECUTE ON FUNCTION ${AUXILIARY_FUNCTIONS[1]}\\([^)]*\\)\\s+TO anon, authenticated`).test(opSql)) {
      errors.push(`internal_operator_creation_workflow.sql does not grant EXECUTE on ${AUXILIARY_FUNCTIONS[1]} to anon, authenticated`);
    }
    if (!new RegExp(`REVOKE ALL ON FUNCTION ${AUXILIARY_FUNCTIONS[1]}\\([^)]*\\)\\s+FROM PUBLIC`).test(opSql)) {
      errors.push(`internal_operator_creation_workflow.sql does not revoke default PUBLIC execute on ${AUXILIARY_FUNCTIONS[1]}`);
    }

    // Exactly five approved bridge functions plus the two auxiliary
    // functions (trigger-compatibility override + read-only contributor
    // list helper) — no extra generic function slipped in.
    const createFunctionCount = (opSqlCode.match(/CREATE OR REPLACE FUNCTION/g) || []).length;
    const expectedFunctionCount = REQUIRED_FUNCTIONS.length + AUXILIARY_FUNCTIONS.length;
    if (createFunctionCount !== expectedFunctionCount) {
      errors.push(`internal_operator_creation_workflow.sql defines ${createFunctionCount} functions, expected exactly ${expectedFunctionCount}`);
    }

    // Every creation/mutation function, plus the contributor-list read
    // helper, must validate the supplied Active Editor id server-side
    // (protect_request_columns is exempt — it is a trigger, never called
    // directly, and takes no author id).
    // Column refs may be alias-qualified (e.g. "ua.id") — the contributor-
    // list helper MUST alias update_authors to avoid a display_name
    // ambiguity against its RETURNS TABLE(display_name) output column.
    const authorValidationCount = (opSqlCode.match(/FROM update_authors[\s\S]{0,60}WHERE (?:\w+\.)?id = p_author_id AND (?:\w+\.)?is_active = true/g) || []).length;
    const expectedAuthorValidationCount = REQUIRED_FUNCTIONS.length + AUTHOR_VALIDATED_AUXILIARY_FUNCTIONS.length;
    if (authorValidationCount !== expectedAuthorValidationCount) {
      errors.push("internal_operator_creation_workflow.sql does not validate an active update_authors id in every approved bridge function (including the contributor-list read helper)");
    }
    if (!/FUNCTION get_internal_active_client_contributors\(p_author_id text\)/.test(opSql)) {
      errors.push("get_internal_active_client_contributors is not signed with a required p_author_id text parameter");
    }

    const securityDefinerCount = (opSqlCode.match(/SECURITY DEFINER/g) || []).length;
    if (securityDefinerCount !== expectedFunctionCount) {
      errors.push("internal_operator_creation_workflow.sql does not apply SECURITY DEFINER to every approved/auxiliary function");
    }
    // search_path is pinned on every function anon/authenticated can call
    // directly. protect_request_columns is a BEFORE UPDATE trigger function,
    // never called directly by anon/authenticated, and its pre-existing
    // definition (collaboration_layer_schema.sql) never set search_path
    // either — this override intentionally preserves that, so it is exempt.
    const searchPathCount = (opSqlCode.match(/SET search_path = public/g) || []).length;
    if (searchPathCount !== REQUIRED_FUNCTIONS.length + 1) {
      errors.push("internal_operator_creation_workflow.sql does not pin a safe search_path on every directly-callable function");
    }

    // Generic-mutation safety net.
    if (/p_table|p_column|p_sql\b|EXECUTE\s+format|EXECUTE\s+'/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql appears to contain a generic/dynamic SQL execution pattern");
    }
    if (/CREATE (OR REPLACE )?FUNCTION\s+\w*(update|delete|mutate|exec)\w*\s*\(/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql appears to define a generic update/delete/exec function");
    }

    // Exactly one narrowly-scoped UPDATE is now approved: the contributor
    // assignment bridge. It must target client_input_requests and touch
    // only the three physical columns the task explicitly authorised — no
    // generic request UPDATE RPC.
    const updateStatements = opSqlCode.match(/UPDATE\s+\w+[\s\S]*?WHERE\s+id\s*=\s*p_request_id/g) || [];
    if (updateStatements.length !== 1) {
      errors.push(`internal_operator_creation_workflow.sql should contain exactly one narrowly-scoped UPDATE (contributor assignment), found ${updateStatements.length}`);
    } else {
      const stmt = updateStatements[0];
      if (!/^UPDATE\s+client_input_requests\s+SET/i.test(stmt)) {
        errors.push("internal_operator_creation_workflow.sql's approved UPDATE does not target client_input_requests");
      }
      const setClause = stmt.replace(/^UPDATE\s+\w+\s+SET/i, '').replace(/WHERE[\s\S]*$/i, '');
      const allowedColumns = ['assigned_contributor_user_id', 'status', 'updated_at'];
      const setColumns = [...setClause.matchAll(/(\w+)\s*=/g)].map(m => m[1]);
      const disallowedColumns = setColumns.filter(c => !allowedColumns.includes(c));
      if (disallowedColumns.length > 0) {
        errors.push(`internal_operator_creation_workflow.sql's approved UPDATE touches unexpected columns: ${disallowedColumns.join(', ')}`);
      }
    }
    if (/DELETE\s+FROM/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql performs a DELETE — approved functions must only INSERT/UPDATE the contributor assignment columns");
    }
    if (/FOR ALL/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql appears to add a public FOR ALL policy");
    }
    if (/DROP TABLE|TRUNCATE/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql contains a destructive operation");
    }

    // Delivery item creation must write attribution + Notes & History provenance.
    if (!/last_changed_by/.test(opSqlCode) || !/INSERT INTO tracker_item_notes/.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql delivery item creation does not appear to write last_changed_by/tracker_item_notes provenance");
    }

    // 14b. Later Contributor Assignment Bridge (V4A.6) — static checks only.
    const assignFnMatch = opSql.match(/CREATE OR REPLACE FUNCTION assign_internal_client_input_contributor[\s\S]*?\$\$;/);
    if (assignFnMatch) {
      const assignFnBody = assignFnMatch[0];
      if (!/user_access_profiles[\s\S]{0,120}role = 'client_contributor'[\s\S]{0,60}is_active = true/.test(assignFnBody)) {
        errors.push("assign_internal_client_input_contributor does not validate an active client_contributor profile");
      }
      if (!/INSERT INTO client_input_comments/.test(assignFnBody)) {
        errors.push("assign_internal_client_input_contributor does not record assignment provenance in client_input_comments");
      }
      if (!/set_config\('app\.internal_operator_bridge', 'true', true\)/.test(assignFnBody)) {
        errors.push("assign_internal_client_input_contributor does not signal protect_request_columns() via the internal_operator_bridge setting");
      }
      if (!/NOT IN \('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required'\)/.test(assignFnBody)) {
        errors.push("assign_internal_client_input_contributor does not restrict itself to the pre-submission lifecycle window");
      }
    } else {
      errors.push("Could not locate assign_internal_client_input_contributor in internal_operator_creation_workflow.sql");
    }

    if (!/current_setting\('app\.internal_operator_bridge', true\) = 'true'/.test(opSqlCode)) {
      errors.push("protect_request_columns() override does not recognise the internal_operator_bridge exemption used by the assignment RPC");
    }

    const contributorListFnMatch = opSql.match(/CREATE OR REPLACE FUNCTION get_internal_active_client_contributors[\s\S]*?\$\$;/);
    if (contributorListFnMatch) {
      const listFnBody = contributorListFnMatch[0];
      if (!/role = 'client_contributor'/.test(listFnBody) || !/is_active = true/.test(listFnBody)) {
        errors.push("get_internal_active_client_contributors does not filter to active client_contributor profiles");
      }
      if (/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(listFnBody)) {
        errors.push("get_internal_active_client_contributors must remain read-only");
      }
    } else {
      errors.push("Could not locate get_internal_active_client_contributors in internal_operator_creation_workflow.sql");
    }

    // Unassigned/Draft requests must never be visible to client contributors.
    if (!/CREATE POLICY "Contributors read assigned entity requests" ON client_input_requests FOR SELECT TO authenticated USING \(assigned_contributor_user_id = auth\.uid\(\) AND has_entity_access\(entity\)\)/.test(opSql)) {
      errors.push("client_input_requests contributor SELECT policy does not require assigned_contributor_user_id = auth.uid()");
    }

    // The approved anon SELECT correction remains scoped to templates only —
    // this migration must not grant anon SELECT on client_input_requests or
    // user_access_profiles.
    if (/client_input_requests[\s\S]{0,80}FOR SELECT[\s\S]{0,40}TO anon/i.test(opSqlCode) || /user_access_profiles[\s\S]{0,80}FOR SELECT[\s\S]{0,40}TO anon/i.test(opSqlCode)) {
      errors.push("internal_operator_creation_workflow.sql appears to grant anon SELECT beyond the approved template/template-section correction");
    }
    if (!/CREATE POLICY "All users read templates" ON client_input_templates FOR SELECT TO anon, authenticated USING \(true\)/.test(opSql)) {
      errors.push("internal_operator_creation_workflow.sql no longer preserves the approved anon template read correction");
    }

    // 14c. Client-originated requests created through this internal bridge
    // must be truthfully labelled — never claim to be client-originated.
    if (!/'Internal Requested Input'/.test(opSql)) {
      errors.push("create_internal_client_input_request does not label its rows request_origin = 'Internal Requested Input'");
    }

    // Service layer must call these exact RPC names.
    const serviceJsPath = path.join(__dirname, '../src/services/collaborationService.js');
    if (fs.existsSync(serviceJsPath)) {
      const serviceJs = fs.readFileSync(serviceJsPath, 'utf8');
      REQUIRED_FUNCTIONS.forEach(fn => {
        if (!serviceJs.includes(`'${fn}'`) && !serviceJs.includes(`"${fn}"`)) {
          errors.push(`collaborationService.js does not call RPC function: ${fn}`);
        }
      });
      if (!serviceJs.includes(`'${AUXILIARY_FUNCTIONS[1]}'`) && !serviceJs.includes(`"${AUXILIARY_FUNCTIONS[1]}"`)) {
        errors.push(`collaborationService.js does not call RPC function: ${AUXILIARY_FUNCTIONS[1]}`);
      }
    } else {
      errors.push("Missing src/services/collaborationService.js");
    }
  }

  // 15. Client-Originated Requirement Workflow (V4A.7) — the opposite
  // direction: an authenticated client_contributor creating their own
  // request directly, reusing the existing client_input_requests /
  // responses / revisions architecture. Static checks only.
  const clientOriginMigrationPath = path.join(__dirname, '../supabase/client_originated_requirement_workflow.sql');
  if (!fs.existsSync(clientOriginMigrationPath)) {
    errors.push("Missing supabase/client_originated_requirement_workflow.sql migration");
  } else {
    const originSql = fs.readFileSync(clientOriginMigrationPath, 'utf8');
    if (!/ALTER TABLE client_input_requests\s+ADD COLUMN IF NOT EXISTS request_origin/.test(originSql)) {
      errors.push("client_originated_requirement_workflow.sql does not additively add request_origin to client_input_requests");
    }
    if (!/CHECK \(request_origin IN \('Internal Requested Input', 'Client-Originated Requirement'\)\)/.test(originSql)) {
      errors.push("client_originated_requirement_workflow.sql request_origin is missing the two-value CHECK constraint");
    }
    if (!/DEFAULT 'Internal Requested Input'/.test(originSql)) {
      errors.push("client_originated_requirement_workflow.sql request_origin does not default existing rows to Internal Requested Input");
    }
    const insertPolicyMatch = originSql.match(/CREATE POLICY "Contributors create own requests" ON client_input_requests FOR INSERT TO authenticated WITH CHECK \(([\s\S]*?)\);/);
    if (!insertPolicyMatch) {
      errors.push("client_originated_requirement_workflow.sql is missing the 'Contributors create own requests' INSERT policy");
    } else {
      const checkBody = insertPolicyMatch[1];
      if (!/assigned_contributor_user_id\s*=\s*auth\.uid\(\)/.test(checkBody)) {
        errors.push("Contributors create own requests policy does not require self-assignment (assigned_contributor_user_id = auth.uid())");
      }
      if (!/has_entity_access\(entity\)/.test(checkBody)) {
        errors.push("Contributors create own requests policy does not require has_entity_access(entity)");
      }
      if (!/request_origin\s*=\s*'Client-Originated Requirement'/.test(checkBody)) {
        errors.push("Contributors create own requests policy does not force request_origin = 'Client-Originated Requirement'");
      }
    }
    if (/FOR SELECT TO anon/i.test(originSql) || /GRANT[\s\S]{0,40}TO anon/i.test(originSql)) {
      errors.push("client_originated_requirement_workflow.sql appears to grant anon access — this is an authenticated-only RLS correction");
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM/i.test(originSql)) {
      errors.push("client_originated_requirement_workflow.sql contains a destructive operation");
    }
  }

  // 16. Client Input & Requirements — internal vs client-originated
  // direction must remain distinct in the UI (V4A.7).
  if (fs.existsSync(clientInputJsxPath)) {
    const clientInputJsxV2 = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!/Request Client Input/.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx is missing the renamed internal action label 'Request Client Input'");
    }
    if (/>\s*New Input Request\s*</.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx still exposes the retired 'New Input Request' label");
    }
    if (!/I Have a Request/.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx is missing the client-originated 'I Have a Request' action");
    }
    if (!/isClient &&[\s\S]{0,600}I Have a Request/.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx does not gate 'I Have a Request' behind an authenticated client_contributor (isClient)");
    }
    const clientSubmitFnMatch = clientInputJsxV2.match(/const handleClientSubmitRequirement = async[\s\S]*?\n  \};\n/);
    if (!clientSubmitFnMatch) {
      errors.push("Could not locate handleClientSubmitRequirement in ClientInputRequirements.jsx");
    } else {
      const clientSubmitFnBody = clientSubmitFnMatch[0];
      if (!/collaborationService\.createRequest/.test(clientSubmitFnBody)) {
        errors.push("ClientInputRequirements.jsx client-originated submission does not use the direct authenticated createRequest path");
      }
      if (/selectedAuthorId/.test(clientSubmitFnBody)) {
        errors.push("ClientInputRequirements.jsx client-originated submission appears to reference selectedAuthorId — the client is the authenticated source identity, not the Active Editor");
      }
      if (!/assigned_contributor_user_id:\s*profile\.user_id/.test(clientSubmitFnBody)) {
        errors.push("ClientInputRequirements.jsx client-originated request does not self-assign via profile.user_id");
      }
      if (!/request_origin:\s*'Client-Originated Requirement'/.test(clientSubmitFnBody)) {
        errors.push("ClientInputRequirements.jsx client-originated request does not set request_origin = 'Client-Originated Requirement'");
      }
    }
  }

  // 17. Weekly Review contributor picker must not silently rely on an
  // anon-RLS-blocked direct select for the no-session internal operator.
  const weeklyJsxPathV2 = path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx');
  let weeklyJsxV2 = '';
  if (fs.existsSync(weeklyJsxPathV2)) {
    weeklyJsxV2 = fs.readFileSync(weeklyJsxPathV2, 'utf8');
    if (!weeklyJsxV2.includes('getInternalActiveClientContributors')) {
      errors.push("WeeklyDeliveryReview.jsx does not route the no-session internal operator's contributor list through the narrow RPC");
    }
  }

  // 18. Product Experience Pass (V4A.12) — the register is one list
  // filtered by responsibility (who needs to act), derived from lifecycle
  // status via src/utils/responsibility.js. Origin-based tabs are retired
  // as primary navigation; request_origin remains visible card/detail
  // metadata (provenance is interpreted, never destroyed).
  if (fs.existsSync(clientInputJsxPath)) {
    const clientInputJsxV3 = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!clientInputJsxV3.includes('requestResponsibility')) {
      errors.push("ClientInputRequirements.jsx does not filter the register through the responsibility model");
    }
    ['Needs Embark', 'Needs Client', 'Drafts', 'Completed'].forEach(f => {
      if (!clientInputJsxV3.includes(`'${f}'`)) {
        errors.push(`ClientInputRequirements.jsx is missing the '${f}' operational filter`);
      }
    });
    // The retired database-origin tab architecture must not return as
    // primary navigation, and neither may the older "Client Flow" label.
    if (/>\s*Client Flow\s*</.test(clientInputJsxV3) || clientInputJsxV3.includes("activeTab === 'client-flow'")) {
      errors.push("ClientInputRequirements.jsx has reverted to origin-tab primary navigation");
    }
    if (!clientInputJsxV3.includes('request_origin')) {
      errors.push("ClientInputRequirements.jsx no longer shows request_origin provenance metadata");
    }
  }
  // The responsibility interpretation layer itself.
  const responsibilityPath = path.join(__dirname, '../src/utils/responsibility.js');
  if (!fs.existsSync(responsibilityPath)) {
    errors.push("Missing src/utils/responsibility.js");
  } else {
    const respJs = fs.readFileSync(responsibilityPath, 'utf8');
    ['Needs Embark', 'Needs Client', 'Awaiting Client Confirmation'].forEach(v => {
      if (!respJs.includes(`'${v}'`)) errors.push(`responsibility.js is missing the '${v}' responsibility value`);
    });
    if (!respJs.includes('ticketResponsibility') || !respJs.includes('requestResponsibility') || !respJs.includes('reviewResponsibility')) {
      errors.push("responsibility.js is missing one of the three derivation helpers");
    }
  }
  // The operating home must exist, read canonical services only, and
  // never define its own persisted store.
  const attentionPath = path.join(__dirname, '../src/components/NeedsAttention.jsx');
  if (!fs.existsSync(attentionPath)) {
    errors.push("Missing src/components/NeedsAttention.jsx operating home");
  } else {
    const attentionJs = fs.readFileSync(attentionPath, 'utf8');
    if (!attentionJs.includes('collaborationService')) {
      errors.push("NeedsAttention.jsx does not read from the canonical collaboration service");
    }
    if (/from\s+['"]\.\.\/lib\/supabase['"]/.test(attentionJs)) {
      errors.push("NeedsAttention.jsx must not query Supabase directly — it derives from canonical service reads");
    }
    if (!attentionJs.includes('getInternalSupportTickets') || !attentionJs.includes('getInternalClientInputRequests') || !attentionJs.includes('getInternalWeeklyReviews')) {
      errors.push("NeedsAttention.jsx does not use the author-validated internal reads for the no-session operator");
    }
  }

  const filamentTemplatesPath = path.join(__dirname, '../supabase/seed_filament_review_templates.sql');
  if (!fs.existsSync(filamentTemplatesPath)) {
    errors.push("Missing supabase/seed_filament_review_templates.sql");
  } else {
    const filamentSql = fs.readFileSync(filamentTemplatesPath, 'utf8');
    if (!filamentSql.includes("'template-filament-profile-review'")) {
      errors.push("seed_filament_review_templates.sql is missing the Filament Company Profile Review template");
    }
    if (!filamentSql.includes("'template-filament-slides-review'")) {
      errors.push("seed_filament_review_templates.sql is missing the Filament Slides Review template");
    }
    // Structural fields: page/section select + slide select + the seven
    // structured review fields, not 43 hardcoded per-slide forms.
    if (!/page_section.*Select/i.test(filamentSql) || !/Page 1 — Cover/.test(filamentSql)) {
      errors.push("seed_filament_review_templates.sql Company Profile template is missing the Page/Section controlled Select");
    }
    if (!/presentation_section.*Select/i.test(filamentSql) || !/'slide', 'Slide', 'Select'/.test(filamentSql)) {
      errors.push("seed_filament_review_templates.sql Slides template is missing the Presentation Section / Slide controlled Selects");
    }
    if ((filamentSql.match(/CREATE TABLE|DROP TABLE/gi) || []).length > 0) {
      errors.push("seed_filament_review_templates.sql should only INSERT into the existing template tables, never create/drop a second template store");
    }
    // It must never edit the already-live seed file.
    const originalSeedPath = path.join(__dirname, '../supabase/seed_v4a_templates.sql');
    if (fs.existsSync(originalSeedPath)) {
      const originalSeedSql = fs.readFileSync(originalSeedPath, 'utf8');
      if (/template-filament/.test(originalSeedSql)) {
        errors.push("seed_v4a_templates.sql (already-live) appears to have been modified with the new Filament templates — these must live in the separate seed_filament_review_templates.sql");
      }
    }
  }

  const phase1MigrationPath = path.join(__dirname, '../supabase/phase1_historical_completion.sql');
  if (!fs.existsSync(phase1MigrationPath)) {
    errors.push("Missing supabase/phase1_historical_completion.sql");
  } else {
    const phase1Sql = fs.readFileSync(phase1MigrationPath, 'utf8');
    if (!/ADD COLUMN IF NOT EXISTS completed_at timestamptz/.test(phase1Sql)) {
      errors.push("phase1_historical_completion.sql does not additively add tracker_items.completed_at");
    }
    if (!/WHERE phase = 'Phase 1'/.test(phase1Sql)) {
      errors.push("phase1_historical_completion.sql does not scope its historical close to Phase 1");
    }
    if (!/'2026-06-30/.test(phase1Sql)) {
      errors.push("phase1_historical_completion.sql does not use the standard historical Phase 1 close date (30 June 2026)");
    }
    // due_date must never be used as a stand-in for completed_at.
    if (/completed_at\s*=\s*due_date|completed_at\s*=\s*COALESCE\(due_date/i.test(phase1Sql)) {
      errors.push("phase1_historical_completion.sql appears to use due_date as a substitute for completed_at");
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM/i.test(phase1Sql)) {
      errors.push("phase1_historical_completion.sql contains a destructive operation");
    }
    // App.jsx must not fabricate completed_at from due_date either, and
    // must never overwrite an already-set completion date.
    if (!appJsxForEditor.includes('updateData.completed_at') || !appJsxForEditor.includes('!oldCompletedAt')) {
      errors.push("App.jsx does not set completed_at exactly once, the first time a tracker item reaches Done");
    }
    if (/completed_at\s*[:=]\s*updatedFields\.dueDate|completed_at\s*[:=]\s*.*dueDate/i.test(appJsxForEditor.replace(/completedAt/g, ''))) {
      errors.push("App.jsx appears to derive completed_at from a due date field");
    }
  }

  // weekly_review_assignment_workflow.sql (V4A.2) is already live — it must
  // contain ONLY its original already-executed contract. The numeric
  // scorecard is a separate, not-yet-live migration (see below) so that an
  // already-executed file is never mutated and expected to be rerun whole.
  const weeklyReviewMigrationPathV2 = path.join(__dirname, '../supabase/weekly_review_assignment_workflow.sql');
  if (fs.existsSync(weeklyReviewMigrationPathV2)) {
    const weeklyMigSqlV2 = fs.readFileSync(weeklyReviewMigrationPathV2, 'utf8');
    if (/delivery_score|communication_score|timing_score|could_improve/.test(weeklyMigSqlV2)) {
      errors.push("weekly_review_assignment_workflow.sql (already live) appears to contain numeric-scorecard additions — these must live only in the separate weekly_review_numeric_scorecard.sql");
    }
  } else {
    errors.push("Missing supabase/weekly_review_assignment_workflow.sql");
  }

  const SCORE_COLUMNS = ['delivery_score', 'communication_score', 'timing_score', 'requirement_understanding_score', 'issue_resolution_score', 'approval_process_score'];
  const scorecardMigrationPath = path.join(__dirname, '../supabase/weekly_review_numeric_scorecard.sql');
  if (!fs.existsSync(scorecardMigrationPath)) {
    errors.push("Missing supabase/weekly_review_numeric_scorecard.sql");
  } else {
    const scorecardSql = fs.readFileSync(scorecardMigrationPath, 'utf8');
    SCORE_COLUMNS.forEach(col => {
      if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${col} integer CHECK \\(${col} BETWEEN 1 AND 10\\)`).test(scorecardSql)) {
        errors.push(`weekly_review_numeric_scorecard.sql is missing the 1-10 scorecard column: ${col}`);
      }
    });
    if (!/ADD COLUMN IF NOT EXISTS could_improve text/.test(scorecardSql)) {
      errors.push("weekly_review_numeric_scorecard.sql is missing the could_improve column");
    }
    if (!scorecardSql.includes('V4A.1 MONTHLY DELIVERY REVIEW')) {
      errors.push("weekly_review_numeric_scorecard.sql does not log the deferred V4A.1 MONTHLY DELIVERY REVIEW marker");
    }
    // Historical text-rating columns must not be dropped or coerced.
    if (/DROP COLUMN.*overall_delivery|DROP COLUMN.*communication_rating/i.test(scorecardSql)) {
      errors.push("weekly_review_numeric_scorecard.sql appears to drop a historical text rating column");
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM/i.test(scorecardSql)) {
      errors.push("weekly_review_numeric_scorecard.sql contains a destructive operation");
    }

    if (weeklyJsxV2) {
      SCORE_COLUMNS.forEach(col => {
        const camel = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!weeklyJsxV2.includes(camel)) {
          errors.push(`WeeklyDeliveryReview.jsx does not reference the numeric scorecard field: ${camel}`);
        }
      });
      if (!weeklyJsxV2.includes('couldImprove')) {
        errors.push("WeeklyDeliveryReview.jsx is missing the 'What could Embark improve?' field");
      }
      if (!/ACTION REQUIRED/i.test(weeklyJsxV2)) {
        errors.push("WeeklyDeliveryReview.jsx client scorecard is missing the Action Required framing");
      }
    }
  }

  // 19. Client Input Persistence & Guided Reviews (V4A.10) — the real
  // internal read contract plus the multi-page/multi-slide review model.
  // Static checks only; runtime persistence still requires the pending
  // migration to be executed live.
  const persistenceMigrationPath = path.join(__dirname, '../supabase/client_input_persistence_and_guided_reviews.sql');
  if (!fs.existsSync(persistenceMigrationPath)) {
    errors.push("Missing supabase/client_input_persistence_and_guided_reviews.sql");
  } else {
    const perSql = fs.readFileSync(persistenceMigrationPath, 'utf8');
    if (!/CREATE TABLE IF NOT EXISTS client_input_review_entries/.test(perSql)) {
      errors.push("Persistence migration is missing the client_input_review_entries table");
    }
    if (!/UNIQUE \(request_id, review_item_key\)/.test(perSql)) {
      errors.push("client_input_review_entries is missing the (request_id, review_item_key) uniqueness contract — one request must own many keyed review entries");
    }
    if (!/CHECK \(review_status IN \('Not Reviewed', 'Changes Added', 'No Changes Required'\)\)/.test(perSql)) {
      errors.push("client_input_review_entries review_status is missing the three controlled review states");
    }
    if (!/CHECK \(request_origin IN \('Internal Requested Input', 'Client-Originated Requirement', 'Internally Logged Client Requirement'\)\)/.test(perSql)) {
      errors.push("Persistence migration does not extend request_origin with 'Internally Logged Client Requirement'");
    }
    if (!/requirement_source IN \('Platform', 'WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'\)/.test(perSql)) {
      errors.push("Persistence migration is missing the controlled requirement_source values");
    }
    const PERSISTENCE_FUNCTIONS = [
      'log_internal_client_requirement',
      'get_internal_client_input_requests',
      'get_internal_client_input_responses',
      'get_internal_client_input_comments',
      'get_internal_client_input_review_entries',
      'upsert_internal_client_input_review_entry',
      'submit_internal_client_input_review',
    ];
    PERSISTENCE_FUNCTIONS.forEach(fn => {
      if (!perSql.includes(`FUNCTION ${fn}(`)) {
        errors.push(`Persistence migration is missing function: ${fn}`);
      }
      if (!new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\)\\s+FROM PUBLIC`).test(perSql)) {
        errors.push(`Persistence migration does not revoke PUBLIC execute on ${fn}`);
      }
      if (!new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\)\\s+TO anon, authenticated`).test(perSql)) {
        errors.push(`Persistence migration does not grant EXECUTE on ${fn} to anon, authenticated`);
      }
    });
    // Every function (7 new + the redefined create RPC) validates the
    // Active Editor server-side before touching any data.
    const perAuthorValidations = (perSql.match(/FROM update_authors ua\s+WHERE ua\.id = p_author_id AND ua\.is_active = true/g) || []).length;
    if (perAuthorValidations !== PERSISTENCE_FUNCTIONS.length + 1) {
      errors.push(`Persistence migration validates update_authors ${perAuthorValidations} times, expected ${PERSISTENCE_FUNCTIONS.length + 1} (7 new functions + redefined create RPC)`);
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM/i.test(perSql)) {
      errors.push("Persistence migration contains a destructive operation");
    }
    if (/FOR ALL TO anon|TO anon[\s\S]{0,30}USING \(true\)|FOR SELECT TO anon/i.test(perSql)) {
      errors.push("Persistence migration appears to grant anon direct table access — internal reads must go through author-validated RPCs only");
    }
    if (!/assigned_contributor_user_id = auth\.uid\(\)/.test(perSql)) {
      errors.push("client_input_review_entries RLS does not scope client contributors to their own assigned request via auth.uid()");
    }
    if (/p_sql\b|p_table\b|EXECUTE\s+format|EXECUTE\s+'/i.test(perSql)) {
      errors.push("Persistence migration appears to contain dynamic SQL or an arbitrary-table parameter");
    }

    // 19b. Server-side 16/43 completeness gate (SQL review finding): a
    // guided review may only reach 'Ready for Embark Review' when the FULL
    // fixed item count is saved and reviewed — "no saved row is Not
    // Reviewed" alone is insufficient when rows simply don't exist yet.
    // Both the internal submit RPC and the trigger guarding the client's
    // direct RLS UPDATE path must enforce it; the UI count is never the
    // only gate.
    if (!/WHEN 'template-filament-profile-review' THEN 16/.test(perSql) || !/WHEN 'template-filament-slides-review' THEN 43/.test(perSql)) {
      errors.push("Persistence migration does not pin the expected guided item counts (16 Company Profile pages / 43 slides) server-side");
    }
    const submitFnMatch = perSql.match(/CREATE OR REPLACE FUNCTION submit_internal_client_input_review[\s\S]*?\$\$;/);
    if (!submitFnMatch || !/v_reviewed <> v_expected/.test(submitFnMatch[0])) {
      errors.push("submit_internal_client_input_review does not enforce the expected reviewed-entry count — a partially saved guided review could be submitted");
    }
    if (!perSql.includes('FUNCTION enforce_guided_review_completeness()')) {
      errors.push("Persistence migration is missing the enforce_guided_review_completeness trigger function — the client's direct status update path would bypass server-side completeness");
    }
    if (!/CREATE TRIGGER trg_enforce_guided_review_completeness BEFORE UPDATE ON client_input_requests/.test(perSql)) {
      errors.push("Persistence migration does not bind the guided completeness trigger to client_input_requests");
    }
    if (/enforce_guided_review_completeness[\s\S]*?app\.internal_operator_bridge/.test(perSql)) {
      errors.push("The guided completeness trigger must not use the internal_operator_bridge exemption — assign_internal_client_input_contributor stays its only setter/consumer");
    }

    // 19c. Log Client Requirement validation contract (SQL review finding).
    const logFnMatch = perSql.match(/CREATE OR REPLACE FUNCTION log_internal_client_requirement[\s\S]*?\$\$;/);
    if (logFnMatch) {
      const logFnBody = logFnMatch[0];
      if (!/EXISTS \(SELECT 1 FROM client_input_templates t WHERE t\.id = p_template_id\)/.test(logFnBody)) {
        errors.push("log_internal_client_requirement does not validate that the request type/template actually exists");
      }
      if (!/user_access_profiles uap[\s\S]{0,120}role = 'client_contributor'[\s\S]{0,60}is_active = true/.test(logFnBody)) {
        errors.push("log_internal_client_requirement does not validate the optional source person as an active client_contributor");
      }
      if (!/'Internally Logged Client Requirement'/.test(logFnBody)) {
        errors.push("log_internal_client_requirement does not stamp the Internally Logged Client Requirement origin");
      }
      if (!/created_by_author_id/.test(logFnBody)) {
        errors.push("log_internal_client_requirement does not record created_by_author_id provenance");
      }
    } else {
      errors.push("Could not locate log_internal_client_requirement in the persistence migration");
    }
  }

  // Guided review structure: 16 Company Profile pages + 43 slides — never
  // 16/43 separate requests, columns, or one giant blob.
  const guidedConfigPath = path.join(__dirname, '../src/data/guidedReviewConfigs.js');
  if (!fs.existsSync(guidedConfigPath)) {
    errors.push("Missing src/data/guidedReviewConfigs.js");
  } else {
    const cfg = fs.readFileSync(guidedConfigPath, 'utf8');
    const pageCount = (cfg.match(/key: 'page-/g) || []).length;
    if (pageCount !== 16) errors.push(`guidedReviewConfigs.js defines ${pageCount} Company Profile pages, expected 16`);
    // Version-aware slide counts (V4A.16): the historical v1 inventory stays
    // 43 (persisted reviews must remain readable) and the corrected v2
    // inventory — rebuilt from the physical 61-slide presentation source —
    // must be exactly 61. Never one blind global count.
    const v1Start = cfg.indexOf("'template-filament-slides-review':");
    const v2Start = cfg.indexOf("'template-filament-slides-review-v2':");
    if (v1Start === -1 || v2Start === -1 || v2Start < v1Start) {
      errors.push("guidedReviewConfigs.js is missing the versioned presentation configs (v1 historical + v2)");
    } else {
      const v1Block = cfg.slice(v1Start, v2Start);
      const v2Block = cfg.slice(v2Start);
      const v1Slides = (v1Block.match(/key: 'slide-/g) || []).length;
      const v2Slides = (v2Block.match(/key: 'slide-/g) || []).length;
      if (v1Slides !== 43) errors.push(`Historical presentation config defines ${v1Slides} slides, expected 43 (persisted reviews)`);
      if (v2Slides !== 61) errors.push(`Presentation v2 config defines ${v2Slides} slides, expected 61 (physical deck)`);
    }
  }

  const guidedFormPath = path.join(__dirname, '../src/components/GuidedReviewForm.jsx');
  if (!fs.existsSync(guidedFormPath)) {
    errors.push("Missing src/components/GuidedReviewForm.jsx");
  } else {
    const gf = fs.readFileSync(guidedFormPath, 'utf8');
    ['No Changes Required', 'Changes Added', 'Not Reviewed'].forEach(s => {
      if (!gf.includes(`'${s}'`)) errors.push(`GuidedReviewForm.jsx is missing review state: ${s}`);
    });
    if (!/counts\.notReviewed > 0/.test(gf)) {
      errors.push("GuidedReviewForm.jsx does not block final submission while items remain Not Reviewed");
    }
    if (!gf.includes('Submit All Feedback to Embark')) {
      errors.push("GuidedReviewForm.jsx is missing the Submit All Feedback to Embark action");
    }
    if (!gf.includes('upsertInternalReviewEntry') || !gf.includes('upsertReviewEntry')) {
      errors.push("GuidedReviewForm.jsx does not persist review entries to Supabase for both personas — drafts must never live only in React state");
    }
    if (!gf.includes('N/A — No Changes Required')) {
      errors.push("GuidedReviewForm.jsx is missing the N/A — No Changes Required option");
    }
  }

  // The internal register must load through the author-validated read RPC —
  // the optimistic-merge-only persistence contract is retired.
  if (fs.existsSync(clientInputJsxPath)) {
    const civ4 = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!civ4.includes('getInternalClientInputRequests')) {
      errors.push("ClientInputRequirements.jsx does not load the internal register through get_internal_client_input_requests");
    }
    if (civ4.includes('mergeCreatedRequest')) {
      errors.push("ClientInputRequirements.jsx still uses the retired optimistic-only mergeCreatedRequest contract");
    }
    if (!civ4.includes('Log Request')) {
      errors.push("ClientInputRequirements.jsx is missing the internal 'Log Request' action");
    }
    if (!/handleLogRequirement[\s\S]{0,600}!selectedAuthorId/.test(civ4)) {
      errors.push("ClientInputRequirements.jsx Log Client Requirement does not require an Active Editor");
    }
    if (!civ4.includes('logInternalClientRequirement')) {
      errors.push("ClientInputRequirements.jsx does not log requirements through the narrow log_internal_client_requirement RPC");
    }
    if (!civ4.includes("'Internally Logged Client Requirement'")) {
      errors.push("ClientInputRequirements.jsx does not distinguish internally logged client requirements in the Client Requests tab");
    }
  }

  // 20. Internal Operator Collaboration Reads (V4A.11) — Support & Weekly
  // Review registers/detail must load through author-validated read RPCs
  // for the no-session operator (same persistence contract as Client
  // Input's V4A.10 fix). Static checks only.
  const collabReadsMigrationPath = path.join(__dirname, '../supabase/internal_operator_collaboration_reads.sql');
  if (!fs.existsSync(collabReadsMigrationPath)) {
    errors.push("Missing supabase/internal_operator_collaboration_reads.sql");
  } else {
    const readsSql = fs.readFileSync(collabReadsMigrationPath, 'utf8');
    const READ_FUNCTIONS = [
      'get_internal_support_tickets',
      'get_internal_weekly_reviews',
      'get_internal_weekly_review_feedback',
      'get_internal_weekly_review_tracker_items',
    ];
    READ_FUNCTIONS.forEach(fn => {
      if (!readsSql.includes(`FUNCTION ${fn}(`)) {
        errors.push(`internal_operator_collaboration_reads.sql is missing function: ${fn}`);
      }
      if (!new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\)\\s+FROM PUBLIC`).test(readsSql)) {
        errors.push(`internal_operator_collaboration_reads.sql does not revoke PUBLIC execute on ${fn}`);
      }
      if (!new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\)\\s+TO anon, authenticated`).test(readsSql)) {
        errors.push(`internal_operator_collaboration_reads.sql does not grant EXECUTE on ${fn} to anon, authenticated`);
      }
    });
    const readsAuthorValidations = (readsSql.match(/FROM update_authors ua\s+WHERE ua\.id = p_author_id AND ua\.is_active = true/g) || []).length;
    if (readsAuthorValidations !== READ_FUNCTIONS.length) {
      errors.push(`internal_operator_collaboration_reads.sql validates update_authors ${readsAuthorValidations} times, expected ${READ_FUNCTIONS.length}`);
    }
    // Structural checks ignore "--" comment prose (the file's own header
    // legitimately mentions the forbidden patterns while describing what it
    // does NOT do) — same convention as the check-14 opSqlCode pattern.
    const readsSqlCode = readsSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    if (/\bINSERT INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE FROM\b|DROP TABLE|TRUNCATE/i.test(readsSqlCode)) {
      errors.push("internal_operator_collaboration_reads.sql must be strictly read-only");
    }
    if (/CREATE POLICY|FOR SELECT TO anon|USING \(true\)/i.test(readsSqlCode)) {
      errors.push("internal_operator_collaboration_reads.sql must not add any RLS policy or anon table access");
    }

    const supportJsxV3 = fs.readFileSync(path.join(__dirname, '../src/views/SupportIssues.jsx'), 'utf8');
    if (!supportJsxV3.includes('getInternalSupportTickets')) {
      errors.push("SupportIssues.jsx does not load the no-session operator register through get_internal_support_tickets");
    }
    const weeklyJsxV3 = fs.readFileSync(path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx'), 'utf8');
    if (!weeklyJsxV3.includes('getInternalWeeklyReviews')) {
      errors.push("WeeklyDeliveryReview.jsx does not load the no-session operator register through get_internal_weekly_reviews");
    }
    if (!weeklyJsxV3.includes('getInternalWeeklyReviewFeedback') || !weeklyJsxV3.includes('getInternalWeeklyReviewTrackerItems')) {
      errors.push("WeeklyDeliveryReview.jsx detail view does not use the internal feedback/linked-task read RPCs for the no-session operator");
    }
  }

  // 21. Request -> Tracker Items Relationship (V4A.13)
  const trackerLinkMigrationPath = path.join(__dirname, '../supabase/client_input_tracker_link.sql');
  if (!fs.existsSync(trackerLinkMigrationPath)) {
    errors.push("Missing supabase/client_input_tracker_link.sql migration");
  } else {
    const linkSql = fs.readFileSync(trackerLinkMigrationPath, 'utf8');
    if (!/ADD COLUMN IF NOT EXISTS linked_tracker_item_id/.test(linkSql)) {
      errors.push("client_input_tracker_link.sql does not additively add linked_tracker_item_id");
    }

    // V4A.13 Regression Check
    const triggerMatch = linkSql.match(/CREATE TRIGGER trg_validate_client_input_tracker_link[\s\S]*?EXECUTE FUNCTION validate_client_input_tracker_link\(\);/i);
    if (triggerMatch) {
      if (triggerMatch[0].includes('TG_OP')) {
        errors.push("client_input_tracker_link.sql must not contain TG_OP in the CREATE TRIGGER definition");
      }
    } else {
      errors.push("client_input_tracker_link.sql is missing the validate_client_input_tracker_link CREATE TRIGGER statement");
    }

    const fnMatch = linkSql.match(/CREATE OR REPLACE FUNCTION validate_client_input_tracker_link[\s\S]*?LANGUAGE plpgsql[^;]*;/i);
    if (fnMatch) {
      const fnStr = fnMatch[0];
      if (!fnStr.includes('RETURNS trigger')) errors.push("validate_client_input_tracker_link must RETURNS trigger");
    } else {
      errors.push("client_input_tracker_link.sql is missing FUNCTION validate_client_input_tracker_link");
    }

    if (!/FUNCTION link_internal_client_input_request_tracker_item/.test(linkSql)) {
      errors.push("client_input_tracker_link.sql is missing the link_internal_client_input_request_tracker_item RPC");
    }
  }

  if (fs.existsSync(clientInputJsxPath)) {
    const civ4 = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!civ4.includes('Related Delivery Item')) {
      errors.push("ClientInputRequirements.jsx does not expose the 'Related Delivery Item' picker in the New Request form");
    }
    if (!civ4.includes('linkInternalClientInputRequestTrackerItem')) {
      errors.push("ClientInputRequirements.jsx does not link tracker items via linkInternalClientInputRequestTrackerItem");
    }
  }

  // 22. Weekly Review Atomic Internal Open + Tracker Linkage (V4A.12)
  const assignmentClaimMigrationPath = path.join(__dirname, '../supabase/weekly_review_assignment_claim.sql');
  if (!fs.existsSync(assignmentClaimMigrationPath)) {
    // Legacy naming or missing entirely
  } else {
    const claimSql = fs.readFileSync(assignmentClaimMigrationPath, 'utf8');
    if (!/FUNCTION open_internal_weekly_review_with_items/.test(claimSql)) {
      errors.push("weekly_review_assignment_claim.sql is missing open_internal_weekly_review_with_items");
    }
    const openMatch = claimSql.match(/CREATE OR REPLACE FUNCTION open_internal_weekly_review\([\s\S]*?\$\$;/);
    if (openMatch) {
      if (!/p_assigned_contributor_user_id IS NOT NULL[\s\S]*?FROM user_access_profiles/.test(openMatch[0])) {
        errors.push("open_internal_weekly_review does not validate the contributor (if supplied) against user_access_profiles");
      }
    }
  }

  const weeklyJsxV4 = fs.existsSync(weeklyJsxPathV2) ? fs.readFileSync(weeklyJsxPathV2, 'utf8') : '';
  if (weeklyJsxV4) {
    if (!weeklyJsxV4.includes('openInternalWeeklyReviewWithItems')) {
      errors.push("WeeklyDeliveryReview.jsx internal flow does not use the atomic openInternalWeeklyReviewWithItems RPC");
    }
    if (/isInternalOperator[\s\S]{0,300}for \(const item of workPreview\)/.test(weeklyJsxV4)) {
      errors.push("WeeklyDeliveryReview.jsx still contains the client-side post-create linkage loop for the internal operator flow — it must be atomic server-side");
    }
  }

  // 23. Final Product Completion Pass (V4A.14) — direct record navigation,
  // the client attention home, and progressive-disclosure intake. Static
  // checks only; visual behaviour requires the product owner's live test.
  const appJsxV14 = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');

  // 23a. Record-target mechanism: id-only navigation state, cleared after
  // consumption; never a copied record object as cross-view truth.
  if (!appJsxV14.includes('pendingRecordTarget') || !appJsxV14.includes('openWorkspaceRecord')) {
    errors.push("App.jsx is missing the record-target navigation mechanism (pendingRecordTarget/openWorkspaceRecord)");
  }
  if (!/setPendingRecordTarget\(\{ view, recordId \}\)/.test(appJsxV14)) {
    errors.push("App.jsx record target must store only { view, recordId } — never a full record object");
  }
  if (!/setPendingRecordTarget\(null\)/.test(appJsxV14)) {
    errors.push("App.jsx record target is never cleared (consumeRecordTarget must setPendingRecordTarget(null))");
  }
  ['client_input', 'weekly_review', 'support', 'tasks'].forEach(view => {
    if (!appJsxV14.includes(`targetRecordIdFor("${view}")`)) {
      errors.push(`App.jsx does not pass a record target to the '${view}' view`);
    }
  });

  // 23b. Each owning view consumes its target: finds the id in its own
  // canonically loaded register, selects it, and reports consumption.
  const consumingViews = [
    ['ClientInputRequirements.jsx', 'handleSelectRequest'],
    ['SupportIssues.jsx', 'handleSelectTicket'],
    ['WeeklyDeliveryReview.jsx', 'handleSelectReview'],
    ['TaskCommandCenter.jsx', 'setActiveNotesTaskId'],
  ];
  consumingViews.forEach(([file, selector]) => {
    const src = fs.readFileSync(path.join(__dirname, `../src/views/${file}`), 'utf8');
    if (!src.includes('targetRecordId')) {
      errors.push(`${file} does not consume a targetRecordId`);
    }
    if (!src.includes('onRecordTargetConsumed')) {
      errors.push(`${file} does not report record-target consumption`);
    }
    if (!new RegExp(`targetRecordId[\\s\\S]{0,600}${selector}`).test(src)) {
      errors.push(`${file} does not open the targeted record through its existing detail interaction (${selector})`);
    }
  });

  // 23c. NeedsAttention action targets carry record ids and contextual verbs.
  const attentionJsV14 = fs.readFileSync(path.join(__dirname, '../src/components/NeedsAttention.jsx'), 'utf8');
  if (!attentionJsV14.includes('recordId') || !attentionJsV14.includes('onOpenRecord')) {
    errors.push("NeedsAttention.jsx items do not open exact records (recordId/onOpenRecord missing)");
  }
  ['Review Request', 'Continue Request', 'Review Ticket', 'Confirm Resolution', 'Complete Review', 'Review Feedback', 'Open Delivery Item'].forEach(verb => {
    if (!attentionJsV14.includes(`"${verb}"`) && !attentionJsV14.includes(`'${verb}'`)) {
      errors.push(`NeedsAttention.jsx is missing the contextual action verb: ${verb}`);
    }
  });

  // 23d. Client attention home: derived from the client's own RLS reads via
  // the collaboration service — no direct Supabase queries, no new store.
  const clientHomePath = path.join(__dirname, '../src/views/ClientAttentionHome.jsx');
  if (!fs.existsSync(clientHomePath)) {
    errors.push("Missing src/views/ClientAttentionHome.jsx — the client contributor has no attention home");
  } else {
    const clientHomeJs = fs.readFileSync(clientHomePath, 'utf8');
    if (!clientHomeJs.includes('collaborationService')) {
      errors.push("ClientAttentionHome.jsx does not read from the canonical collaboration service");
    }
    if (/from\s+['"]\.\.\/lib\/supabase['"]/.test(clientHomeJs)) {
      errors.push("ClientAttentionHome.jsx must not query Supabase directly");
    }
    if (!clientHomeJs.includes('getRequests') || !clientHomeJs.includes('getTickets') || !clientHomeJs.includes('getReviews')) {
      errors.push("ClientAttentionHome.jsx does not derive from the client's RLS-owned request/ticket/review reads");
    }
    if (!clientHomeJs.includes('onOpenRecord')) {
      errors.push("ClientAttentionHome.jsx does not open exact records through the shared record-target mechanism");
    }
    if (!clientHomeJs.includes('Needs Your Attention') || !clientHomeJs.includes('Waiting on Embark')) {
      errors.push("ClientAttentionHome.jsx is missing its primary/secondary sections (Needs Your Attention / Waiting on Embark)");
    }
  }
  // Client landing + navigation: clients land on and can navigate to the
  // attention home; the internal Command Center stays internal-only.
  if (!/setActiveView\("client_home"\)/.test(appJsxV14)) {
    errors.push("App.jsx client contributor landing does not point to the client attention home");
  }
  if (!appJsxV14.includes("'Your Attention'")) {
    errors.push("App.jsx client navigation is missing the 'Your Attention' entry");
  }
  if (!/id: 'client_home'[\s\S]{0,120}clientOnly: true/.test(appJsxV14)) {
    errors.push("App.jsx 'Your Attention' is not gated to client contributors (clientOnly)");
  }
  if (!/id: 'dashboard'[\s\S]{0,120}adminOnly: true/.test(appJsxV14)) {
    errors.push("App.jsx internal Command Center is no longer adminOnly — clients must not see it");
  }

  // 23e. Progressive-disclosure intake: the fast log surface leads with the
  // client's ask; provenance fields live under More Details and the model
  // keeps them all (request_origin/requirement_source untouched).
  const clientInputJsxV14 = fs.readFileSync(clientInputJsxPath, 'utf8');
  if (!clientInputJsxV14.includes('>Request</label>')) {
    errors.push("ClientInputRequirements.jsx log form does not lead with the plain 'Request' field");
  }
  if (!clientInputJsxV14.includes('More Details')) {
    errors.push("ClientInputRequirements.jsx intake forms are missing the collapsed More Details section");
  }
  if (!clientInputJsxV14.includes('suggestTitleFromAsk')) {
    errors.push("ClientInputRequirements.jsx is missing the deterministic title suggestion helper");
  }
  if (!clientInputJsxV14.includes('What is your request?')) {
    errors.push("ClientInputRequirements.jsx client form does not lead with 'What is your request?'");
  }
  if (!/requirementSource/.test(clientInputJsxV14) || !/sourcePersonUserId/.test(clientInputJsxV14)) {
    errors.push("ClientInputRequirements.jsx progressive disclosure removed provenance fields from the model — they must be deferred, not deleted");
  }

  // 24. Final Product Strategy Pass (V4A.15) — persona-correct ticket
  // actions, persona status language, honest write errors, view-mode
  // grammar, attention eligibility, Filament Reviews lens, Client Access
  // provisioning, and the request retention contract.
  const supportJsxV15 = fs.readFileSync(path.join(__dirname, '../src/views/SupportIssues.jsx'), 'utf8');
  // 24a. Ticket actions belong to the real persona: Embark disposition for
  // every internal persona; confirm/reject only for the authenticated client.
  // "!isAdmin" is never a synonym for "client".
  if (!/isInternalOperator && !isResolved && !isClosed/.test(supportJsxV15)) {
    errors.push("SupportIssues.jsx 'Mark as Resolved' is not gated to the internal operator persona");
  }
  if (!/isClient && isResolved/.test(supportJsxV15)) {
    errors.push("SupportIssues.jsx client confirm/reject actions are not gated to the authenticated client (isClient)");
  }
  if (/\{!isAdmin && isResolved/.test(supportJsxV15)) {
    errors.push("SupportIssues.jsx still uses !isAdmin as a synonym for the client persona on resolution actions");
  }

  // 24b. Persona status language: one central mapper, no raw enums on cards.
  const statusLangPath = path.join(__dirname, '../src/utils/statusLanguage.js');
  if (!fs.existsSync(statusLangPath)) {
    errors.push("Missing src/utils/statusLanguage.js persona status mapper");
  } else {
    const statusLang = fs.readFileSync(statusLangPath, 'utf8');
    if (!statusLang.includes('displayRequestStatus') || !statusLang.includes('With Embark') || !statusLang.includes('Submitted by Client — Review')) {
      errors.push("statusLanguage.js does not map request statuses for both personas");
    }
  }
  const civ15 = fs.readFileSync(clientInputJsxPath, 'utf8');
  if (!civ15.includes('displayRequestStatus')) {
    errors.push("ClientInputRequirements.jsx does not render statuses through the persona status mapper");
  }

  // 24c. Honest write errors: draft saves must never swallow failures, and
  // the view must carry a visible response error state.
  const saveDraftMatch = civ15.match(/const handleSaveDraft = async[\s\S]*?\n  \};/);
  if (!saveDraftMatch) {
    errors.push("Could not locate handleSaveDraft in ClientInputRequirements.jsx");
  } else {
    if (saveDraftMatch[0].includes('console.warn')) {
      errors.push("handleSaveDraft still silently swallows write failures with console.warn");
    }
    if (!saveDraftMatch[0].includes('setResponseError')) {
      errors.push("handleSaveDraft does not surface a visible error on failed persistence");
    }
  }

  // 24d. View-mode grammar: structured responses render readable view mode
  // (never disabled chrome) for non-editing personas, with a lock reason.
  if (!civ15.includes('canEditResponses') || !civ15.includes('lockReason') || !civ15.includes('No response provided.')) {
    errors.push("ClientInputRequirements.jsx is missing the view-mode / lock-reason grammar for structured responses");
  }
  if (!/!isGuidedReview && canEditResponses/.test(civ15)) {
    errors.push("ClientInputRequirements.jsx save/submit actions are not gated on canEditResponses");
  }

  // 24e. Attention eligibility: attention = events, never ownership.
  const attentionV15 = fs.readFileSync(path.join(__dirname, '../src/components/NeedsAttention.jsx'), 'utf8');
  const embarkStatusesMatch = attentionV15.match(/const EMBARK_ATTENTION_STATUSES = \[([^\]]*)\]/);
  if (!embarkStatusesMatch) {
    errors.push("NeedsAttention.jsx no longer defines EMBARK_ATTENTION_STATUSES — attention eligibility is unpinned");
  } else {
    const list = embarkStatusesMatch[1];
    if (!list.includes('Ready for Embark Review') || !list.includes('Changes Requested')) {
      errors.push("EMBARK_ATTENTION_STATUSES is missing an arrival event status");
    }
    if (list.includes('In Production') || list.includes('Requirements Confirmed')) {
      errors.push("EMBARK_ATTENTION_STATUSES includes ownership states — ownership is not attention");
    }
  }
  if (!/const MAX_PER_GROUP = 5/.test(attentionV15)) {
    errors.push("NeedsAttention.jsx group display limit is not 5");
  }
  if (!attentionV15.includes('rankAttention')) {
    errors.push("NeedsAttention.jsx does not rank attention items deterministically");
  }
  if (!attentionV15.includes('archived_at')) {
    errors.push("NeedsAttention.jsx does not exclude archived requests from the attention surface");
  }

  // 24f. Filament Reviews lens: dedicated discoverability over the SAME
  // client_input_requests truth — no second store, no direct Supabase.
  const filamentLensPath = path.join(__dirname, '../src/views/FilamentReviews.jsx');
  if (!fs.existsSync(filamentLensPath)) {
    errors.push("Missing src/views/FilamentReviews.jsx programme lens");
  } else {
    const lens = fs.readFileSync(filamentLensPath, 'utf8');
    if (!lens.includes('template-filament-profile-review') || !lens.includes('template-filament-slides-review')) {
      errors.push("FilamentReviews.jsx does not render both guided review programmes");
    }
    if (!lens.includes('collaborationService')) {
      errors.push("FilamentReviews.jsx does not read through the canonical collaboration service");
    }
    if (/from\s+['"]\.\.\/lib\/supabase['"]/.test(lens)) {
      errors.push("FilamentReviews.jsx must not query Supabase directly");
    }
    if (!lens.includes('onOpenRecord')) {
      errors.push("FilamentReviews.jsx does not open exact records through the record-target mechanism");
    }
  }
  const appJsxV15 = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
  if (!appJsxV15.includes("id: 'filament_reviews'")) {
    errors.push("App.jsx navigation is missing the Filament Reviews lens");
  }
  if (!/registerRequests/.test(civ15) || !/!GUIDED_REVIEW_CONFIGS\[r\.template_id\]/.test(civ15)) {
    errors.push("ClientInputRequirements.jsx generic register does not exclude the guided review programmes by default");
  }

  // 24g. Client Access provisioning surface: authenticated-admin only,
  // no service_role anywhere near the frontend.
  const clientAccessPath = path.join(__dirname, '../src/views/ClientAccess.jsx');
  if (!fs.existsSync(clientAccessPath)) {
    errors.push("Missing src/views/ClientAccess.jsx provisioning surface");
  } else {
    const ca = fs.readFileSync(clientAccessPath, 'utf8');
    if (!ca.includes('provisionClientContributor')) {
      errors.push("ClientAccess.jsx does not provision through the narrow provision_client_contributor RPC");
    }
    if (ca.includes('service_role')) {
      errors.push("ClientAccess.jsx references service_role — forbidden in the frontend");
    }
    if (!ca.includes('!session') || !ca.includes('isAdmin')) {
      errors.push("ClientAccess.jsx does not gate on an authenticated admin session");
    }
  }
  const serviceJsV15 = fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8');
  if (serviceJsV15.includes('service_role')) {
    errors.push("collaborationService.js references service_role — forbidden in the frontend");
  }
  if (!appJsxV15.includes("id: 'client_access'")) {
    errors.push("App.jsx navigation is missing Client Access under Admin & Settings");
  }
  if (!/id: 'client_access'[\s\S]{0,200}adminOnly: true/.test(appJsxV15)) {
    errors.push("App.jsx Client Access nav entry is not adminOnly");
  }

  // 24h. New migration contract: client_access_and_request_retention.sql.
  const retentionMigrationPath = path.join(__dirname, '../supabase/client_access_and_request_retention.sql');
  if (!fs.existsSync(retentionMigrationPath)) {
    errors.push("Missing supabase/client_access_and_request_retention.sql");
  } else {
    const retSql = fs.readFileSync(retentionMigrationPath, 'utf8');
    const retSqlCode = retSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    // Support status correction: 'Open' joins the CHECK (live trigger and
    // display mapping already treat it as canonical).
    if (!/'New', 'Open', 'Acknowledged'/.test(retSqlCode)) {
      errors.push("Retention migration does not add 'Open' to the support_tickets status CHECK");
    }
    // Provisioning security: admin-gated, role hard-coded, no anon grant,
    // never fabricates identities.
    const provisionMatch = retSql.match(/CREATE OR REPLACE FUNCTION provision_client_contributor[\s\S]*?\$\$;/);
    if (!provisionMatch) {
      errors.push("Retention migration is missing provision_client_contributor");
    } else {
      if (!/IF NOT is_admin\(\)/.test(provisionMatch[0])) {
        errors.push("provision_client_contributor does not require is_admin()");
      }
      if (!/'client_contributor'/.test(provisionMatch[0]) || /p_role/.test(provisionMatch[0])) {
        errors.push("provision_client_contributor role must be hard-coded client_contributor, never a parameter");
      }
      if (/INSERT INTO auth\.users/i.test(provisionMatch[0])) {
        errors.push("provision_client_contributor must never fabricate auth.users identities");
      }
    }
    if (/GRANT EXECUTE ON FUNCTION provision_client_contributor\([^)]*\)\s+TO anon/.test(retSqlCode)) {
      errors.push("provision_client_contributor must never be granted to anon");
    }
    if (!/GRANT EXECUTE ON FUNCTION provision_client_contributor\([^)]*\)\s+TO authenticated/.test(retSqlCode)) {
      errors.push("provision_client_contributor is not granted to authenticated");
    }
    // Retention: additive column; author-validated archive/unarchive/delete;
    // delete restricted to never-assigned drafts; exactly one DELETE FROM.
    if (!/ADD COLUMN IF NOT EXISTS archived_at timestamptz/.test(retSqlCode)) {
      errors.push("Retention migration does not additively add client_input_requests.archived_at");
    }
    const retentionAuthorValidations = (retSqlCode.match(/FROM update_authors ua\s+WHERE ua\.id = p_author_id AND ua\.is_active = true/g) || []).length;
    if (retentionAuthorValidations !== 4) {
      errors.push(`Retention migration validates the Active Editor ${retentionAuthorValidations} times, expected 4 (archive, unarchive, draft delete, recreated register read)`);
    }
    if (!/v_status <> 'Draft'/.test(retSqlCode) || !/v_assigned IS NOT NULL/.test(retSqlCode)) {
      errors.push("delete_internal_draft_client_input_request is missing the Draft-only / never-assigned guards");
    }
    const deleteCount = (retSqlCode.match(/DELETE FROM/g) || []).length;
    if (deleteCount !== 1 || !/DELETE FROM client_input_requests WHERE id = p_request_id/.test(retSqlCode)) {
      errors.push("Retention migration must contain exactly one narrowly-scoped draft DELETE");
    }
    if (/DROP TABLE|TRUNCATE/i.test(retSqlCode)) {
      errors.push("Retention migration contains a destructive table operation");
    }
    if (/USING \(true\)|FOR ALL TO anon|service_role/.test(retSqlCode)) {
      errors.push("Retention migration adds a forbidden broad policy or service_role reference");
    }
    if (!/archived_at timestamptz\s*\)/.test(retSql)) {
      errors.push("Recreated get_internal_client_input_requests does not return archived_at");
    }
  }
  // Retention UI + service wiring.
  ['archiveInternalClientInputRequest', 'deleteInternalDraftClientInputRequest', 'provisionClientContributor'].forEach(fn => {
    if (!serviceJsV15.includes(fn)) {
      errors.push(`collaborationService.js is missing ${fn}`);
    }
  });
  if (!civ15.includes('Delete Draft') || !civ15.includes("'Archived'")) {
    errors.push("ClientInputRequirements.jsx is missing the Delete Draft action or the Archived recovery filter");
  }

  // 24i. Weekly review clarity: internal instrument preview + reviewer
  // provisioning explainer.
  const weeklyV15 = fs.readFileSync(path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx'), 'utf8');
  if (!weeklyV15.includes('What the client will score')) {
    errors.push("WeeklyDeliveryReview.jsx is missing the internal scorecard instrument preview");
  }
  if (!weeklyV15.includes('Client Access')) {
    errors.push("WeeklyDeliveryReview.jsx empty reviewer state does not point to Client Access provisioning");
  }

  // 25. Final Workflow Corrections (V4A.16) — 61-slide presentation truth,
  // Embark-only ticket retention, client-primary support intake, comment
  // honesty, client-first request language, and the task status legend.
  const civ16 = fs.readFileSync(clientInputJsxPath, 'utf8');
  const supportV16 = fs.readFileSync(path.join(__dirname, '../src/views/SupportIssues.jsx'), 'utf8');
  const badgeV16 = fs.readFileSync(path.join(__dirname, '../src/components/Badge.jsx'), 'utf8');
  const pcV16 = fs.readFileSync(path.join(__dirname, '../src/data/programmeContext.js'), 'utf8');

  // 25a. Presentation v2 contracts: retired v1 never offered for new
  // reviews; v2 action label exists; lens spans both versions. The generic
  // 'template-presentation' is retired too — it duplicated the guided
  // Filament Presentation Review inside the same creation pickers.
  {
    const retiredMatch = pcV16.match(/RETIRED_TEMPLATE_IDS\s*=\s*\[([^\]]*)\]/);
    const retiredIds = retiredMatch ? retiredMatch[1] : '';
    if (!retiredIds.includes("'template-filament-slides-review'")) {
      errors.push("programmeContext.js does not retire the 43-slide presentation template from new creation");
    }
    if (!retiredIds.includes("'template-presentation'")) {
      errors.push("programmeContext.js does not retire the generic 'template-presentation' duplicate of the guided presentation review");
    }
    if (retiredIds.includes("'template-filament-slides-review-v2'")) {
      errors.push("programmeContext.js must NOT retire the v2 (61-slide) presentation template");
    }
  }
  if (!pcV16.includes("'template-filament-slides-review-v2': 'Next: Review Presentation'")) {
    errors.push("programmeContext.js is missing the v2 presentation guided action label");
  }
  const retiredPickerFilters = (civ16.match(/templates\.filter\(t => !RETIRED_TEMPLATE_IDS\.includes\(t\.id\)\)/g) || []).length;
  if (retiredPickerFilters !== 3) {
    errors.push(`ClientInputRequirements.jsx filters retired templates in ${retiredPickerFilters} pickers, expected 3 (client / log / request-input)`);
  }
  const lensV16 = fs.readFileSync(path.join(__dirname, '../src/views/FilamentReviews.jsx'), 'utf8');
  if (!lensV16.includes('template-filament-slides-review-v2')) {
    errors.push("FilamentReviews.jsx does not surface the v2 61-slide presentation programme");
  }

  // 25b. Presentation migration: version-aware gates — v2 = 61 added, and
  // the 16 / historical 43 mappings preserved (no blind 43→61 replacement).
  const presMigrationPath = path.join(__dirname, '../supabase/filament_presentation_61_slide_review.sql');
  if (!fs.existsSync(presMigrationPath)) {
    errors.push("Missing supabase/filament_presentation_61_slide_review.sql");
  } else {
    const presSql = fs.readFileSync(presMigrationPath, 'utf8');
    const presSqlCode = presSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const v2Gates = (presSqlCode.match(/WHEN 'template-filament-slides-review-v2' THEN 61/g) || []).length;
    const v1Gates = (presSqlCode.match(/WHEN 'template-filament-slides-review' THEN 43/g) || []).length;
    const profileGates = (presSqlCode.match(/WHEN 'template-filament-profile-review' THEN 16/g) || []).length;
    if (v2Gates !== 2) errors.push(`Presentation migration defines the 61 gate ${v2Gates} times, expected 2 (submit RPC + trigger)`);
    if (v1Gates !== 2) errors.push("Presentation migration does not preserve the historical 43 gate in both functions — backward compatibility broken");
    if (profileGates !== 2) errors.push("Presentation migration does not preserve the 16-page profile gate in both functions");
    if (!/INSERT INTO client_input_templates[\s\S]{0,200}template-filament-slides-review-v2/.test(presSqlCode)) {
      errors.push("Presentation migration does not seed the v2 template row");
    }
    if (/DROP TABLE|TRUNCATE|DELETE FROM/i.test(presSqlCode)) {
      errors.push("Presentation migration contains a destructive operation");
    }
  }

  // 25c. Ticket retention migration: Embark-only authority enforced
  // server-side; delete restricted to New/Open zero-history tickets.
  const ticketRetMigrationPath = path.join(__dirname, '../supabase/support_ticket_retention.sql');
  if (!fs.existsSync(ticketRetMigrationPath)) {
    errors.push("Missing supabase/support_ticket_retention.sql");
  } else {
    const trSql = fs.readFileSync(ticketRetMigrationPath, 'utf8');
    const trSqlCode = trSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const embarkChecks = (trSqlCode.match(/organisation_label = 'Embark Digitals'/g) || []).length;
    if (embarkChecks !== 3) {
      errors.push(`Ticket retention migration enforces Embark-only authority ${embarkChecks} times, expected 3 (archive, unarchive, delete)`);
    }
    if (!/ADD COLUMN IF NOT EXISTS archived_at timestamptz/.test(trSqlCode)) {
      errors.push("Ticket retention migration does not additively add support_tickets.archived_at");
    }
    if (!/NOT IN \('New', 'Open'\)/.test(trSqlCode) || !/v_comment_count > 0/.test(trSqlCode)) {
      errors.push("delete_internal_test_support_ticket is missing the New/Open + zero-conversation guards");
    }
    const trDeletes = (trSqlCode.match(/DELETE FROM/g) || []).length;
    if (trDeletes !== 1 || !/DELETE FROM support_tickets WHERE id = p_ticket_id/.test(trSqlCode)) {
      errors.push("Ticket retention migration must contain exactly one narrowly-scoped ticket DELETE");
    }
    if (/DROP TABLE|TRUNCATE/i.test(trSqlCode)) {
      errors.push("Ticket retention migration contains a destructive table operation");
    }
    if (!/archived_at timestamptz\s*\)/.test(trSql)) {
      errors.push("Recreated get_internal_support_tickets does not return archived_at");
    }
  }
  ['archiveInternalSupportTicket', 'deleteInternalTestSupportTicket'].forEach(fn => {
    if (!fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8').includes(fn)) {
      errors.push(`collaborationService.js is missing ${fn}`);
    }
  });
  // Clients must never see removal actions; the UI additionally requires an
  // Embark editor before rendering them.
  if (!/isInternalOperator && !isClient && isEmbarkEditor/.test(supportV16)) {
    errors.push("SupportIssues.jsx ticket removal actions are not gated to Embark-only internal personas");
  }
  if (/isClient[\s\S]{0,120}(Delete Ticket|Archive Ticket)/.test(supportV16.replace(/!isClient/g, 'NOTCLIENT'))) {
    errors.push("SupportIssues.jsx appears to expose a removal action to the client persona");
  }

  // 25d. Support intake is client-primary; Embark records on behalf only.
  if (!/isClient &&[\s\S]{0,400}Report an Issue/.test(supportV16)) {
    errors.push("SupportIssues.jsx client-primary 'Report an Issue' action is missing or ungated");
  }
  if (!supportV16.includes('Log a Ticket')) {
    errors.push("SupportIssues.jsx is missing the internal 'Log a Ticket' secondary action");
  }
  if (/>\s*New Support Issue\s*</.test(supportV16)) {
    errors.push("SupportIssues.jsx still exposes the retired 'New Support Issue' primary action");
  }

  // 25e. Comment honesty: thread errors live beside the composer; the
  // internal no-editor state is explicit, never a fake 'No comments yet'.
  if (!supportV16.includes('commentError') || !supportV16.includes('commentsUnavailable')) {
    errors.push("SupportIssues.jsx is missing the honest comment error/unavailable states");
  }
  const postCommentMatch = supportV16.match(/const handlePostComment = async[\s\S]*?\n  \};/);
  if (!postCommentMatch || !postCommentMatch[0].includes('setCommentError') || !postCommentMatch[0].includes('await loadComments')) {
    errors.push("handlePostComment does not surface errors beside the composer and canonically reload the thread");
  }

  // 25f. Client-first request language and post-create assignment.
  ['When do you need this?', 'Requester', 'Recorded by', 'Brief / Context of Request'].forEach(s => {
    if (!civ16.includes(s)) {
      errors.push(`ClientInputRequirements.jsx is missing the client-facing language: ${s}`);
    }
  });
  if (civ16.includes('Primary Approver')) {
    errors.push("ClientInputRequirements.jsx still exposes Primary Approver on the request intake");
  }
  if (civ16.includes('value={newRequestForm.contributorUserId}')) {
    errors.push("ClientInputRequirements.jsx still exposes Assigned Contributor on the primary create form — assignment is post-create triage");
  }
  if (!/Assign Contributor|Change Contributor/.test(civ16)) {
    errors.push("ClientInputRequirements.jsx lost the post-create Assign Contributor triage action");
  }

  // 25g. Task status system: one complete central map + visible legend,
  // colour never without text.
  const CANONICAL_TASK_STATUSES = ['Not Started', 'In Progress', 'Waiting on Client', 'Blocked', 'Done', 'Recurring — Active', 'Deferred', 'Moved to Retainer', 'Moved to Phase 2', 'Moved to Phase 3', 'Out of Scope', 'Separate Scope'];
  CANONICAL_TASK_STATUSES.forEach(s => {
    if (!badgeV16.includes(`"${s}"`) && !badgeV16.includes(`${s.split(' ')[0]}:`)) {
      errors.push(`Badge.jsx statusStyles/TASK_STATUS_LEGEND is missing canonical task status: ${s}`);
    }
  });
  if (!badgeV16.includes('TASK_STATUS_LEGEND') || !badgeV16.includes('function StatusLegend')) {
    errors.push("Badge.jsx is missing the TASK_STATUS_LEGEND map or the StatusLegend component");
  }
  ['TaskCommandCenter.jsx', 'DeliveryBoard.jsx'].forEach(v => {
    const src = fs.readFileSync(path.join(__dirname, `../src/views/${v}`), 'utf8');
    if (!src.includes('<StatusLegend')) {
      errors.push(`${v} does not render the shared StatusLegend`);
    }
  });

  // 25h. Guided review data-loss guards + persistence honesty (V4A.16):
  // navigation must never silently discard the current item's typed
  // feedback, tab close warns while typing is unsaved, and both save and
  // submit outcomes are stated out loud.
  const guidedFormV16 = fs.readFileSync(path.join(__dirname, '../src/components/GuidedReviewForm.jsx'), 'utf8');
  if (!guidedFormV16.includes('saveIfDirty') || !guidedFormV16.includes('navigateTo')) {
    errors.push("GuidedReviewForm.jsx is missing the dirty-navigation auto-save guard (saveIfDirty/navigateTo)");
  }
  if (!guidedFormV16.includes('beforeunload')) {
    errors.push("GuidedReviewForm.jsx is missing the beforeunload unsaved-typing guard");
  }
  if (/onClick=\{\(\) => \{ setShowSummary\(false\); setIndex\(i\); \}\}/.test(guidedFormV16)) {
    errors.push("GuidedReviewForm.jsx navigator still bypasses the dirty-save guard");
  }
  if (!guidedFormV16.includes('saved successfully') || !guidedFormV16.includes('Submitted to Embark successfully')) {
    errors.push("GuidedReviewForm.jsx is missing the explicit save/submit success indicators");
  }
  if (!civ16.includes('responseSaved') && !fs.readFileSync(clientInputJsxPath, 'utf8').includes('responseSaved')) {
    errors.push("ClientInputRequirements.jsx Save Draft gives no visible success confirmation (responseSaved)");
  }

  // 26. V4A.17 — mark-resolved trigger conflict fix, weekly review
  // retention, and product-safe contract-mismatch error language.
  // 26a. The corrected resolve pair in the ticket retention source:
  // protect_support_columns honours the narrow lifecycle bridge, and
  // mark_internal_support_ticket_resolved is its EXACTLY-ONE setter.
  if (fs.existsSync(ticketRetMigrationPath)) {
    const trSqlV17 = fs.readFileSync(ticketRetMigrationPath, 'utf8');
    const trCodeV17 = trSqlV17.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const bridgeSetters = (trCodeV17.match(/set_config\('app\.support_lifecycle_bridge', 'true', true\)/g) || []).length;
    if (bridgeSetters !== 1) {
      errors.push(`support_ticket_retention.sql defines ${bridgeSetters} support_lifecycle_bridge setters, expected exactly 1 (mark_internal_support_ticket_resolved)`);
    }
    if (!/current_setting\('app\.support_lifecycle_bridge', true\) = 'true'/.test(trCodeV17)) {
      errors.push("support_ticket_retention.sql protect_support_columns does not honour the lifecycle bridge — Mark Resolved stays broken");
    }
    if (!/CREATE OR REPLACE FUNCTION mark_internal_support_ticket_resolved/.test(trSqlV17)) {
      errors.push("support_ticket_retention.sql does not ship the corrected mark_internal_support_ticket_resolved");
    }
    // The original internal_operator bridge key must not gain a second setter here.
    if (/set_config\('app\.internal_operator_bridge'/.test(trCodeV17)) {
      errors.push("support_ticket_retention.sql must not set app.internal_operator_bridge — its single setter contract is locked");
    }
  }

  // 26b. Weekly review retention migration: Embark-only, guarded delete,
  // additive archive, recreated register read.
  const weeklyRetMigrationPath = path.join(__dirname, '../supabase/weekly_review_retention.sql');
  if (!fs.existsSync(weeklyRetMigrationPath)) {
    errors.push("Missing supabase/weekly_review_retention.sql");
  } else {
    const wrSql = fs.readFileSync(weeklyRetMigrationPath, 'utf8');
    const wrCode = wrSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const wrEmbarkChecks = (wrCode.match(/organisation_label = 'Embark Digitals'/g) || []).length;
    if (wrEmbarkChecks !== 3) {
      errors.push(`weekly_review_retention.sql enforces Embark-only authority ${wrEmbarkChecks} times, expected 3`);
    }
    if (!/ADD COLUMN IF NOT EXISTS archived_at timestamptz/.test(wrCode)) {
      errors.push("weekly_review_retention.sql does not additively add weekly_delivery_reviews.archived_at");
    }
    if (!/v_status <> 'Awaiting Client Review'/.test(wrCode) || !/v_feedback_count > 0/.test(wrCode)) {
      errors.push("delete_internal_empty_weekly_review is missing the never-submitted / zero-feedback guards");
    }
    const wrDeletes = (wrCode.match(/DELETE FROM/g) || []).length;
    if (wrDeletes !== 1 || !/DELETE FROM weekly_delivery_reviews WHERE id = p_review_id/.test(wrCode)) {
      errors.push("weekly_review_retention.sql must contain exactly one narrowly-scoped review DELETE");
    }
    if (/DROP TABLE|TRUNCATE/i.test(wrCode)) {
      errors.push("weekly_review_retention.sql contains a destructive table operation");
    }
    if (!/archived_at timestamptz\s*\)/.test(wrSql)) {
      errors.push("Recreated get_internal_weekly_reviews does not return archived_at");
    }
  }
  const serviceJsV17 = fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8');
  ['archiveInternalWeeklyReview', 'deleteInternalEmptyWeeklyReview'].forEach(fn => {
    if (!serviceJsV17.includes(fn)) errors.push(`collaborationService.js is missing ${fn}`);
  });
  const weeklyV17 = fs.readFileSync(path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx'), 'utf8');
  if (!/isInternalOperator && !isClient && isEmbarkEditor/.test(weeklyV17)) {
    errors.push("WeeklyDeliveryReview.jsx retention actions are not gated to Embark-only internal personas");
  }

  // 26c. Contract-mismatch errors speak product language, never "schema
  // cache" or SQL Editor instructions: the shared mapper exists and every
  // retention surface uses it.
  if (!fs.existsSync(path.join(__dirname, '../src/utils/dbErrors.js'))) {
    errors.push("Missing src/utils/dbErrors.js contract-mismatch error mapper");
  }
  const dbErrorsJs = fs.readFileSync(path.join(__dirname, '../src/utils/dbErrors.js'), 'utf8');
  if (/Supabase SQL Editor|pending database migration|pendingMigrationFile/.test(dbErrorsJs)) {
    errors.push("dbErrors.js exposes pending-migration or SQL Editor instructions to product users");
  }
  ['SupportIssues.jsx', 'ClientInputRequirements.jsx', 'WeeklyDeliveryReview.jsx'].forEach(v => {
    const src = fs.readFileSync(path.join(__dirname, `../src/views/${v}`), 'utf8');
    if (!src.includes('explainDbError')) {
      errors.push(`${v} retention actions do not translate contract-mismatch errors (explainDbError)`);
    }
  });

  // 26d. In-form team-member attribution (V4A.17): the request forms carry
  // their own "Recorded by / Created by" picker wired to the SAME global
  // Active Editor (onSelectAuthor) — one identity truth, no sidebar detour.
  const civ17 = fs.readFileSync(clientInputJsxPath, 'utf8');
  if (!civ17.includes('Recorded by (team member)') || !civ17.includes('onSelectAuthor')) {
    errors.push("ClientInputRequirements.jsx is missing the in-form Recorded by team-member picker wired to onSelectAuthor");
  }
  if (!/Requester[\s\S]{0,800}author:/.test(civ17) || !/contrib:/.test(civ17)) {
    errors.push("ClientInputRequirements.jsx Requester dropdown does not offer team/client people alongside client sign-ins");
  }

  // 26e. Request edit (V4A.18): the narrow internal edit RPC matching the
  // ticket edit contract — title/entity/urgency/source only, lifecycle
  // guarded, provenance-commented, never touching protected columns.
  const requestEditMigrationPath = path.join(__dirname, '../supabase/client_input_request_edit.sql');
  if (!fs.existsSync(requestEditMigrationPath)) {
    errors.push("Missing supabase/client_input_request_edit.sql");
  } else {
    const reSql = fs.readFileSync(requestEditMigrationPath, 'utf8');
    const reCode = reSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    if (!/FROM update_authors ua\s+WHERE ua\.id = p_author_id AND ua\.is_active = true/.test(reCode)) {
      errors.push("update_internal_client_input_request does not validate the Active Editor");
    }
    if (!/IN \('Approved', 'Delivered'\)/.test(reCode)) {
      errors.push("update_internal_client_input_request is missing the Approved/Delivered lifecycle lock");
    }
    if (/\bstatus\s*=|\bassigned_contributor_user_id\s*=|\bprimary_approver_author_id\s*=|\blinked_tracker_item_id\s*=/.test(reCode.match(/UPDATE client_input_requests[\s\S]*?WHERE id = p_request_id/)?.[0] || '')) {
      errors.push("update_internal_client_input_request touches protected/assignment columns — it must edit title/entity/urgency/source only");
    }
    if (!/INSERT INTO client_input_comments/.test(reCode)) {
      errors.push("update_internal_client_input_request does not record edit provenance");
    }
    if (/DELETE FROM|DROP TABLE|TRUNCATE/i.test(reCode)) {
      errors.push("client_input_request_edit.sql contains a destructive operation");
    }
  }
  const serviceJsV18 = fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8');
  if (!serviceJsV18.includes('updateInternalClientInputRequest')) {
    errors.push("collaborationService.js is missing updateInternalClientInputRequest");
  }
  if (!civ17.includes('Edit Request') || !civ17.includes('handleSaveRequestEdit')) {
    errors.push("ClientInputRequirements.jsx is missing the internal Edit Request action");
  }

  // ==========================================================================
  // 27. V4A.19 — Secure Sign In parked behind a flag; ticket comment
  //     edit/delete for the internal operator.
  // ==========================================================================
  const pcV19 = fs.readFileSync(path.join(__dirname, '../src/data/programmeContext.js'), 'utf8');
  const appV19 = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
  const supportV19 = fs.readFileSync(path.join(__dirname, '../src/views/SupportIssues.jsx'), 'utf8');
  const weeklyV19 = fs.readFileSync(path.join(__dirname, '../src/views/WeeklyDeliveryReview.jsx'), 'utf8');
  const serviceV19 = fs.readFileSync(path.join(__dirname, '../src/services/collaborationService.js'), 'utf8');

  // 27a. The flag exists and gates the sign-in surfaces. The flag's VALUE is
  // a product decision (off for now, may be flipped back on) — the validator
  // only pins that the gates are wired, never the value.
  if (!/export const SECURE_SIGN_IN_ENABLED\s*=/.test(pcV19)) {
    errors.push("programmeContext.js is missing the SECURE_SIGN_IN_ENABLED flag");
  }
  if (!/item\.id === 'client_access' && !SECURE_SIGN_IN_ENABLED/.test(appV19)) {
    errors.push("App.jsx does not gate the Client Access nav entry behind SECURE_SIGN_IN_ENABLED");
  }
  if (!/!session && SECURE_SIGN_IN_ENABLED \?/.test(appV19)) {
    errors.push("App.jsx does not gate the sidebar Secure Sign In link behind SECURE_SIGN_IN_ENABLED");
  }
  if (!/SECURE_SIGN_IN_ENABLED && isInternalOperator && selectedReview\.review_status === 'Awaiting Client Review'/.test(weeklyV19)) {
    errors.push("WeeklyDeliveryReview.jsx does not park the Assign Reviewer row behind SECURE_SIGN_IN_ENABLED");
  }

  // 27b. Comment moderation migration contracts.
  const modPath = path.join(__dirname, '../supabase/support_ticket_comment_moderation.sql');
  if (!fs.existsSync(modPath)) {
    errors.push("Missing supabase/support_ticket_comment_moderation.sql");
  } else {
    const modSql = fs.readFileSync(modPath, 'utf8');
    if (!modSql.includes('update_internal_support_ticket_comment') || !modSql.includes('delete_internal_support_ticket_comment')) {
      errors.push("Comment moderation migration is missing the edit/delete RPCs");
    }
    if (!/created_by_author_id IS DISTINCT FROM p_author_id/.test(modSql)) {
      errors.push("Comment moderation migration does not enforce author-only edit");
    }
    if (!/'Embark Digitals'/.test(modSql)) {
      errors.push("Comment moderation delete does not carry the Embark Digitals override authority");
    }
    if (!/activity_type IS DISTINCT FROM 'comment'/.test(modSql)) {
      errors.push("Comment moderation does not protect system entries (audit trail) from edit/delete");
    }
    if (!/edited_at/.test(modSql) || !/DROP FUNCTION IF EXISTS get_internal_support_ticket_comments/.test(modSql)) {
      errors.push("Comment moderation migration must add edited_at and recreate the read function (return-type change needs DROP)");
    }
    if (!/WHERE ua\.id = p_author_id/.test(modSql)) {
      errors.push("Comment moderation read recreation must keep the author lookup table-qualified (42702 regression)");
    }
    if (/USING \(true\)|service_role/.test(modSql)) {
      errors.push("Comment moderation migration adds a forbidden broad policy or service_role reference");
    }
  }

  // 27c. Frontend wiring: service functions + inline moderation UI with
  // product-safe contract-mismatch errors.
  if (!serviceV19.includes('updateInternalSupportTicketComment') || !serviceV19.includes('deleteInternalSupportTicketComment')) {
    errors.push("collaborationService.js is missing the comment moderation functions");
  }
  if (!supportV19.includes('handleSaveCommentEdit') || !supportV19.includes('handleDeleteComment')) {
    errors.push("SupportIssues.jsx is missing the comment edit/delete handlers");
  }
  if (!/explainDbError\(err, 'support comment moderation'\)/.test(supportV19)) {
    errors.push("SupportIssues.jsx comment moderation errors do not use product-safe contract language");
  }
  if (!/canDeleteComment = isInternalOperator && isPlainComment && \(isOwnComment \|\| isEmbarkEditor\)/.test(supportV19)) {
    errors.push("SupportIssues.jsx comment delete visibility must be own-or-Embark on plain comments only");
  }

  // ==========================================================================
  // 28. V4A.19b — internal weekly review submission: with sign-ins parked the
  //     Active Editor records the client's scorecard via an author-validated
  //     RPC; the scorecard form must actually open for the internal persona.
  // ==========================================================================
  const subPath = path.join(__dirname, '../supabase/internal_weekly_review_submission.sql');
  if (!fs.existsSync(subPath)) {
    errors.push("Missing supabase/internal_weekly_review_submission.sql");
  } else {
    const subSql = fs.readFileSync(subPath, 'utf8');
    if (!subSql.includes('submit_internal_weekly_review')) {
      errors.push("Submission migration is missing submit_internal_weekly_review");
    }
    if (!/IS DISTINCT FROM 'Awaiting Client Review'/.test(subSql)) {
      errors.push("submit_internal_weekly_review does not lock submission to Awaiting Client Review");
    }
    if (!/archived_at IS NOT NULL/.test(subSql)) {
      errors.push("submit_internal_weekly_review does not refuse archived reviews");
    }
    if (!/p_delivery_score IS NULL/.test(subSql)) {
      errors.push("submit_internal_weekly_review does not require the delivery score");
    }
    if (!/submitted_by_author_id = p_author_id/.test(subSql)) {
      errors.push("submit_internal_weekly_review does not stamp submitted_by_author_id provenance");
    }
    if (!/review_status = 'Submitted'/.test(subSql)) {
      errors.push("submit_internal_weekly_review does not move the review to Submitted");
    }
    if (!/WHERE ua\.id = p_author_id/.test(subSql) || !/DROP FUNCTION IF EXISTS get_internal_weekly_reviews/.test(subSql)) {
      errors.push("Submission migration must keep author lookups table-qualified and recreate the register read (submitted_by_label needs DROP)");
    }
    if (/USING \(true\)|service_role/.test(subSql)) {
      errors.push("Submission migration adds a forbidden broad policy or service_role reference");
    }
    if (/assigned_contributor_user_id\s*=/.test(subSql.match(/UPDATE weekly_delivery_reviews[\s\S]*?RETURNING/)?.[0] || '')) {
      errors.push("submit_internal_weekly_review must never touch assigned_contributor_user_id (fabricated auth identity)");
    }
  }
  if (!serviceV19.includes('submitInternalWeeklyReview')) {
    errors.push("collaborationService.js is missing submitInternalWeeklyReview");
  }
  if (!/canInternalComplete = !!selectedReview && isInternalOperator/.test(weeklyV19)) {
    errors.push("WeeklyDeliveryReview.jsx is missing canInternalComplete — the internal persona cannot open the scorecard");
  }
  if (!/isMyPendingReview \|\| canInternalComplete/.test(weeklyV19)) {
    errors.push("WeeklyDeliveryReview.jsx does not render the scorecard form for the internal persona");
  }
  if (!/explainDbError\(err, 'weekly review submission'\)/.test(weeklyV19)) {
    errors.push("WeeklyDeliveryReview.jsx submit errors do not use product-safe contract language");
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
