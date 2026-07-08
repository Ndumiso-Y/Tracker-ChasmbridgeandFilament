-- Client Input Persistence & Guided Reviews (V4A.10)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- DEPENDENCIES (all already live): collaboration_layer_schema.sql,
-- delivery_assurance_operational_fields.sql,
-- client_originated_requirement_workflow.sql (request_origin),
-- internal_operator_creation_workflow.sql (bridge functions),
-- seed_filament_review_templates.sql (the two guided templates).
-- No already-live file is modified; everything here is new or a
-- CREATE OR REPLACE of a function this file itself owns going forward.
--
-- WHAT THIS FIXES (confirmed runtime defect): the no-session Active Editor
-- writes collaboration rows through SECURITY DEFINER RPCs (rows persist),
-- but every READ was a direct anon SELECT that RLS silently filters to
-- zero rows — so created requests "disappeared" on navigation/remount.
-- The previous optimistic React-state merge was masking, not fixing, this.
-- This migration adds the real internal operator READ contract (narrow,
-- Active-Editor-validated SECURITY DEFINER read functions) plus the guided
-- multi-page/multi-slide review model. No anon SELECT policy is added to
-- any collaboration table; no USING (true); no FOR ALL; client contributor
-- RLS is untouched.

-- =============================================================================
-- 1. HONEST PROVENANCE COLUMNS ON client_input_requests
-- =============================================================================
-- created_by_author_id: which Active Editor created/logged the request.
-- Until now this lived only inside a free-text client_input_comments row
-- ("Input request created by ..."), which cannot be filtered or joined.
-- Additive, nullable — legacy rows keep NULL and the UI shows the comment-
-- parsed fallback where available.
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS created_by_author_id text REFERENCES update_authors(id);

-- requirement_source: how a client requirement reached Embark. 'Platform'
-- for direct authenticated submissions; WhatsApp/Email/Meeting/Phone Call/
-- Other for requirements the internal operator logs on the client's behalf.
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS requirement_source text;
ALTER TABLE client_input_requests DROP CONSTRAINT IF EXISTS client_input_requests_requirement_source_check;
ALTER TABLE client_input_requests ADD CONSTRAINT client_input_requests_requirement_source_check
  CHECK (requirement_source IS NULL OR requirement_source IN ('Platform', 'WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other'));

-- Third request_origin value: an authenticated client submitting directly
-- and an internal operator faithfully logging what a client said on
-- WhatsApp/email/etc. are NOT the same provenance event, and pretending the
-- client authenticated would falsify identity. Scoped drop + immediate
-- recreate of the same CHECK, widened by one value; no data rewritten.
ALTER TABLE client_input_requests DROP CONSTRAINT IF EXISTS client_input_requests_request_origin_check;
ALTER TABLE client_input_requests ADD CONSTRAINT client_input_requests_request_origin_check
  CHECK (request_origin IN ('Internal Requested Input', 'Client-Originated Requirement', 'Internally Logged Client Requirement'));

-- =============================================================================
-- 2. GUIDED REVIEW ENTRIES (one request -> many per-page/per-slide entries)
-- =============================================================================
-- The existing client_input_responses model stores ONE value per template
-- section — it cannot honestly hold 16 page-specific or 43 slide-specific
-- copies of the same seven review fields without collisions. This table is
-- the smallest additive model: still the same Client Input system, keyed by
-- request_id (one request = one guided review), never a second request
-- store, never 16/43 separate requests, never a JSON blob, never 43 columns.
CREATE TABLE IF NOT EXISTS client_input_review_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL REFERENCES client_input_requests(id) ON DELETE CASCADE,
  review_item_key text NOT NULL,
  review_item_type text NOT NULL CHECK (review_item_type IN ('Company Profile Page', 'Presentation Slide')),
  review_item_number integer NOT NULL,
  review_item_title text NOT NULL,
  review_group text,
  review_status text NOT NULL DEFAULT 'Not Reviewed' CHECK (review_status IN ('Not Reviewed', 'Changes Added', 'No Changes Required')),
  current_concern text,
  remove_this text,
  replacement_copy text,
  copy_treatment text,
  visual_direction text,
  structure_changes text,
  additional_comments text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (request_id, review_item_key)
);

