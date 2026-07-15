-- =============================================================================
-- MULTI-REVIEWER GUIDED REVIEWS v1
-- =============================================================================
-- Additive activation migration. DO NOT RUN AUTOMATICALLY.
-- Review first, then run once in the Supabase SQL Editor, AFTER:
--   1. filament_website_review_v1.sql
--   2. chasm_bridge_website_review_v1.sql
--   3. social_media_strategy_reviews_v1.sql
-- (those three replace the shared submit gate / completeness trigger with the
-- final 7-template count map; this file does NOT touch those two functions,
-- so it is order-safe relative to them — but the review_item_type widening in
-- section 1 below is required before any Website / Social Strategy entry can
-- be saved at all.)
--
-- WHAT THIS ADDS
--   One reviewer pass = one client_input_request. Sibling passes for the same
--   asset and cycle share a review_group_id. Entries stay UNIQUE
--   (request_id, review_item_key) — reviewer isolation comes from separate
--   request ids, exactly the isolation the existing schema already enforces.
--
--   1. review_item_type CHECK widened (Website Section / Social Media
--      Strategy Section) — atomic single ALTER, no unprotected window.
--   2. Review round + reviewer identity columns on client_input_requests
--      (review_group_id, reviewer_author_id, reviewer_display_name snapshot).
--   3. Section-level attribution on client_input_review_entries
--      (recorded_by_author_id / recorded_by_user_id + auth-stamp trigger).
--   4. Duplicate reviewer-pass protection (partial unique indexes, both
--      identity paths, NULL/legacy-safe).
--   5. create_internal_review_round / add_internal_reviewer_pass.
--   6. save_internal_client_input_review_entry — version-guarded save
--      (optimistic locking; stale writes are rejected, never merged).
--      The legacy upsert_internal_client_input_review_entry is left in
--      place untouched so the currently deployed frontend keeps working
--      until the new build ships; the new frontend uses only this function.
--   7. get_internal_peer_review_feedback — controlled, independence-first,
--      read-only peer visibility. Returns display names and timestamps,
--      never identity ids.
--   8. client_input_review_consolidations + save/get RPCs — Embark's final
--      agreed instruction per review round, stored beside (never over)
--      the original reviewer feedback.
--   9. get_internal_client_input_requests recreated with the three new
--      reviewer columns appended (return-type change requires DROP).
--
-- LEGACY CONTRACT: existing requests keep review_group_id / reviewer
-- identity = NULL and continue to work and display as single legacy reviews.
-- No historical rows are rewritten; no reviewers are fabricated.
-- =============================================================================

-- =============================================================================
-- 1. WIDEN review_item_type — required by the Website and Social Media
--    Strategy reviews. Single statement: the table is never left without
--    the constraint.
-- =============================================================================
ALTER TABLE client_input_review_entries
  DROP CONSTRAINT IF EXISTS client_input_review_entries_review_item_type_check,
  ADD CONSTRAINT client_input_review_entries_review_item_type_check
    CHECK (review_item_type IN (
      'Company Profile Page',
      'Presentation Slide',
      'Website Section',
      'Social Media Strategy Section'
    ));

-- =============================================================================
-- 2. REVIEW ROUND + REVIEWER IDENTITY (parent request level)
-- =============================================================================
-- review_group_id: links sibling reviewer passes for ONE review round of ONE
-- asset. NULL = legacy single review. Grouping is by this id only — never by
-- template + entity (that would merge unrelated rounds).
-- reviewer_author_id: the internal attributed reviewer (Active Editor model).
-- reviewer_display_name: snapshot at pass creation, so later author renames
-- never rewrite historical review records.
-- assigned_contributor_user_id (existing column) remains the authenticated
-- reviewer identity for when Secure Sign In returns.
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS review_group_id uuid,
  ADD COLUMN IF NOT EXISTS reviewer_author_id text REFERENCES update_authors(id),
  ADD COLUMN IF NOT EXISTS reviewer_display_name text;

