-- Weekly Review Assignment & Claim Workflow (V4A.12)
-- Additive, idempotent migration to make contributor assignment optional at
-- review creation, allow later admin assignment, and enable concurrency-safe
-- claiming by authenticated clients.
--
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor.

-- =============================================================================
-- 1. OPEN WEEKLY REVIEW (Corrected to allow NULL contributor)
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
  v_contributor_active boolean;
  v_contributor_scope text;
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

  -- When a contributor is supplied at creation time, validate them before INSERT.
  -- NULL contributor is allowed (review opens unassigned — no blocking).
  IF p_assigned_contributor_user_id IS NOT NULL THEN
    SELECT is_active, entity_scope INTO v_contributor_active, v_contributor_scope
    FROM user_access_profiles
    WHERE user_id = p_assigned_contributor_user_id AND role = 'client_contributor';

    IF v_contributor_active IS NULL OR NOT v_contributor_active THEN
      RAISE EXCEPTION 'Supplied contributor is invalid or inactive';
    END IF;

    IF v_contributor_scope != 'Both' AND v_contributor_scope != p_entity THEN
      RAISE EXCEPTION 'Supplied contributor does not have access to entity: %', p_entity;
    END IF;
  END IF;

  INSERT INTO weekly_delivery_reviews (
    entity, review_period_start, review_period_end, assigned_contributor_user_id,
    review_status, opened_at, submitted_at, overall_delivery
  ) VALUES (
    p_entity, p_review_period_start, p_review_period_end, p_assigned_contributor_user_id,
    'Awaiting Client Review', now(), NULL, NULL
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION open_internal_weekly_review(text, text, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_internal_weekly_review(text, text, date, date, uuid) TO anon, authenticated;


-- =============================================================================
-- 1b. OPEN WEEKLY REVIEW WITH ATOMIC TRACKER ITEM LINKAGE
-- =============================================================================
-- Narrow RPC for the internal Active Editor open path: creates the review AND
-- inserts weekly_review_tracker_items junction rows in one function invocation.
-- This eliminates the client-side post-create linkage loop (which had no
-- protected write path for the no-session Active Editor persona) and prevents
-- partial linkage if any later insert fails.
-- All tracker items are validated server-side before any INSERT proceeds.
CREATE OR REPLACE FUNCTION open_internal_weekly_review_with_items(
  p_author_id text,
  p_entity text,
  p_review_period_start date,
  p_review_period_end date,
  p_assigned_contributor_user_id uuid,
  p_tracker_item_ids text[]
) RETURNS weekly_delivery_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row weekly_delivery_reviews;
  v_contributor_active boolean;
  v_contributor_scope text;
  v_item_id text;
  v_item_phase text;
  v_item_entity text;
BEGIN
  -- Validate Active Editor
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  -- Validate period
  IF p_review_period_start IS NULL OR p_review_period_end IS NULL THEN
    RAISE EXCEPTION 'Review period start and end are required';
  END IF;

  -- Validate optional contributor
  IF p_assigned_contributor_user_id IS NOT NULL THEN
    SELECT is_active, entity_scope INTO v_contributor_active, v_contributor_scope
    FROM user_access_profiles
    WHERE user_id = p_assigned_contributor_user_id AND role = 'client_contributor';

    IF v_contributor_active IS NULL OR NOT v_contributor_active THEN
      RAISE EXCEPTION 'Supplied contributor is invalid or inactive';
    END IF;

    IF v_contributor_scope != 'Both' AND v_contributor_scope != p_entity THEN
      RAISE EXCEPTION 'Supplied contributor does not have access to entity: %', p_entity;
    END IF;
  END IF;

  -- Validate all supplied tracker items before touching any table.
  -- Each must exist in Phase 2 or Phase 3 and belong to the review entity
  -- (or entity = 'Both', which spans all entities).
  IF p_tracker_item_ids IS NOT NULL THEN
    FOREACH v_item_id IN ARRAY p_tracker_item_ids LOOP
      SELECT phase, entity INTO v_item_phase, v_item_entity
      FROM tracker_items
      WHERE id = v_item_id;

      IF v_item_phase IS NULL THEN
        RAISE EXCEPTION 'Tracker item not found: %', v_item_id;
      END IF;

      IF v_item_phase NOT IN ('Phase 2', 'Phase 3') THEN
        RAISE EXCEPTION 'Tracker item % is not a Phase 2 or Phase 3 item (phase: %)', v_item_id, v_item_phase;
      END IF;

      -- Entity relevance: item must belong to the review entity or be 'Both'
      IF v_item_entity != 'Both' AND p_entity != 'Both' AND v_item_entity != p_entity THEN
        RAISE EXCEPTION 'Tracker item % (entity: %) is not relevant to review entity: %', v_item_id, v_item_entity, p_entity;
      END IF;
    END LOOP;
  END IF;

  -- Create the review
  INSERT INTO weekly_delivery_reviews (
    entity, review_period_start, review_period_end, assigned_contributor_user_id,
    review_status, opened_at, submitted_at, overall_delivery
  ) VALUES (
    p_entity, p_review_period_start, p_review_period_end, p_assigned_contributor_user_id,
    'Awaiting Client Review', now(), NULL, NULL
  )
  RETURNING * INTO v_row;

  -- Link validated tracker items atomically (within same function/transaction)
  IF p_tracker_item_ids IS NOT NULL THEN
    FOREACH v_item_id IN ARRAY p_tracker_item_ids LOOP
      INSERT INTO weekly_review_tracker_items (review_id, tracker_item_id)
      VALUES (v_row.id, v_item_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION open_internal_weekly_review_with_items(text, text, date, date, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_internal_weekly_review_with_items(text, text, date, date, uuid, text[]) TO anon, authenticated;




-- =============================================================================
-- 2. LATER ASSIGNMENT RPC (For Internal Active Editor)
-- =============================================================================
CREATE OR REPLACE FUNCTION assign_internal_weekly_review_contributor(
  p_author_id text,
  p_review_id uuid,
  p_contributor_user_id uuid
) RETURNS weekly_delivery_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row weekly_delivery_reviews;
  v_current_status text;
  v_entity text;
  v_contributor_active boolean;
  v_contributor_scope text;
BEGIN
  -- Validate Active Editor
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  -- Load review and status
  SELECT review_status, entity INTO v_current_status, v_entity
  FROM weekly_delivery_reviews
  WHERE id = p_review_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Weekly review not found';
  END IF;

  IF v_current_status != 'Awaiting Client Review' THEN
    RAISE EXCEPTION 'Cannot reassign a review after it has been submitted (Status: %)', v_current_status;
  END IF;

  -- Validate selected contributor
  IF p_contributor_user_id IS NOT NULL THEN
    SELECT is_active, entity_scope INTO v_contributor_active, v_contributor_scope
    FROM user_access_profiles
    WHERE user_id = p_contributor_user_id AND role = 'client_contributor';

    IF v_contributor_active IS NULL OR NOT v_contributor_active THEN
      RAISE EXCEPTION 'Selected contributor is invalid or inactive';
    END IF;

    IF v_contributor_scope != 'Both' AND v_contributor_scope != v_entity THEN
      RAISE EXCEPTION 'Selected contributor does not have access to entity: %', v_entity;
    END IF;
  END IF;

  -- Update assignment
  UPDATE weekly_delivery_reviews
  SET assigned_contributor_user_id = p_contributor_user_id
  WHERE id = p_review_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION assign_internal_weekly_review_contributor(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_internal_weekly_review_contributor(text, uuid, uuid) TO anon, authenticated;


-- =============================================================================
-- 3. CONCURRENCY-SAFE CLIENT CLAIMING
-- =============================================================================
-- Update the RLS UPDATE policy to allow a client to update a review if it is
-- either already assigned to them, OR if it is currently UNASSIGNED and they
-- have entity access.
DROP POLICY IF EXISTS "Contributors update assigned pending reviews" ON weekly_delivery_reviews;
CREATE POLICY "Contributors update assigned pending reviews" ON weekly_delivery_reviews FOR UPDATE TO authenticated USING (
  (assigned_contributor_user_id = auth.uid() OR (assigned_contributor_user_id IS NULL AND has_entity_access(entity)))
  AND review_status = 'Awaiting Client Review'
) WITH CHECK (
  -- Client must assign themselves when saving/submitting
  assigned_contributor_user_id = auth.uid()
);

-- Update the trigger to allow the FIRST assignment by a contributor.
CREATE OR REPLACE FUNCTION protect_review_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  -- Allow claim if unassigned, but block reassignment if already assigned
  IF OLD.assigned_contributor_user_id IS NOT NULL AND NEW.assigned_contributor_user_id IS DISTINCT FROM OLD.assigned_contributor_user_id THEN
    RAISE EXCEPTION 'Contributors cannot reassign a weekly review';
  END IF;

  IF OLD.assigned_contributor_user_id IS NULL AND NEW.assigned_contributor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Contributors can only assign themselves to an unassigned review';
  END IF;

  IF NEW.entity IS DISTINCT FROM OLD.entity THEN
    RAISE EXCEPTION 'Contributors cannot change the review entity';
  END IF;

  IF NEW.review_period_start IS DISTINCT FROM OLD.review_period_start
     OR NEW.review_period_end IS DISTINCT FROM OLD.review_period_end THEN
    RAISE EXCEPTION 'Contributors cannot change the review period';
  END IF;

  IF NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'Contributors cannot change when the review was opened';
  END IF;

  IF NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status != 'Submitted' THEN
    RAISE EXCEPTION 'Contributors can only submit a review (Awaiting Client Review -> Submitted)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
