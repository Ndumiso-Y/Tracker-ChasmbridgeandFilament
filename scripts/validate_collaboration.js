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
    // Follow-up task creation must not bypass the Active Editor attribution
    // model: it must require selectedAuthorId and record last_changed_by.
    if (!/handleCreateFollowUp[\s\S]{0,400}selectedAuthorId/.test(supportJsx)) {
      errors.push("SupportIssues.jsx 'Create Follow-Up Task' does not appear to require an Active Editor before creating a tracker_items row");
    }
    if (!/createFollowUpTask\(\{[\s\S]{0,400}last_changed_by/.test(supportJsx)) {
      errors.push("SupportIssues.jsx 'Create Follow-Up Task' does not appear to attribute the new tracker_items row via last_changed_by");
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
    if (!/Submit Requirement \/ Change/.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx is missing the client-originated 'Submit Requirement / Change' action");
    }
    if (!/isClient &&[\s\S]{0,300}Submit Requirement \/ Change/.test(clientInputJsxV2)) {
      errors.push("ClientInputRequirements.jsx does not gate 'Submit Requirement / Change' behind an authenticated client_contributor (isClient)");
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

  // 18. Product Journey Pass (V4A.9) — Client Input two-tab architecture,
  // Filament review templates, Phase 1 historical completion, and the
  // weekly review numeric scorecard. Static checks only.
  if (fs.existsSync(clientInputJsxPath)) {
    const clientInputJsxV3 = fs.readFileSync(clientInputJsxPath, 'utf8');
    if (!/>\s*Client Requests\s*</.test(clientInputJsxV3) || !/>\s*Input Needed from Client\s*</.test(clientInputJsxV3)) {
      errors.push("ClientInputRequirements.jsx is missing the two-tab Client Requests / Input Needed from Client information architecture");
    }
    // The retired confusing "Client Flow" label must not remain in the UI.
    if (/>\s*Client Flow\s*</.test(clientInputJsxV3)) {
      errors.push("ClientInputRequirements.jsx still exposes the retired 'Client Flow' tab label");
    }
    if (!clientInputJsxV3.includes("activeTab === 'client-input'") || !clientInputJsxV3.includes("activeTab === 'client-flow'")) {
      errors.push("ClientInputRequirements.jsx does not gate the request list/actions by the active tab");
    }
    if (!clientInputJsxV3.includes('request_origin')) {
      errors.push("ClientInputRequirements.jsx tabs do not appear to filter by request_origin");
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
    const slideCount = (cfg.match(/key: 'slide-/g) || []).length;
    if (pageCount !== 16) errors.push(`guidedReviewConfigs.js defines ${pageCount} Company Profile pages, expected 16`);
    if (slideCount !== 43) errors.push(`guidedReviewConfigs.js defines ${slideCount} presentation slides, expected 43`);
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
    if (!civ4.includes('Log Client Requirement')) {
      errors.push("ClientInputRequirements.jsx is missing the internal 'Log Client Requirement' action");
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