CREATE INDEX IF NOT EXISTS idx_client_input_requests_review_group
  ON client_input_requests (review_group_id) WHERE review_group_id IS NOT NULL;

-- =============================================================================
-- 3. SECTION-LEVEL ATTRIBUTION (entry level)
-- =============================================================================
ALTER TABLE client_input_review_entries
  ADD COLUMN IF NOT EXISTS recorded_by_author_id text REFERENCES update_authors(id),
  ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid;

-- Authenticated writes stamp auth.uid() automatically; internal RPC writes
-- stamp recorded_by_author_id explicitly. The trigger only ever SETS a value
-- when a session exists — it never nulls existing attribution.
CREATE OR REPLACE FUNCTION stamp_review_entry_attribution() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.recorded_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_review_entry_attribution ON client_input_review_entries;
CREATE TRIGGER trg_stamp_review_entry_attribution BEFORE INSERT OR UPDATE ON client_input_review_entries
  FOR EACH ROW EXECUTE FUNCTION stamp_review_entry_attribution();

-- =============================================================================
-- 4. DUPLICATE REVIEWER-PASS PROTECTION
-- =============================================================================
-- One reviewer may hold at most one live pass per review round, on either
-- identity path. Partial indexes: legacy rows (NULL group / NULL reviewer)
-- are excluded entirely, so NULLs can never collide; archiving a mistaken
-- pass frees the slot; the same reviewer in a LATER round is a different
-- review_group_id and is always allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reviewer_pass_per_round_author
  ON client_input_requests (review_group_id, reviewer_author_id)
  WHERE review_group_id IS NOT NULL AND reviewer_author_id IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reviewer_pass_per_round_contributor
  ON client_input_requests (review_group_id, assigned_contributor_user_id)
  WHERE review_group_id IS NOT NULL AND assigned_contributor_user_id IS NOT NULL AND archived_at IS NULL;

