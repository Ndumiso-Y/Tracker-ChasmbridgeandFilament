-- Internal Operator Collaboration Reads — Support & Weekly Review (V4A.11)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- DEPENDENCIES (all already live): collaboration_layer_schema.sql,
-- delivery_assurance_operational_fields.sql,
-- weekly_review_assignment_workflow.sql, weekly_review_numeric_scorecard.sql,
-- internal_operator_creation_workflow.sql,
-- client_input_persistence_and_guided_reviews.sql.
--
-- WHAT THIS FIXES: the exact same confirmed defect class already fixed for
-- Client Input in V4A.10 — the no-session Active Editor CREATES support
-- tickets and weekly reviews through SECURITY DEFINER RPCs (rows persist),
-- but the register/detail READS are direct anon SELECTs that RLS silently
-- filters to zero rows. The tickets and reviews therefore "disappear" the
-- moment the operator navigates away and returns; only an optimistic
-- React-state merge made them look saved. These four narrow, Active-Editor-
-- validated read functions are the same pattern as
-- get_internal_client_input_requests. No anon SELECT policy is added to any
-- collaboration table; no USING (true); no FOR ALL; client contributor and
-- admin RLS are untouched; nothing here writes any data.

-- =============================================================================
-- 1. SUPPORT TICKET REGISTER READ
-- =============================================================================
CREATE OR REPLACE FUNCTION get_internal_support_tickets(p_author_id text)
RETURNS TABLE (
  id text,
  title text,
  entity text,
  category text,
  issue_type text,
  status text,
  priority text,
  description text,
  expected_outcome text,
  client_reported_urgency text,
  evidence_url text,
  linked_tracker_item_id text,
  linked_tracker_item_title text,
  investigation_summary text,
  action_taken text,
  acknowledged_at timestamptz,
  resolution_proposed_at timestamptz,
  client_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    st.id, st.title, st.entity, st.category, st.issue_type, st.status,
    st.priority, st.description, st.expected_outcome,
    st.client_reported_urgency, st.evidence_url,
    st.linked_tracker_item_id, ti.title,
    st.investigation_summary, st.action_taken,
    st.acknowledged_at, st.resolution_proposed_at, st.client_confirmed_at,
    st.created_at, st.updated_at
  FROM support_tickets st
  LEFT JOIN tracker_items ti ON ti.id = st.linked_tracker_item_id
  ORDER BY st.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_support_tickets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_support_tickets(text) TO anon, authenticated;

-- =============================================================================
-- 2. WEEKLY REVIEW REGISTER READ
-- =============================================================================
CREATE OR REPLACE FUNCTION get_internal_weekly_reviews(p_author_id text)
RETURNS TABLE (
  id uuid,
  entity text,
  review_period_start date,
  review_period_end date,
  review_status text,
  assigned_contributor_user_id uuid,
  assigned_contributor_name text,
  opened_at timestamptz,
  submitted_at timestamptz,
  overall_delivery text,
  communication_rating text,
  delivery_timing text,
  requirement_understanding text,
  issue_resolution text,
  approval_process text,
  delivery_score integer,
  communication_score integer,
  timing_score integer,
  requirement_understanding_score integer,
  issue_resolution_score integer,
  approval_process_score integer,
  worked_well text,
  could_improve text,
  did_not_meet_expectations text,
  next_week_priority_1 text,
  next_week_priority_2 text,
  next_week_priority_3 text,
  created_at timestamptz
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
    r.id, r.entity, r.review_period_start, r.review_period_end,
    r.review_status, r.assigned_contributor_user_id, uap.display_name,
    r.opened_at, r.submitted_at,
    r.overall_delivery, r.communication_rating, r.delivery_timing,
    r.requirement_understanding, r.issue_resolution, r.approval_process,
    r.delivery_score, r.communication_score, r.timing_score,
    r.requirement_understanding_score, r.issue_resolution_score, r.approval_process_score,
    r.worked_well, r.could_improve, r.did_not_meet_expectations,
    r.next_week_priority_1, r.next_week_priority_2, r.next_week_priority_3,
    r.created_at
  FROM weekly_delivery_reviews r
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_weekly_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_weekly_reviews(text) TO anon, authenticated;

-- =============================================================================
-- 3. WEEKLY REVIEW FEEDBACK ITEMS READ (detail view)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_internal_weekly_review_feedback(p_author_id text, p_review_id uuid)
RETURNS TABLE (
  id uuid,
  feedback_category text,
  feedback_text text,
  sentiment text,
  disposition text,
  admin_response text,
  created_at timestamptz
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
  SELECT fi.id, fi.feedback_category, fi.feedback_text, fi.sentiment,
         fi.disposition, fi.admin_response, fi.created_at
  FROM weekly_review_feedback_items fi
  WHERE fi.review_id = p_review_id
  ORDER BY fi.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_weekly_review_feedback(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_weekly_review_feedback(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 4. WEEKLY REVIEW LINKED TRACKER ITEMS READ (detail view)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_internal_weekly_review_tracker_items(p_author_id text, p_review_id uuid)
RETURNS TABLE (
  id uuid,
  tracker_item_id text,
  tracker_item_title text
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
  SELECT wrt.id, wrt.tracker_item_id, ti.title
  FROM weekly_review_tracker_items wrt
  LEFT JOIN tracker_items ti ON ti.id = wrt.tracker_item_id
  WHERE wrt.review_id = p_review_id
  ORDER BY ti.title ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_weekly_review_tracker_items(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_weekly_review_tracker_items(text, uuid) TO anon, authenticated;

-- =============================================================================
-- KNOWN, DELIBERATELY UNRESOLVED GAP (reported, not half-built here):
-- the no-session operator still cannot perform ticket lifecycle WRITES
-- (Mark as Resolved sets resolution_proposed_at, an admin-protected column
-- in protect_support_columns) or mark a weekly review 'Reviewed'
-- (protect_review_columns restricts non-admin transitions to 'Submitted').
-- Those actions are correctly hidden behind the authenticated-admin UI
-- today. Enabling them for the no-session persona would require either
-- widening the live triggers or a second internal_operator_bridge-style
-- exemption — a deliberate architecture decision, not a read fix, so it is
-- NOT smuggled into this migration.