ALTER TABLE client_input_review_entries ENABLE ROW LEVEL SECURITY;

-- Ownership mirrors the parent request exactly: admins full access; the
-- assigned contributor may read always and write only while the request is
-- still in its pre-submission lifecycle window (same set the request RLS /
-- protect_request_columns trigger already treat as the active input phase).
DROP POLICY IF EXISTS "Admin full access review_entries" ON client_input_review_entries;
CREATE POLICY "Admin full access review_entries" ON client_input_review_entries FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Contributors read own review entries" ON client_input_review_entries;
CREATE POLICY "Contributors read own review entries" ON client_input_review_entries FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.id = client_input_review_entries.request_id
      AND r.assigned_contributor_user_id = auth.uid()
      AND has_entity_access(r.entity)
  )
);

DROP POLICY IF EXISTS "Contributors insert own pending review entries" ON client_input_review_entries;
CREATE POLICY "Contributors insert own pending review entries" ON client_input_review_entries FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.id = client_input_review_entries.request_id
      AND r.assigned_contributor_user_id = auth.uid()
      AND has_entity_access(r.entity)
      AND r.status IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required')
  )
);

DROP POLICY IF EXISTS "Contributors update own pending review entries" ON client_input_review_entries;
CREATE POLICY "Contributors update own pending review entries" ON client_input_review_entries FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.id = client_input_review_entries.request_id
      AND r.assigned_contributor_user_id = auth.uid()
      AND r.status IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.id = client_input_review_entries.request_id
      AND r.assigned_contributor_user_id = auth.uid()
  )
);

