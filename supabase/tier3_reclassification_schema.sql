-- Tier 3 Reclassification Migration & Decision Record (V4A)
-- Additive, idempotent updates.

-- 1. Insert the Programme Decision Record
INSERT INTO tracker_items (
  id,
  title,
  entity,
  phase,
  category,
  status,
  priority,
  responsible_party,
  author,
  delivery_context,
  record_type,
  scope_treatment,
  requires_approval
) VALUES (
  'decision-tier3-activation',
  'Tier 3 Paid Delivery Scope Activated',
  'Both',
  'Separate Scope',
  'Programme Review',
  'Separate Scope',
  'High',
  'Embark Digitals',
  'Ndumiso / Embark Digitals',
  'Future / Separate Scope',
  'Decision',
  'Current Delivery',
  false
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  record_type = EXCLUDED.record_type;

-- 2. Insert contextual note for the decision
INSERT INTO tracker_item_notes (
  tracker_item_id,
  note_type,
  author,
  content
)
SELECT 
  'decision-tier3-activation',
  'decision_recorded',
  'Ndumiso / Embark Digitals',
  'Latest project-owner instruction confirms Tier 3 has been paid for. Previously parked Tier 2/Tier 3/system items must be audited individually for active delivery. Historical parked classifications remain part of the audit context.'
WHERE NOT EXISTS (
  SELECT 1 FROM tracker_item_notes 
  WHERE tracker_item_id = 'decision-tier3-activation' AND note_type = 'decision_recorded'
);

-- 3. Update specific Phase 2 / Phase 3 tasks
UPDATE tracker_items
SET 
  phase = 'Phase 2',
  status = 'Not Started',
  delivery_context = 'Tier 3 Active Delivery',
  record_type = 'Task',
  scope_treatment = 'Active Tier 3 Delivery'
WHERE id IN (
  'task-later-google-profile',
  'task-later-meta-pixel',
  'task-later-whatsapp-setup',
  'task-later-web-forms',
  'task-later-ai-kb'
);

UPDATE tracker_items
SET 
  phase = 'Phase 3',
  status = 'Not Started',
  delivery_context = 'Tier 3 Active Delivery',
  record_type = 'Task',
  scope_treatment = 'Active Tier 3 Delivery'
WHERE id IN (
  'task-later-seo-hygiene',
  'task-later-comms-tier2',
  'task-later-ai-docs',
  'task-later-seo-deep',
  'task-later-comms-tier3'
);

UPDATE tracker_items
SET 
  phase = 'Phase 2',
  status = 'Not Started',
  delivery_context = 'Tier 3 Active Delivery',
  record_type = 'Task',
  scope_treatment = 'Requires Scope Definition'
WHERE id = 'task-later-system-build';

UPDATE tracker_items
SET 
  phase = 'Phase 2',
  status = 'Not Started',
  delivery_context = 'Tier 3 Active Delivery',
  record_type = 'Task',
  scope_treatment = 'Active Tier 3 Planning'
WHERE id = 'task-later-system-planning';

UPDATE tracker_items
SET 
  phase = 'Phase 2',
  status = 'In Progress',
  delivery_context = 'Tier 3 Active Delivery',
  record_type = 'Deliverable',
  scope_treatment = 'Already Partially Implemented'
WHERE id = 'task-later-gms';
