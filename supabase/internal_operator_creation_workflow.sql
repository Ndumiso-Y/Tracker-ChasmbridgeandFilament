-- Internal Operator Creation Workflow Bridge (V4A.4)
-- Additive migration. Run manually in the Supabase SQL Editor after review.
-- Do not run automatically.
--
-- RUN ORDER: create_internal_client_input_request (section 3, below) writes
-- to a request_origin column added by supabase/client_originated_requirement_
-- workflow.sql. Run client_originated_requirement_workflow.sql FIRST, then
-- this file, so that column exists before this function is created.
--
-- Purpose: the historical internal Command Center has never required a
-- Supabase Auth session — Active Editor selection is the sole operational
-- gate (see schema.sql: "Allow ALL tracker_items for public"). The V4A
-- collaboration tables (client_input_requests, support_tickets,
-- weekly_delivery_reviews) are correctly RLS-locked to authenticated
-- is_admin()/client_contributor identities, so the internal Active-Editor
-- workflow has no way to create rows there directly.
--
-- These four SECURITY DEFINER functions are the narrow bridge: each
-- independently validates the supplied Active Editor id against
-- update_authors (must exist AND be active) before performing exactly one
-- approved creation workflow. No function accepts a table name, column
-- name, or arbitrary SQL — every column written is hard-coded in the
-- function body. No function performs UPDATE or DELETE. No public FOR ALL
-- policy is added to any collaboration table; RLS on those tables is
-- untouched — these functions bypass it deliberately (SECURITY DEFINER,
-- owned by the migration-running role) as the one narrow, audited path.
--
-- Each function preserves the selected Active Editor as attribution using
-- the same "display_name — organisation_label" label format already used
-- throughout the existing Active Editor / Notes & History model in
-- src/App.jsx. Authenticated Supabase Auth identity is never used as a
-- substitute for the selected Active Editor.

-- =============================================================================
-- 1. CREATE DELIVERY ITEM  ("Add Delivery Item" — Task Command Center)
-- =============================================================================
CREATE OR REPLACE FUNCTION create_internal_delivery_item(
  p_author_id text,
  p_title text,
  p_entity text,
  p_phase text,
  p_record_type text,
  p_category text,
  p_status text,
  p_priority text,
  p_due_date date,
  p_owner_label text,
  p_next_action text,
  p_client_input text,
  p_delivery_context text,
  p_scope_treatment text
) RETURNS tracker_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_id text;
  v_row tracker_items;
