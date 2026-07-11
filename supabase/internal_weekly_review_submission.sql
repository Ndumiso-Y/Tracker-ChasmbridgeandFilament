-- =============================================================================
-- INTERNAL WEEKLY REVIEW SUBMISSION — complete the scorecard without sign-ins
-- =============================================================================
-- Product owner decision (2026-07-11): the Magic Link sign-in layer is parked
-- (SECURE_SIGN_IN_ENABLED = false), which left weekly reviews with no in-app
-- actor able to complete them — the scorecard was client-session-only, so an
-- open review showed only a read-out ("we cannot review").
--
-- This migration gives the no-session Active Editor persona a submission path,
-- mirroring the rest of the workflow ("the client tells you, an editor
-- records it"):
--   - submit_internal_weekly_review: author-validated SECURITY DEFINER write.
--     Only reviews still 'Awaiting Client Review' and not archived can be
--     submitted; the delivery score is required; scores obey the existing
--     1–10 CHECK constraints; status moves to 'Submitted' exactly as the
--     client path does. The live protect_review_columns trigger already
--     permits this transition (entity/period/assignment stay untouched).
--   - submitted_by_author_id records WHO recorded the submission, and the
--     register read is recreated to return a display label for it.
-- No RLS policy is widened; sign-in based submission continues to work
-- unchanged whenever the flag comes back on.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- =============================================================================

-- 1. Provenance column
ALTER TABLE weekly_delivery_reviews ADD COLUMN IF NOT EXISTS submitted_by_author_id text;

-- =============================================================================
-- 2. INTERNAL SUBMISSION RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION submit_internal_weekly_review(
  p_author_id text,
  p_review_id uuid,
  p_delivery_score integer,
  p_communication_score integer DEFAULT NULL,
  p_timing_score integer DEFAULT NULL,
  p_requirement_understanding_score integer DEFAULT NULL,
  p_issue_resolution_score integer DEFAULT NULL,
  p_approval_process_score integer DEFAULT NULL,
  p_worked_well text DEFAULT NULL,
  p_could_improve text DEFAULT NULL,
  p_did_not_meet_expectations text DEFAULT NULL,
  p_next_week_priority_1 text DEFAULT NULL,
  p_next_week_priority_2 text DEFAULT NULL,
  p_next_week_priority_3 text DEFAULT NULL
) RETURNS weekly_delivery_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row weekly_delivery_reviews;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT * INTO v_row FROM weekly_delivery_reviews WHERE weekly_delivery_reviews.id = p_review_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Weekly review not found';
  END IF;
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This review is archived — unarchive it before submitting';
  END IF;
  IF v_row.review_status IS DISTINCT FROM 'Awaiting Client Review' THEN
    RAISE EXCEPTION 'Only a review that is Awaiting Client Review can be submitted (current status: %)', v_row.review_status;
  END IF;
  IF p_delivery_score IS NULL THEN
    RAISE EXCEPTION 'The delivery score is required';
  END IF;

  -- Score ranges are additionally enforced by the table's 1–10 CHECKs.
  UPDATE weekly_delivery_reviews
  SET delivery_score = p_delivery_score,
      communication_score = p_communication_score,
      timing_score = p_timing_score,
      requirement_understanding_score = p_requirement_understanding_score,
      issue_resolution_score = p_issue_resolution_score,
      approval_process_score = p_approval_process_score,
      worked_well = nullif(trim(coalesce(p_worked_well, '')), ''),
      could_improve = nullif(trim(coalesce(p_could_improve, '')), ''),
      did_not_meet_expectations = nullif(trim(coalesce(p_did_not_meet_expectations, '')), ''),
      next_week_priority_1 = nullif(trim(coalesce(p_next_week_priority_1, '')), ''),
      next_week_priority_2 = nullif(trim(coalesce(p_next_week_priority_2, '')), ''),
      next_week_priority_3 = nullif(trim(coalesce(p_next_week_priority_3, '')), ''),
      submitted_by_author_id = p_author_id,
      submitted_at = now(),
      review_status = 'Submitted'
  WHERE weekly_delivery_reviews.id = p_review_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION submit_internal_weekly_review(text, uuid, integer, integer, integer, integer, integer, integer, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_internal_weekly_review(text, uuid, integer, integer, integer, integer, integer, integer, text, text, text, text, text, text) TO anon, authenticated;

-- =============================================================================
-- 3. REGISTER READ — recreated to return the recorder's label
--    (return-type change needs DROP)
-- =============================================================================
DROP FUNCTION IF EXISTS get_internal_weekly_reviews(text);

CREATE FUNCTION get_internal_weekly_reviews(p_author_id text)
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
  submitted_by_label text,
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
  created_at timestamptz,
  archived_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  -- NOTE: lookups must stay table-qualified — this function's RETURNS TABLE
  -- declares an "id" output column; an unqualified reference is ambiguous
  -- (42702) and fails every call.
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
    sub.display_name || ' — ' || sub.organisation_label,
    r.overall_delivery, r.communication_rating, r.delivery_timing,
    r.requirement_understanding, r.issue_resolution, r.approval_process,
    r.delivery_score, r.communication_score, r.timing_score,
    r.requirement_understanding_score, r.issue_resolution_score, r.approval_process_score,
    r.worked_well, r.could_improve, r.did_not_meet_expectations,
    r.next_week_priority_1, r.next_week_priority_2, r.next_week_priority_3,
    r.created_at,
    r.archived_at
  FROM weekly_delivery_reviews r
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  LEFT JOIN update_authors sub ON sub.id = r.submitted_by_author_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_weekly_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_weekly_reviews(text) TO anon, authenticated;