-- =============================================================================
-- 3. STAMP created_by_author_id IN THE EXISTING INTERNAL CREATE RPC
-- =============================================================================
-- CREATE OR REPLACE of the live create_internal_client_input_request —
-- same signature, same behaviour, plus the new honest provenance column.
-- (Redefining a function in a NEW migration is the correct way to evolve it;
-- the already-live migration file is not modified.)
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
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'A template is required';
  END IF;

  v_id := 'req-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_status := CASE WHEN p_assigned_contributor_user_id IS NULL THEN 'Draft' ELSE 'Client Input Required' END;

  INSERT INTO client_input_requests (
    id, title, entity, template_id, status, assigned_contributor_user_id,
    primary_approver_author_id, client_reported_urgency, request_origin,
    created_by_author_id
  ) VALUES (
    v_id, p_title, p_entity, p_template_id, v_status, p_assigned_contributor_user_id,
    p_primary_approver_author_id, p_client_reported_urgency, 'Internal Requested Input',
    p_author_id
  )
  RETURNING * INTO v_row;

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
-- 4. LOG CLIENT REQUIREMENT (internal operator captures an external client
--    requirement — WhatsApp / Email / Meeting / Phone Call / Other)
-- =============================================================================
-- Honest provenance: request_origin = 'Internally Logged Client Requirement',
-- created_by_author_id = the Active Editor, requirement_source = the channel.
-- The system never pretends the client authenticated (auth.uid() is not
-- involved). p_contributor_user_id optionally records WHICH client account
-- the requirement came from, when a profile exists; NULL = Unspecified.
-- p_guided_review: guided templates (Company Profile / Slides) open in the
-- active input phase so per-page entries can still be captured; a plain
-- logged requirement is fully captured at creation and goes straight to
-- 'Ready for Embark Review' with submitted_at stamped.
CREATE OR REPLACE FUNCTION log_internal_client_requirement(
  p_author_id text,
  p_title text,
  p_entity text,
  p_template_id text,
  p_contributor_user_id uuid,
  p_requirement_source text,
  p_request_context text,
  p_client_reported_urgency text,
  p_guided_review boolean
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_id text;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_template_id IS NULL OR NOT EXISTS (SELECT 1 FROM client_input_templates t WHERE t.id = p_template_id) THEN
    RAISE EXCEPTION 'A valid request type is required';
  END IF;
  IF p_requirement_source IS NULL OR p_requirement_source NOT IN ('WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other') THEN
    RAISE EXCEPTION 'A valid requirement source is required (WhatsApp, Email, Meeting, Phone Call, Other)';
  END IF;
  -- The source person is optional (Unspecified), but when supplied it must
  -- be a real, active client_contributor profile — never an arbitrary uuid.
  IF p_contributor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_access_profiles uap
    WHERE uap.user_id = p_contributor_user_id AND uap.role = 'client_contributor' AND uap.is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid, inactive, or non-contributor source person id: %', p_contributor_user_id;
  END IF;

  v_id := 'req-log-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  INSERT INTO client_input_requests (
    id, title, entity, template_id, status, assigned_contributor_user_id,
    client_reported_urgency, request_origin, requirement_source,
    created_by_author_id, submitted_at
  ) VALUES (
    v_id, p_title, p_entity, p_template_id,
    CASE WHEN p_guided_review THEN 'Client Input In Progress' ELSE 'Ready for Embark Review' END,
    p_contributor_user_id, p_client_reported_urgency,
    'Internally Logged Client Requirement', p_requirement_source,
    p_author_id,
    CASE WHEN p_guided_review THEN NULL ELSE now() END
  )
  RETURNING * INTO v_row;

  IF p_request_context IS NOT NULL AND btrim(p_request_context) <> '' THEN
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (v_id, p_author_id, 'Client requirement logged by ' || v_author_label || ' (source: ' || p_requirement_source || '). Client said: ' || p_request_context);
  ELSE
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (v_id, p_author_id, 'Client requirement logged by ' || v_author_label || ' (source: ' || p_requirement_source || ').');
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION log_internal_client_requirement(text, text, text, text, uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_internal_client_requirement(text, text, text, text, uuid, text, text, text, boolean) TO anon, authenticated;

-- =============================================================================
-- 5. INTERNAL REGISTER READ  (the real fix for disappearing records)
-- =============================================================================
-- Narrow, Active-Editor-validated read of the Client Input register.
-- Explicit columns only — no SELECT *, no dynamic SQL, no table parameter,
-- no auth secrets, no profile fields beyond the display name already shown
-- in the existing UI. This replaces the anon direct getRequests() read for
-- the no-session operator persona (which RLS correctly returns nothing for).
CREATE OR REPLACE FUNCTION get_internal_client_input_requests(p_author_id text)
RETURNS TABLE (
  id text,
  title text,
  entity text,
  template_id text,
  template_title text,
  status text,
  request_origin text,
  requirement_source text,
  assigned_contributor_user_id uuid,
  assigned_contributor_name text,
  client_reported_urgency text,
  created_at timestamptz,
  submitted_at timestamptz,
  review_acknowledged_at timestamptz,
  created_by_label text,
  review_total bigint,
  review_completed bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.title, r.entity, r.template_id, t.title,
    r.status, r.request_origin, r.requirement_source,
    r.assigned_contributor_user_id, uap.display_name,
    r.client_reported_urgency, r.created_at, r.submitted_at, r.review_acknowledged_at,
    cba.display_name || ' — ' || cba.organisation_label,
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id),
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id AND e.review_status <> 'Not Reviewed')
  FROM client_input_requests r
  LEFT JOIN client_input_templates t ON t.id = r.template_id
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  LEFT JOIN update_authors cba ON cba.id = r.created_by_author_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_requests(text) TO anon, authenticated;