BEGIN
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  -- "task-" prefix is required for the existing App.jsx category-derivation
  -- logic (mapRecordByCategoryId / isTask checks) to recognise this row.
  v_id := 'task-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  INSERT INTO tracker_items (
    id, title, entity, phase, category, status, priority, owner_label,
    due_date, description, next_action, record_type, delivery_context,
    scope_treatment, last_changed_by, last_changed_at, updated_at
  ) VALUES (
    v_id, p_title, p_entity, p_phase, p_category, p_status, p_priority, p_owner_label,
    p_due_date, p_client_input, p_next_action, p_record_type, p_delivery_context,
    p_scope_treatment, v_author_label, now(), now()
  )
  RETURNING * INTO v_row;

  INSERT INTO tracker_item_notes (
    tracker_item_id, note_type, note_text, changed_by_author_id, changed_by_label
  ) VALUES (
    v_id, 'manual',
    'Created manually through the internal operator workflow (Add Delivery Item).',
    p_author_id, v_author_label
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_internal_delivery_item(text, text, text, text, text, text, text, text, date, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_internal_delivery_item(text, text, text, text, text, text, text, text, date, text, text, text, text, text) TO anon, authenticated;

-- =============================================================================
-- 2. CREATE INTERNAL SUPPORT ISSUE  ("New Support Issue" — internal mode)
-- =============================================================================
CREATE OR REPLACE FUNCTION create_internal_support_issue(
  p_author_id text,
  p_title text,
  p_entity text,
  p_category text,
  p_issue_type text,
  p_linked_tracker_item_id text,
  p_description text,
  p_expected_outcome text,
  p_client_reported_urgency text,
  p_evidence_url text
) RETURNS support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_id text;
  v_row support_tickets;
BEGIN
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Description is required';
  END IF;
  IF p_issue_type = 'Task-Linked Issue' AND p_linked_tracker_item_id IS NULL THEN
    RAISE EXCEPTION 'A related tracker item is required for a task-linked issue';
  END IF;

  v_id := 'ticket-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  INSERT INTO support_tickets (
    id, title, entity, category, issue_type, linked_tracker_item_id,
    description, expected_outcome, client_reported_urgency, evidence_url, status
  ) VALUES (
    v_id, p_title, p_entity, p_category, p_issue_type, p_linked_tracker_item_id,
    p_description, p_expected_outcome, p_client_reported_urgency, p_evidence_url, 'New'
  )
  RETURNING * INTO v_row;

  -- KNOWN SCHEMA LIMITATION (reported, not worked around): support_tickets
  -- has no dedicated comment/activity/history table and no
  -- update_authors-linked creation-attribution column in the current live
  -- schema (reported_by_user_id is auth-user-based, for client submissions).
  -- Where the issue is explicitly Task-Linked, provenance is recorded using
  -- the already-established tracker_item_notes mechanism, since a real
  -- tracker_item_id exists to attach it to. A Standalone Issue has no
  -- equivalent attachment point — no fabricated table/column is added here;
  -- server-side Active Editor validation above still fully applies either way.
  IF p_linked_tracker_item_id IS NOT NULL THEN
    INSERT INTO tracker_item_notes (
      tracker_item_id, note_type, note_text, changed_by_author_id, changed_by_label
    ) VALUES (
      p_linked_tracker_item_id, 'manual',
      'Support issue "' || p_title || '" (' || v_id || ') reported through the internal operator workflow.',
      p_author_id, v_author_label
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_internal_support_issue(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_internal_support_issue(text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- =============================================================================
-- 3. CREATE CLIENT INPUT REQUEST  ("New Input Request" — internal mode)
-- =============================================================================
CREATE OR REPLACE FUNCTION create_internal_client_input_request(
  p_author_id text,
  p_title text,
  p_entity text,
  p_template_id text,
  p_assigned_contributor_user_id uuid,
  p_primary_approver_author_id text,
  p_request_context text,
  p_client_reported_urgency text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_id text;
  v_status text;
  v_row client_input_requests;
BEGIN
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'A template is required';
  END IF;
  -- Assigned contributor is intentionally OPTIONAL at creation — the
  -- internal Active Editor must be able to create a request before a
  -- client_contributor profile exists yet, then assign one later.
  -- assigned_contributor_user_id is already physically nullable (see
  -- collaboration_layer_schema.sql); no migration is required for this.

  v_id := 'req-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  -- An unassigned request is not yet actionable by any client, so it starts
  -- as 'Draft' (the table's own schema default) rather than 'Client Input
  -- Required', which implies a client should act now. Once assigned via the
  -- existing admin workflow, status naturally progresses from there.
  v_status := CASE WHEN p_assigned_contributor_user_id IS NULL THEN 'Draft' ELSE 'Client Input Required' END;

  -- request_origin (V4A.7, client_originated_requirement_workflow.sql)
  -- distinguishes an Embark-initiated request from one the client raised
  -- themselves — every row created through this internal bridge is, by
  -- definition, Internal Requested Input.
  INSERT INTO client_input_requests (
    id, title, entity, template_id, status, assigned_contributor_user_id,
    primary_approver_author_id, client_reported_urgency, request_origin
  ) VALUES (
    v_id, p_title, p_entity, p_template_id, v_status, p_assigned_contributor_user_id,
    p_primary_approver_author_id, p_client_reported_urgency, 'Internal Requested Input'
  )
  RETURNING * INTO v_row;

  -- Provenance via the existing client_input_comments mechanism (already
  -- used by the app for request context notes) — never a new table.
  IF p_request_context IS NOT NULL AND btrim(p_request_context) <> '' THEN
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (v_id, p_author_id, 'Input request created by ' || v_author_label || '. Context: ' || p_request_context);
  ELSE
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (v_id, p_author_id, 'Input request created by ' || v_author_label || '.');
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_internal_client_input_request(text, text, text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_internal_client_input_request(text, text, text, text, uuid, text, text, text) TO anon, authenticated;

-- =============================================================================
-- 4. OPEN WEEKLY REVIEW  ("Open Weekly Review" — internal mode)
-- =============================================================================
CREATE OR REPLACE FUNCTION open_internal_weekly_review(
  p_author_id text,
  p_entity text,
  p_review_period_start date,
  p_review_period_end date,
  p_assigned_contributor_user_id uuid
) RETURNS weekly_delivery_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row weekly_delivery_reviews;
BEGIN
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_review_period_start IS NULL OR p_review_period_end IS NULL THEN
    RAISE EXCEPTION 'Review period start and end are required';
  END IF;
  IF p_assigned_contributor_user_id IS NULL THEN
    RAISE EXCEPTION 'An assigned client contributor is required';
  END IF;

  -- This function only OPENS the review — it never sets a rating, never
  -- sets submitted_at, and never advances review_status past "Awaiting
  -- Client Review". Only the assigned client (via the existing RLS-guarded
  -- UPDATE path) can submit; only an authenticated admin can mark Reviewed.
  INSERT INTO weekly_delivery_reviews (
    entity, review_period_start, review_period_end, assigned_contributor_user_id,
    review_status, opened_at, submitted_at, overall_delivery
  ) VALUES (
    p_entity, p_review_period_start, p_review_period_end, p_assigned_contributor_user_id,
    'Awaiting Client Review', now(), NULL, NULL
  )
  RETURNING * INTO v_row;

  -- KNOWN SCHEMA LIMITATION (reported, not worked around):
  -- weekly_delivery_reviews has no "opened_by_author_id" column and no
  -- dedicated review-history table in the current live schema.
  -- weekly_review_feedback_items is not reused for this — it exists
  -- specifically for client-authored feedback content with its own
  -- provenance contract (source_review_id/source_field/source_text), and
  -- writing an admin "opened by" row into it would be a semantically
  -- incorrect fabrication. No new table/column is added here; server-side
  -- Active Editor validation above still fully applies regardless.

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION open_internal_weekly_review(text, text, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_internal_weekly_review(text, text, date, date, uuid) TO anon, authenticated;

-- =============================================================================
-- 5. TEMPLATE READ ACCESS FOR THE INTERNAL OPERATOR (RLS correction)
-- =============================================================================
-- Root cause of the empty "New Input Request" template select: both
-- client_input_templates and client_input_template_sections SELECT
-- policies (collaboration_layer_schema.sql) are scoped TO authenticated
-- only. The internal no-session Active Editor workflow uses the anon key,
-- so RLS silently returned zero rows (no error) — an empty dropdown, not a
-- broken query. Template definitions (id/title/description/section
-- structure) carry no client-sensitive content — they are the same class
-- of non-sensitive structural data as update_authors, which is already
-- fully public. Extend read access to anon; write access
-- (Admin write templates / Admin write template sections) is untouched.
DROP POLICY IF EXISTS "All authenticated users read templates" ON client_input_templates;
DROP POLICY IF EXISTS "All users read templates" ON client_input_templates;
CREATE POLICY "All users read templates" ON client_input_templates FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "All authenticated users read template sections" ON client_input_template_sections;
DROP POLICY IF EXISTS "All users read template sections" ON client_input_template_sections;
CREATE POLICY "All users read template sections" ON client_input_template_sections FOR SELECT TO anon, authenticated USING (true);

-- =============================================================================
-- 6. TRIGGER COMPATIBILITY FOR THE ASSIGNMENT BRIDGE (V4A.6)
-- =============================================================================
-- protect_request_columns() (collaboration_layer_schema.sql) is a BEFORE
-- UPDATE trigger on client_input_requests that restricts what a non-admin
-- UPDATE may change (e.g. a real authenticated client_contributor may only
-- self-transition status to 'Client Input In Progress' or 'Ready for Embark
-- Review'). It already exempts admins via is_admin(). The internal Active
-- Editor assignment function below (section 7) also needs to UPDATE this
-- table — but it runs with no Supabase Auth session, so auth.uid()/is_admin()
-- are both unavailable to it and it cannot pass the existing admin check.
-- This adds one narrow, explicit exemption: a transaction-local setting that
-- ONLY that one already-audited SECURITY DEFINER function sets, immediately
-- before its own UPDATE, and that nothing else in the codebase sets. Every
-- other branch of this trigger — including what a real authenticated
-- client_contributor session can do — is completely unchanged.
CREATE OR REPLACE FUNCTION protect_request_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  IF current_setting('app.internal_operator_bridge', true) = 'true' THEN RETURN NEW; END IF;

  IF NEW.primary_approver_author_id IS DISTINCT FROM OLD.primary_approver_author_id THEN
    RAISE EXCEPTION 'Contributors cannot change the primary approver';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('Client Input In Progress', 'Ready for Embark Review') THEN
      RAISE EXCEPTION 'Contributors can only transition status to In Progress or Ready for Review';
    END IF;
  END IF;

  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.review_acknowledged_at IS DISTINCT FROM OLD.review_acknowledged_at THEN
    RAISE EXCEPTION 'Contributors cannot mutate admin confirmation timestamps';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. ASSIGN / CHANGE / REMOVE CONTRIBUTOR  ("Assign Contributor" — internal mode)
-- =============================================================================
-- Closes the "Unassigned request has no way to become assigned" dead-end.
-- Fifth approved internal-operator bridge function. Same shape as the other
-- four: validates the supplied Active Editor id, performs exactly one
-- narrowly-scoped mutation (UPDATE of three physical columns only — never an
-- arbitrary column/table), and records provenance. Assignment changes are
-- only permitted while the request is still in its pre-submission phase
-- (the same status set the existing "Contributors update assigned requests"
-- RLS policy already treats as the active input phase); once a client has
-- actually submitted, reassigning or removing a contributor is a
-- frozen-workflow action outside this bridge's scope and is rejected.
CREATE OR REPLACE FUNCTION assign_internal_client_input_contributor(
  p_author_id text,
  p_request_id text,
  p_contributor_user_id uuid
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_contributor_label text;
  v_current_status text;
  v_new_status text;
  v_row client_input_requests;
BEGIN
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT status INTO v_current_status FROM client_input_requests WHERE id = p_request_id;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;

  IF v_current_status NOT IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required') THEN
    RAISE EXCEPTION 'Cannot change the assigned contributor once a request is %', v_current_status;
  END IF;

  IF p_contributor_user_id IS NOT NULL THEN
    SELECT display_name INTO v_contributor_label
    FROM user_access_profiles
    WHERE user_id = p_contributor_user_id AND role = 'client_contributor' AND is_active = true;

    IF v_contributor_label IS NULL THEN
      RAISE EXCEPTION 'Invalid, inactive, or non-contributor user id: %', p_contributor_user_id;
    END IF;

    -- Only the pure "waiting to be worked" state advances automatically;
    -- a request already in progress keeps its status when reassigned.
    v_new_status := CASE WHEN v_current_status = 'Draft' THEN 'Client Input Required' ELSE v_current_status END;
  ELSE
    -- Removing the contributor only steps status back to Draft when it was
    -- purely "waiting to be worked" (Client Input Required); once the
    -- client has actually started (Client Input In Progress / Clarification
    -- Required), that in-progress signal is preserved rather than erased.
    v_new_status := CASE WHEN v_current_status = 'Client Input Required' THEN 'Draft' ELSE v_current_status END;
  END IF;

  PERFORM set_config('app.internal_operator_bridge', 'true', true);

  UPDATE client_input_requests
  SET assigned_contributor_user_id = p_contributor_user_id,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (
    p_request_id,
    p_author_id,
    CASE
      WHEN p_contributor_user_id IS NOT NULL THEN 'Contributor assigned to ' || v_contributor_label || ' by ' || v_author_label || '.'
      ELSE 'Contributor removed by ' || v_author_label || '.'
    END
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION assign_internal_client_input_contributor(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_internal_client_input_contributor(text, text, uuid) TO anon, authenticated;

-- =============================================================================
-- 8. ACTIVE CLIENT CONTRIBUTOR LIST FOR ASSIGNMENT (read-only helper)
-- =============================================================================
-- The internal operator assignment control (section 7) needs to list active
-- client_contributor profiles to assign. A direct client-side SELECT against
-- user_access_profiles returns zero rows under anon RLS (same class of gap
-- fixed for templates in section 5) — but user_access_profiles carries real
-- client-identifying data, unlike template structure, so it is deliberately
-- NOT given a broad anon SELECT policy here. Instead this narrow, read-only,
-- hard-coded-filter function returns only the three non-sensitive columns
-- already surfaced in the existing admin UI (user_id, display_name,
-- entity_scope) for active client_contributor profiles — nothing else on
-- the table, no email, no arbitrary query. Read-only: no author id is
-- required and nothing is written.
-- Read-only, but still requires a valid, active Active Editor id before
-- returning any contributor data — consistent with every other function in
-- this bridge never running unattributed, even for a pure lookup.
CREATE OR REPLACE FUNCTION get_internal_active_client_contributors(p_author_id text)
RETURNS TABLE (user_id uuid, display_name text, entity_scope text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  -- update_authors columns MUST be alias-qualified: display_name is also an
  -- OUT column of this function's RETURNS TABLE(...), so an unqualified
  -- display_name here is ambiguous and Postgres raises
  -- 'column reference "display_name" is ambiguous' at call time.
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT uap.user_id, uap.display_name, uap.entity_scope
  FROM user_access_profiles uap
  WHERE uap.role = 'client_contributor' AND uap.is_active = true
  ORDER BY uap.display_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_active_client_contributors(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_active_client_contributors(text) TO anon, authenticated;

-- =============================================================================
-- 9. CLIENT REQUEST SELECT VISIBILITY CORRECTION (RLS)
-- =============================================================================
-- The original "Contributors read assigned entity requests" policy
-- (collaboration_layer_schema.sql) grants SELECT to any authenticated
-- client_contributor with access to the request's entity — regardless of
-- whether the request is actually assigned to them. Combined with this
-- correction now allowing Unassigned/Draft requests to exist, that would
-- expose every Draft/Unassigned request in an entity to every contributor
-- who happens to share that entity. Tightened to require both: the request
-- is actually assigned to the requesting user, AND the existing
-- entity-access contract. An Unassigned request (assigned_contributor_user_id
-- IS NULL) is never visible to any client_contributor — NULL = auth.uid()
-- is never true. Admin access (is_admin(), "Admin full access
-- input_requests") and the internal Active Editor bridge (SECURITY DEFINER,
-- bypasses RLS deliberately) are both untouched. anon still has no direct
-- SELECT policy on client_input_requests at all.
DROP POLICY IF EXISTS "Contributors read assigned entity requests" ON client_input_requests;
CREATE POLICY "Contributors read assigned entity requests" ON client_input_requests FOR SELECT TO authenticated USING (assigned_contributor_user_id = auth.uid() AND has_entity_access(entity));
