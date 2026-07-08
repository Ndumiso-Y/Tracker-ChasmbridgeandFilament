-- Weekly Delivery Review — Assignment & Lifecycle Workflow (V4A.2)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- Problem this fixes: weekly_delivery_reviews previously only represented an
-- already-completed submission (overall_delivery was NOT NULL, no
-- assignment/status column existed). There was no way for an admin to open
-- and assign a review period before the client has actually rated anything.
--
-- This migration is purely additive: no table is dropped, no row is
-- deleted, no existing review text or weekly_review_feedback_items
-- provenance is altered.

-- 1. New lifecycle columns.
ALTER TABLE weekly_delivery_reviews
  ADD COLUMN IF NOT EXISTS assigned_contributor_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

-- 2. Backfill existing rows. Every row created under the prior contract
-- already represents a completed submission (overall_delivery and
-- submitted_at were required at insert time), so backfill them as
-- 'Submitted' — never as a pending state, which would misrepresent
-- feedback that has already been delivered.
UPDATE weekly_delivery_reviews
SET review_status = 'Submitted'
WHERE review_status IS NULL;

-- 3. A newly admin-opened review has no rating yet and must not be forced
-- to carry a fabricated overall_delivery value (no '0', 'Pending', 'N/A',
-- etc.) merely to satisfy the old constraint.
ALTER TABLE weekly_delivery_reviews
  ALTER COLUMN overall_delivery DROP NOT NULL;

-- 4. Enforce the lifecycle contract now that every existing row has a
-- real status value.
ALTER TABLE weekly_delivery_reviews
  ALTER COLUMN review_status SET DEFAULT 'Awaiting Client Review',
  ALTER COLUMN review_status SET NOT NULL;

ALTER TABLE weekly_delivery_reviews DROP CONSTRAINT IF EXISTS weekly_delivery_reviews_review_status_check;
ALTER TABLE weekly_delivery_reviews ADD CONSTRAINT weekly_delivery_reviews_review_status_check
  CHECK (review_status IN ('Awaiting Client Review', 'Submitted', 'Reviewed'));

-- 5. RLS: a contributor may only read reviews assigned to them. Legacy rows
-- with no assignment (assigned_contributor_user_id IS NULL) remain visible
-- to any contributor with matching entity access, so historical
-- already-submitted reviews are not retroactively hidden.
DROP POLICY IF EXISTS "Contributors select entity reviews" ON weekly_delivery_reviews;
DROP POLICY IF EXISTS "Contributors select assigned entity reviews" ON weekly_delivery_reviews;
CREATE POLICY "Contributors select assigned entity reviews" ON weekly_delivery_reviews FOR SELECT TO authenticated USING (
  has_entity_access(entity) AND (assigned_contributor_user_id IS NULL OR assigned_contributor_user_id = auth.uid())
);

-- The pre-existing "Contributors insert reviews" policy is left unchanged:
-- a contributor may still log an ad-hoc review directly, in addition to the
-- new admin-opened-then-submitted path below.

-- 6. A contributor may submit their own assigned, still-pending review via
-- UPDATE. RLS restricts this to their own assignment while the review is
-- still Awaiting Client Review; the trigger below additionally blocks them
-- from touching assignment, entity, period, opened_at, or marking a review
-- Reviewed (admin-only actions).
DROP POLICY IF EXISTS "Contributors update assigned pending reviews" ON weekly_delivery_reviews;
CREATE POLICY "Contributors update assigned pending reviews" ON weekly_delivery_reviews FOR UPDATE TO authenticated USING (
  assigned_contributor_user_id = auth.uid() AND review_status = 'Awaiting Client Review'
) WITH CHECK (
  assigned_contributor_user_id = auth.uid()
);

-- 7. Column/state protection trigger, matching the existing
-- protect_request_columns() / protect_support_columns() pattern already
-- established in collaboration_layer_schema.sql.
CREATE OR REPLACE FUNCTION protect_review_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  IF NEW.assigned_contributor_user_id IS DISTINCT FROM OLD.assigned_contributor_user_id THEN
    RAISE EXCEPTION 'Contributors cannot reassign a weekly review';
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

DROP TRIGGER IF EXISTS trg_protect_review_columns ON weekly_delivery_reviews;
CREATE TRIGGER trg_protect_review_columns BEFORE UPDATE ON weekly_delivery_reviews
  FOR EACH ROW EXECUTE FUNCTION protect_review_columns();

-- 8. Review-to-tracker-item linkage (V4A.2 North Star clarification). A
-- client should be able to identify which delivery work their weekly
-- feedback relates to. This is a genuine many-to-many relation, so it is
-- represented as a proper junction table — never as comma-separated ids on
-- weekly_delivery_reviews.
CREATE TABLE IF NOT EXISTS weekly_review_tracker_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES weekly_delivery_reviews(id) ON DELETE CASCADE,
  tracker_item_id text NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (review_id, tracker_item_id)
);
ALTER TABLE weekly_review_tracker_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access weekly_review_tracker_items" ON weekly_review_tracker_items FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Contributors select linked tracker items" ON weekly_review_tracker_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM weekly_delivery_reviews r WHERE r.id = weekly_review_tracker_items.review_id AND has_entity_access(r.entity))
);

-- A contributor may only attach/detach links while their own review is
-- still pending — once submitted, the linkage freezes along with the rest
-- of the review content.
CREATE POLICY "Contributors link tracker items to their pending review" ON weekly_review_tracker_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM weekly_delivery_reviews r
    WHERE r.id = weekly_review_tracker_items.review_id
      AND r.assigned_contributor_user_id = auth.uid()
      AND r.review_status = 'Awaiting Client Review'
  )
);

CREATE POLICY "Contributors unlink tracker items from their pending review" ON weekly_review_tracker_items FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM weekly_delivery_reviews r
    WHERE r.id = weekly_review_tracker_items.review_id
      AND r.assigned_contributor_user_id = auth.uid()
      AND r.review_status = 'Awaiting Client Review'
  )
);
