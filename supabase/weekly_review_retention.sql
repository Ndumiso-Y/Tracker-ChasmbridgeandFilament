-- Weekly Review Retention — Embark-Only Removal Authority (V4A.17)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor after review.
--
-- Same retention model as tickets and requests:
--   - Permanent delete ONLY for a review that never became evidence: still
--     'Awaiting Client Review', zero feedback items, never submitted.
--     (Linked weekly_review_tracker_items junction rows cascade — they are
--     linkage, not audit.)
--   - Anything submitted or reviewed is delivery-assurance history between
--     three organisations: ARCHIVE only, reversible.
--   - Authority is Embark-only, enforced SERVER-SIDE: the acting Active
--     Editor must be active AND organisation_label = 'Embark Digitals'.
--     Clients never see or reach these actions.
--
-- get_internal_weekly_reviews is recreated (same input signature) with
-- archived_at added to its return contract — the established versioning
-- pattern. No RLS changes, no anon table access, no generic delete.

-- =============================================================================
-- 1. ARCHIVE COLUMN
-- =============================================================================
ALTER TABLE weekly_delivery_reviews
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_weekly_delivery_reviews_archived_at
  ON weekly_delivery_reviews (archived_at);

-- =============================================================================
-- 2. EMBARK-ONLY ARCHIVE / UNARCHIVE
-- =============================================================================
CREATE OR REPLACE FUNCTION archive_internal_weekly_review(
  p_author_id text,
  p_review_id uuid
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
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may archive weekly reviews.';
  END IF;

  SELECT * INTO v_row FROM weekly_delivery_reviews WHERE id = p_review_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Weekly review not found: %', p_review_id;
  END IF;
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This weekly review is already archived.';
  END IF;

  UPDATE weekly_delivery_reviews
  SET archived_at = now()
  WHERE id = p_review_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION archive_internal_weekly_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION archive_internal_weekly_review(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION unarchive_internal_weekly_review(
  p_author_id text,
  p_review_id uuid
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
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may restore archived weekly reviews.';
  END IF;

  SELECT * INTO v_row FROM weekly_delivery_reviews WHERE id = p_review_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Weekly review not found: %', p_review_id;
  END IF;
  IF v_row.archived_at IS NULL THEN
    RAISE EXCEPTION 'This weekly review is not archived.';
  END IF;

  UPDATE weekly_delivery_reviews
  SET archived_at = NULL
  WHERE id = p_review_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION unarchive_internal_weekly_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unarchive_internal_weekly_review(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 3. EMBARK-ONLY EMPTY-REVIEW DELETE
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_internal_empty_weekly_review(
  p_author_id text,
  p_review_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_status text;
  v_submitted_at timestamptz;
  v_feedback_count bigint;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may delete weekly reviews.';
  END IF;

  SELECT review_status, submitted_at INTO v_status, v_submitted_at
  FROM weekly_delivery_reviews WHERE id = p_review_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Weekly review not found: %', p_review_id;
  END IF;
  IF v_status <> 'Awaiting Client Review' THEN
    RAISE EXCEPTION 'Only a review still awaiting the client (with no feedback) can be deleted. This review is % — use Archive instead.', v_status;
  END IF;

  SELECT count(*) INTO v_feedback_count
  FROM weekly_review_feedback_items WHERE review_id = p_review_id;
  IF v_feedback_count > 0 THEN
    RAISE EXCEPTION 'This review carries % feedback item(s) — use Archive instead.', v_feedback_count;
  END IF;

  -- Junction rows (weekly_review_tracker_items) and any feedback cascade
  -- via their ON DELETE CASCADE foreign keys.
  DELETE FROM weekly_delivery_reviews WHERE id = p_review_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_internal_empty_weekly_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_internal_empty_weekly_review(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 4. RECREATE INTERNAL WEEKLY REGISTER READ — add archived_at
-- =============================================================================
DROP FUNCTION IF EXISTS get_internal_weekly_reviews(text);

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
    r.created_at,
    r.archived_at
  FROM weekly_delivery_reviews r
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_weekly_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_weekly_reviews(text) TO anon, authenticated;