-- =============================================================================
-- 5. CREATE A REVIEW ROUND WITH ONE PASS PER REVIEWER
-- =============================================================================
CREATE OR REPLACE FUNCTION create_internal_review_round(
  p_author_id text,
  p_template_id text,
  p_entity text,
  p_title_base text,
  p_reviewer_author_ids text[]
) RETURNS SETOF client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_group uuid := gen_random_uuid();
  v_reviewer record;
  v_reviewer_ids text[];
  v_id text;
  v_i integer := 0;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  IF p_title_base IS NULL OR btrim(p_title_base) = '' THEN
    RAISE EXCEPTION 'A review title is required';
  END IF;
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'A template is required';
  END IF;

  SELECT array_agg(DISTINCT rid) INTO v_reviewer_ids
  FROM unnest(p_reviewer_author_ids) AS rid WHERE rid IS NOT NULL AND btrim(rid) <> '';
  IF v_reviewer_ids IS NULL OR array_length(v_reviewer_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Select at least one reviewer';
  END IF;

  FOR v_reviewer IN
    SELECT ua.id, ua.display_name FROM update_authors ua
    WHERE ua.id = ANY(v_reviewer_ids) AND ua.is_active = true
    ORDER BY ua.display_name
  LOOP
    v_i := v_i + 1;
    v_id := 'req-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || v_i;
    INSERT INTO client_input_requests (
      id, title, entity, template_id, status, request_origin,
      created_by_author_id, client_reported_urgency,
      review_group_id, reviewer_author_id, reviewer_display_name
    ) VALUES (
      v_id,
      p_title_base || ' — ' || v_reviewer.display_name,
      p_entity, p_template_id, 'Draft', 'Internal Requested Input',
      p_author_id, 'Normal',
      v_group, v_reviewer.id, v_reviewer.display_name
    );
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (v_id, p_author_id,
      'Review round opened by ' || v_author_label || '. Reviewer: ' || v_reviewer.display_name || '.');
  END LOOP;

  IF v_i < array_length(v_reviewer_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected reviewers are not active team members';
  END IF;

  RETURN QUERY SELECT * FROM client_input_requests r WHERE r.review_group_id = v_group ORDER BY r.title;
END;
$$;

REVOKE ALL ON FUNCTION create_internal_review_round(text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_internal_review_round(text, text, text, text, text[]) TO anon, authenticated;

-- =============================================================================
-- 6. ADD A REVIEWER PASS TO AN EXISTING (CURRENT) ROUND
-- =============================================================================
CREATE OR REPLACE FUNCTION add_internal_reviewer_pass(
  p_author_id text,
  p_review_group_id uuid,
  p_reviewer_author_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_reviewer_name text;
  v_sibling client_input_requests;
  v_title_base text;
  v_id text;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT ua.display_name INTO v_reviewer_name
  FROM update_authors ua
  WHERE ua.id = p_reviewer_author_id AND ua.is_active = true;
  IF v_reviewer_name IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive reviewer id: %', p_reviewer_author_id;
  END IF;

  SELECT r.* INTO v_sibling FROM client_input_requests r
  WHERE r.review_group_id = p_review_group_id AND r.archived_at IS NULL
  ORDER BY r.created_at ASC LIMIT 1;
  IF v_sibling.id IS NULL THEN
    RAISE EXCEPTION 'Review round not found';
  END IF;

  IF EXISTS (SELECT 1 FROM client_input_review_consolidations c WHERE c.review_group_id = p_review_group_id) THEN
    RAISE EXCEPTION 'This review round has already been consolidated — start a new review round instead';
  END IF;

  IF EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.review_group_id = p_review_group_id
      AND r.reviewer_author_id = p_reviewer_author_id
      AND r.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION '% is already a reviewer in this review round', v_reviewer_name;
  END IF;

  -- Title base: strip the sibling's own reviewer suffix when present.
  v_title_base := CASE
    WHEN v_sibling.reviewer_display_name IS NOT NULL
      THEN replace(v_sibling.title, ' — ' || v_sibling.reviewer_display_name, '')
    ELSE v_sibling.title
  END;

  v_id := 'req-op-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-a';
  INSERT INTO client_input_requests (
    id, title, entity, template_id, status, request_origin,
    created_by_author_id, client_reported_urgency,
    review_group_id, reviewer_author_id, reviewer_display_name
  ) VALUES (
    v_id, v_title_base || ' — ' || v_reviewer_name,
    v_sibling.entity, v_sibling.template_id, 'Draft', 'Internal Requested Input',
    p_author_id, 'Normal',
    p_review_group_id, p_reviewer_author_id, v_reviewer_name
  )
  RETURNING * INTO v_row;

  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (v_id, p_author_id,
    'Reviewer added to the current review round by ' || v_author_label || '. Reviewer: ' || v_reviewer_name || '.');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION add_internal_reviewer_pass(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_internal_reviewer_pass(text, uuid, text) TO anon, authenticated;

-- =============================================================================
-- 7. VERSION-GUARDED SECTION SAVE (optimistic locking + attribution)
-- =============================================================================
-- Replaces the frontend's use of upsert_internal_client_input_review_entry.
-- p_expected_updated_at is the updated_at value the caller LOADED:
--   - first save of a section  -> NULL expected, row must not exist;
--   - re-save of a section     -> must equal the row's current updated_at.
-- Any mismatch is rejected with a clear reload message — the newer database
-- content is never silently overwritten, and a stale tab can never win.
-- The row is locked (FOR UPDATE) so two same-millisecond saves serialise.
CREATE OR REPLACE FUNCTION save_internal_client_input_review_entry(
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
  p_additional_comments text,
  p_expected_updated_at timestamptz
) RETURNS client_input_review_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_request_status text;
  v_current_updated_at timestamptz;
  v_exists boolean := false;
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

  SELECT e.updated_at, true INTO v_current_updated_at, v_exists
  FROM client_input_review_entries e
  WHERE e.request_id = p_request_id AND e.review_item_key = p_review_item_key
  FOR UPDATE;

  IF (v_exists AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at)
     OR (NOT v_exists AND p_expected_updated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This section changed after you opened it. Reload the latest version before saving.';
  END IF;

  INSERT INTO client_input_review_entries (
    request_id, review_item_key, review_item_type, review_item_number,
    review_item_title, review_group, review_status, current_concern,
    remove_this, replacement_copy, copy_treatment, visual_direction,
    structure_changes, additional_comments, recorded_by_author_id, updated_at
  ) VALUES (
    p_request_id, p_review_item_key, p_review_item_type, p_review_item_number,
    p_review_item_title, p_review_group, p_review_status, p_current_concern,
    p_remove_this, p_replacement_copy, p_copy_treatment, p_visual_direction,
    p_structure_changes, p_additional_comments, p_author_id, now()
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
    recorded_by_author_id = EXCLUDED.recorded_by_author_id,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION save_internal_client_input_review_entry(text, text, text, text, integer, text, text, text, text, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_internal_client_input_review_entry(text, text, text, text, integer, text, text, text, text, text, text, text, text, text, text, timestamptz) TO anon, authenticated;

-- =============================================================================
-- 8. CONTROLLED PEER FEEDBACK READ (independence-first, read-only, no ids)
-- =============================================================================
-- Returns the SAVED feedback of the OTHER reviewer passes in the same review
-- round for one review item — and only after the calling pass has saved its
-- own response for that item (enforced here, not just in the UI). Explicit
-- projection: display names and timestamps only; no request ids, author ids
-- or user uuids are returned.
CREATE OR REPLACE FUNCTION get_internal_peer_review_feedback(
  p_author_id text,
  p_request_id text,
  p_review_item_key text
) RETURNS TABLE (
  reviewer_display_name text,
  review_status text,
  current_concern text,
  remove_this text,
  replacement_copy text,
  copy_treatment text,
  visual_direction text,
  structure_changes text,
  additional_comments text,
  saved_at timestamptz,
  reviewer_submitted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
  v_group uuid;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT r.review_group_id INTO v_group
  FROM client_input_requests r WHERE r.id = p_request_id;
  IF v_group IS NULL THEN
    RETURN; -- legacy single review: no peers
  END IF;

  -- Independence-first: reveal peers only after the caller's pass has saved
  -- its own response for this item.
  IF NOT EXISTS (
    SELECT 1 FROM client_input_review_entries e
    WHERE e.request_id = p_request_id
      AND e.review_item_key = p_review_item_key
      AND e.review_status <> 'Not Reviewed'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(r2.reviewer_display_name, 'Reviewer'),
    e.review_status,
    e.current_concern, e.remove_this, e.replacement_copy, e.copy_treatment,
    e.visual_direction, e.structure_changes, e.additional_comments,
    e.updated_at,
    (r2.submitted_at IS NOT NULL)
  FROM client_input_review_entries e
  JOIN client_input_requests r2 ON r2.id = e.request_id
  WHERE r2.review_group_id = v_group
    AND r2.id <> p_request_id
    AND r2.archived_at IS NULL
    AND e.review_item_key = p_review_item_key
    AND e.review_status <> 'Not Reviewed'
  ORDER BY e.updated_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_peer_review_feedback(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_peer_review_feedback(text, text, text) TO anon, authenticated;

-- =============================================================================
-- 9. EMBARK CONSOLIDATION — final agreed instruction per review round
-- =============================================================================
-- A separate lightweight record: original reviewer feedback is never edited
-- or overwritten; the consolidation sits beside it with its own provenance.
CREATE TABLE IF NOT EXISTS client_input_review_consolidations (
  review_group_id uuid PRIMARY KEY,
  final_instruction text NOT NULL,
  driving_request_id text REFERENCES client_input_requests(id) ON DELETE SET NULL,
  decided_by_author_id text REFERENCES update_authors(id),
  decided_by_label text,
  decided_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_input_review_consolidations ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated table policies: all access flows through the narrow
-- SECURITY DEFINER functions below. Admin keeps full direct access.
DROP POLICY IF EXISTS "Admin full access review_consolidations" ON client_input_review_consolidations;
CREATE POLICY "Admin full access review_consolidations" ON client_input_review_consolidations
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Embark-only write: consolidation is a delivery decision.
CREATE OR REPLACE FUNCTION save_internal_review_consolidation(
  p_author_id text,
  p_review_group_id uuid,
  p_final_instruction text,
  p_driving_request_id text
) RETURNS client_input_review_consolidations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_author_org text;
  v_row client_input_review_consolidations;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label, ua.organisation_label
  INTO v_author_label, v_author_org
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;
  IF v_author_org IS DISTINCT FROM 'Embark Digitals' THEN
    RAISE EXCEPTION 'Consolidating reviewer feedback is an Embark Digitals decision — switch the Active Editor to an Embark member';
  END IF;

  IF p_final_instruction IS NULL OR btrim(p_final_instruction) = '' THEN
    RAISE EXCEPTION 'The final agreed instruction cannot be empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM client_input_requests r WHERE r.review_group_id = p_review_group_id) THEN
    RAISE EXCEPTION 'Review round not found';
  END IF;
  IF p_driving_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM client_input_requests r
    WHERE r.id = p_driving_request_id AND r.review_group_id = p_review_group_id
  ) THEN
    RAISE EXCEPTION 'The production-driving review must belong to this review round';
  END IF;

  INSERT INTO client_input_review_consolidations (
    review_group_id, final_instruction, driving_request_id,
    decided_by_author_id, decided_by_label, decided_at, updated_at
  ) VALUES (
    p_review_group_id, p_final_instruction, p_driving_request_id,
    p_author_id, v_author_label, now(), now()
  )
  ON CONFLICT (review_group_id) DO UPDATE SET
    final_instruction = EXCLUDED.final_instruction,
    driving_request_id = EXCLUDED.driving_request_id,
    decided_by_author_id = EXCLUDED.decided_by_author_id,
    decided_by_label = EXCLUDED.decided_by_label,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION save_internal_review_consolidation(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_internal_review_consolidation(text, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_internal_review_consolidation(
  p_author_id text,
  p_review_group_id uuid
) RETURNS SETOF client_input_review_consolidations
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
  SELECT c.* FROM client_input_review_consolidations c
  WHERE c.review_group_id = p_review_group_id;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_review_consolidation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_review_consolidation(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 10. INTERNAL REGISTER READ — recreated with reviewer columns appended
--     (return-type change requires DROP; same established pattern as the
--     archived_at recreation in client_access_and_request_retention.sql)
-- =============================================================================
DROP FUNCTION IF EXISTS get_internal_client_input_requests(text);

CREATE FUNCTION get_internal_client_input_requests(p_author_id text)
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
  review_completed bigint,
  linked_tracker_item_id text,
  linked_tracker_item_title text,
  linked_tracker_item_phase text,
  linked_tracker_item_status text,
  linked_tracker_item_entity text,
  archived_at timestamptz,
  review_group_id uuid,
  reviewer_author_id text,
  reviewer_display_name text
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
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id AND e.review_status <> 'Not Reviewed'),
    r.linked_tracker_item_id,
    ti.title,
    ti.phase,
    ti.status,
    ti.entity,
    r.archived_at,
    r.review_group_id,
    r.reviewer_author_id,
    r.reviewer_display_name
  FROM client_input_requests r
  LEFT JOIN client_input_templates t ON t.id = r.template_id
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  LEFT JOIN update_authors cba ON cba.id = r.created_by_author_id
  LEFT JOIN tracker_items ti ON ti.id = r.linked_tracker_item_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_requests(text) TO anon, authenticated;
