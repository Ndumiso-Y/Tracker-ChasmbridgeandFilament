-- Weekly Delivery Review — Numeric 1–10 Scorecard (V4A.9)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- This file was extracted from supabase/weekly_review_assignment_workflow.sql
-- (V4A.2), which has already been executed live. weekly_review_assignment_
-- workflow.sql has been restored to exactly its already-live contract —
-- only the genuinely new, not-yet-live additions below live here, in a
-- fresh additive file, never inside an already-executed migration.
--
-- Problem this fixes: weekly_delivery_reviews' existing text-enum rating
-- columns (overall_delivery, communication_rating, delivery_timing,
-- requirement_understanding, issue_resolution, approval_process) have
-- 5/4/4/4/4/4 different option counts — they cannot represent a genuine
-- 1-10 scale, and coercing a 1-10 UI onto them would mean silently writing
-- fabricated enum strings that don't match what the client actually saw.
--
-- This migration is purely additive: no table is dropped, no row is
-- deleted, no existing review or its historical text ratings are altered.
-- Historical reviews retain their legacy text ratings exactly as submitted.
-- New reviews may use these numeric 1–10 score fields instead. A review
-- now carries EITHER the historical text ratings (old rows) OR the numeric
-- scores (new rows) — never both, never a fabricated conversion between
-- the two — and the application reads whichever is present (see
-- WeeklyDeliveryReview.jsx's read-only detail view: numeric score shown
-- when not null, historical text rating shown otherwise).

-- 1. Six explicit numeric columns, 1-10, 10 = best.
ALTER TABLE weekly_delivery_reviews
  ADD COLUMN IF NOT EXISTS delivery_score integer CHECK (delivery_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS communication_score integer CHECK (communication_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS timing_score integer CHECK (timing_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS requirement_understanding_score integer CHECK (requirement_understanding_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS issue_resolution_score integer CHECK (issue_resolution_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS approval_process_score integer CHECK (approval_process_score BETWEEN 1 AND 10);

-- 2. "What could Embark improve?" — genuinely distinct from
-- did_not_meet_expectations (a specific miss vs a forward-looking
-- improvement suggestion); both are shown to the client side-by-side.
ALTER TABLE weekly_delivery_reviews ADD COLUMN IF NOT EXISTS could_improve text;

-- 3. No trigger change required. protect_review_columns() (already live,
-- in weekly_review_assignment_workflow.sql) only restricts
-- assigned_contributor_user_id, entity, review_period_start/end, opened_at,
-- and forces review_status to only ever move Awaiting Client Review ->
-- Submitted for a non-admin — it does not enumerate individual content
-- columns, so the new scorecard/could_improve columns are already writable
-- by the assigned contributor while their review is still pending, with no
-- further trigger edit needed.

-- 4. V4A.1 MONTHLY DELIVERY REVIEW remains deferred, logged here (not
-- built this pass). A future monthly aggregation (weekly score averages/
-- trends, recurring pain points, unresolved issues, delivery volume,
-- carried-forward priorities) should be computable FROM this table without
-- further schema change: weekly_review_tracker_items already gives real
-- task correlation, next_week_priority_1/2/3 already give a carry-forward
-- signal, and these new *_score columns already give an aggregatable
-- numeric base per entity/period. No monthly rollup table is added here —
-- nothing in this migration makes that future work harder.