-- =============================================================================
-- 6. INTERNAL DETAIL READS (responses, comments, review entries)
-- =============================================================================
-- Three deliberately separate narrow functions rather than one generic
-- JSON dump — each returns only what the existing detail UI renders.
CREATE OR REPLACE FUNCTION get_internal_client_input_responses(p_author_id text, p_request_id text)
RETURNS TABLE (template_section_id uuid, content text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT resp.template_section_id, resp.content, resp.updated_at
  FROM client_input_responses resp
  WHERE resp.input_request_id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_responses(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_responses(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_internal_client_input_comments(p_author_id text, p_request_id text)
RETURNS TABLE (comment text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT c.comment, c.created_at
  FROM client_input_comments c
  WHERE c.input_request_id = p_request_id
  ORDER BY c.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_comments(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_comments(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_internal_client_input_review_entries(p_author_id text, p_request_id text)
RETURNS SETOF client_input_review_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT e.* FROM client_input_review_entries e
  WHERE e.request_id = p_request_id
  ORDER BY e.review_item_number ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_review_entries(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_review_entries(text, text) TO anon, authenticated;

-- =============================================================================
-- 7. INTERNAL REVIEW ENTRY WRITE (guided review draft persistence)
-- =============================================================================
-- Lets the Active Editor capture per-page/per-slide feedback (e.g. while
-- logging what a client walked through in a meeting). Hard-coded columns,
-- lifecycle-guarded to the same pre-submission window as the client RLS.
CREATE OR REPLACE FUNCTION upsert_internal_client_input_review_entry(
  p_author_id text,
  p_request_id text,
  p_review_item_key text,
  p_review_item_type text,
  p_review_item_number integer,
  p_review_item_title text,
  p_review_group text,
  p_review_status text,
  p_current_concern text,
  p_remove_this text,
  p_replacement_copy text,
  p_copy_treatment text,
  p_visual_direction text,
  p_structure_changes text,
  p_additional_comments text
) RETURNS client_input_review_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_request_status text;
  v_row client_input_review_entries;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT r.status INTO v_request_status FROM client_input_requests r WHERE r.id = p_request_id;
  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_request_status NOT IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required') THEN
    RAISE EXCEPTION 'Cannot edit review entries once a request is %', v_request_status;
  END IF;

  INSERT INTO client_input_review_entries (
    request_id, review_item_key, review_item_type, review_item_number,
    review_item_title, review_group, review_status, current_concern,
    remove_this, replacement_copy, copy_treatment, visual_direction,
    structure_changes, additional_comments, updated_at
  ) VALUES (
    p_request_id, p_review_item_key, p_review_item_type, p_review_item_number,
    p_review_item_title, p_review_group, p_review_status, p_current_concern,
    p_remove_this, p_replacement_copy, p_copy_treatment, p_visual_direction,
    p_structure_changes, p_additional_comments, now()
  )
  ON CONFLICT (request_id, review_item_key) DO UPDATE SET
    review_status = EXCLUDED.review_status,
    current_concern = EXCLUDED.current_concern,
    remove_this = EXCLUDED.remove_this,
    replacement_copy = EXCLUDED.replacement_copy,
    copy_treatment = EXCLUDED.copy_treatment,
    visual_direction = EXCLUDED.visual_direction,
    structure_changes = EXCLUDED.structure_changes,
    additional_comments = EXCLUDED.additional_comments,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION upsert_internal_client_input_review_entry(text, text, text, text, integer, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_internal_client_input_review_entry(text, text, text, text, integer, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- =============================================================================
-- 8. INTERNAL GUIDED REVIEW SUBMISSION
-- =============================================================================
-- Finalises an internal guided review: refuses while any saved entry is
-- still 'Not Reviewed', then moves the request to 'Ready for Embark Review'
-- with submitted_at stamped. NOTE: this UPDATE deliberately needs NO
-- app.internal_operator_bridge exemption — protect_request_columns() already
-- permits the status transition to 'Ready for Embark Review' for non-admins,
-- and submitted_at/updated_at are not protected columns. The bridge flag
-- remains set by exactly one function (assign_internal_client_input_
-- contributor), unchanged. Full item coverage (all 16/43 items present) is
-- enforced by the guided review UI, which knows the template's item count;
-- this function enforces that nothing saved remains unreviewed.
CREATE OR REPLACE FUNCTION submit_internal_client_input_review(
  p_author_id text,
  p_request_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_request_status text;
  v_template_id text;
  v_expected integer;
  v_reviewed bigint;
  v_not_reviewed bigint;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT r.status, r.template_id INTO v_request_status, v_template_id
  FROM client_input_requests r WHERE r.id = p_request_id;
  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_request_status NOT IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required') THEN
    RAISE EXCEPTION 'This review has already been submitted (%)', v_request_status;
  END IF;

  -- Server-side completeness. Checking only "no saved row is Not Reviewed"
  -- would be insufficient: with 10 of 43 slides saved (all reviewed), zero
  -- rows say Not Reviewed yet 33 slides were never reviewed at all. For the
  -- two guided templates the number of reviewable items is fixed by the
  -- seeded source documents (16 readable Company Profile pages, 43 slides —
  -- kept in lockstep with src/data/guidedReviewConfigs.js), so the count of
  -- saved, reviewed entries must EQUAL the expected count, and nothing
  -- saved may remain Not Reviewed.
  v_expected := CASE v_template_id
    WHEN 'template-filament-profile-review' THEN 16
    WHEN 'template-filament-slides-review' THEN 43
    ELSE NULL
  END;

  SELECT
    count(*) FILTER (WHERE e.review_status <> 'Not Reviewed'),
    count(*) FILTER (WHERE e.review_status = 'Not Reviewed')
  INTO v_reviewed, v_not_reviewed
  FROM client_input_review_entries e
  WHERE e.request_id = p_request_id;

  IF v_not_reviewed > 0 THEN
    RAISE EXCEPTION 'Cannot submit: % item(s) are still Not Reviewed', v_not_reviewed;
  END IF;
  IF v_expected IS NOT NULL AND v_reviewed <> v_expected THEN
    RAISE EXCEPTION 'Cannot submit: only % of % items have been reviewed', v_reviewed, v_expected;
  END IF;

  UPDATE client_input_requests
  SET status = 'Ready for Embark Review',
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (p_request_id, p_author_id, 'Guided review submitted by ' || v_author_label || '.');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION submit_internal_client_input_review(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_internal_client_input_review(text, text) TO anon, authenticated;

-- =============================================================================
-- 9. GUIDED REVIEW COMPLETENESS GATE (server-side, every submission path)
-- =============================================================================
-- The authenticated client's final guided-review submission goes through the
-- existing RLS-permitted UPDATE (status -> 'Ready for Embark Review'), which
-- protect_request_columns() allows without knowing anything about guided
-- completeness — so UI gating alone could be bypassed by a direct call. This
-- narrow BEFORE UPDATE trigger closes that: it acts ONLY when status
-- transitions to 'Ready for Embark Review' AND the request uses one of the
-- two guided templates, and then requires the full fixed item count (16
-- Company Profile pages / 43 slides, in lockstep with guidedReviewConfigs.js)
-- to be saved and reviewed. It deliberately has no is_admin()/bridge-flag
-- bypass — an incomplete guided review is a data-integrity violation no
-- matter who submits it. Every other status transition and every non-guided
-- template is completely untouched. The client's submitting identity remains
-- auth.uid() via the existing RLS UPDATE policy; no Active Editor is
-- involved in client submission.
CREATE OR REPLACE FUNCTION enforce_guided_review_completeness() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_reviewed bigint;
  v_not_reviewed bigint;
BEGIN
  IF NEW.status = 'Ready for Embark Review' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_expected := CASE NEW.template_id
      WHEN 'template-filament-profile-review' THEN 16
      WHEN 'template-filament-slides-review' THEN 43
      ELSE NULL
    END;
    IF v_expected IS NOT NULL THEN
      SELECT
        count(*) FILTER (WHERE e.review_status <> 'Not Reviewed'),
        count(*) FILTER (WHERE e.review_status = 'Not Reviewed')
      INTO v_reviewed, v_not_reviewed
      FROM client_input_review_entries e
      WHERE e.request_id = NEW.id;

      IF v_not_reviewed > 0 OR v_reviewed <> v_expected THEN
        RAISE EXCEPTION 'Guided review incomplete: % of % items reviewed — every page/slide must be marked before submission', v_reviewed, v_expected;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_guided_review_completeness ON client_input_requests;
CREATE TRIGGER trg_enforce_guided_review_completeness BEFORE UPDATE ON client_input_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_guided_review_completeness();
