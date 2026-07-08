-- Phase 1 Historical Completion & completed_at Field (V4A.9)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- Purpose: tracker_items has never had an honest "when was this actually
-- finished" concept — only due_date (a target) and updated_at (last touch,
-- not necessarily completion). This adds completed_at and, separately,
-- closes out Phase 1 using a truthful historical treatment rather than
-- fabricating individual per-task completion dates that were never
-- captured. This file is deliberately kept separate from
-- phase2_phase3_delivery_schema.sql, which explicitly documents itself as
-- containing "No ... Phase 1 UPDATE statements" — this is a new, narrow,
-- clearly-scoped exception to that boundary, not an edit to that file.

-- 1. completed_at column. Nullable — only ever set when a tracker item
-- actually reaches its Done status, never backfilled with a guess for
-- in-progress work.
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Historical Phase 1 close. The product owner has confirmed Phase 1
-- delivery is complete, within the 1 June 2026 – 30 June 2026 delivery
-- window. Exact task-level completion dates were not historically
-- captured, so no individual/random dates are invented. Any Phase 1 item
-- not already in a terminal state (Done / Deferred / Separate Scope) is
-- brought to Done; due_date is never used as a stand-in for completion.
UPDATE tracker_items
SET status = 'Done'
WHERE phase = 'Phase 1'
  AND status NOT IN ('Done', 'Deferred', 'Separate Scope');

UPDATE tracker_items
SET completed_at = COALESCE(completed_at, '2026-06-30T00:00:00Z'::timestamptz)
WHERE phase = 'Phase 1'
  AND status = 'Done';

-- 3. Notes & History provenance explaining the historical close treatment,
-- using the existing tracker_item_notes audit trail rather than a silent
-- bulk update. Guarded by NOT EXISTS so re-running this file is safe and
-- never creates duplicate notes.
INSERT INTO tracker_item_notes (tracker_item_id, note_type, note_text, changed_by_label)
SELECT
  ti.id,
  'status_change',
  'Phase 1 delivery was completed within the June 2026 delivery window. Exact task-level completion dates were not historically captured. 30 June 2026 is used as the standard historical Phase 1 close date.',
  'System — Historical Phase 1 Close (V4A.9 migration)'
FROM tracker_items ti
WHERE ti.phase = 'Phase 1'
  AND ti.status = 'Done'
  AND NOT EXISTS (
    SELECT 1 FROM tracker_item_notes n
    WHERE n.tracker_item_id = ti.id
      AND n.note_text LIKE 'Phase 1 delivery was completed within the June 2026%'
  );
