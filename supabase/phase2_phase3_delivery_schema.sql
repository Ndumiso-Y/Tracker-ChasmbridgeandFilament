-- Phase 2 + Phase 3 Delivery Schema Maturation
-- Additive, idempotent. No DELETE, TRUNCATE, or Phase 1 UPDATE statements.

-- 1. New columns on tracker_items
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS record_type text DEFAULT 'Task';
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS workstream text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS delivery_context text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS delivery_lane text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS delivery_week text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS workflow_type text DEFAULT 'General';
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS workflow_stage text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS blocked_by text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS blocked_since date;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS scope_treatment text DEFAULT 'Current Delivery';
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS content_pillar text;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false;
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'Not Required';
ALTER TABLE tracker_items ADD COLUMN IF NOT EXISTS cadence_status text;

-- 2. note_type constraint extension
-- Drop existing constraint if it exists and recreate
ALTER TABLE tracker_item_notes DROP CONSTRAINT IF EXISTS tracker_item_notes_note_type_check;
ALTER TABLE tracker_item_notes ADD CONSTRAINT tracker_item_notes_note_type_check CHECK (
  note_type IN (
    'manual', 'status_change', 'due_date_update', 'next_action_update', 'priority_update',
    'approval_requested', 'approval_status_change', 'decision_recorded', 'blocker_added',
    'blocker_updated', 'blocker_resolved', 'workflow_stage_change', 'delivery_lane_change',
    'cadence_status_change', 'scope_treatment_change', 'record_type_change'
  )
);

-- 3. programme_settings table
CREATE TABLE IF NOT EXISTS programme_settings (
  key text PRIMARY KEY,
  value text,
  is_public boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);

-- RLS
ALTER TABLE programme_settings ENABLE ROW LEVEL SECURITY;
-- Public read where is_public = true
CREATE POLICY "programme_settings_public_read" ON programme_settings
  FOR SELECT TO anon, authenticated USING (is_public = true);
-- Admin full access
CREATE POLICY "programme_settings_admin_all" ON programme_settings
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Insert defaults
INSERT INTO programme_settings (key, value, is_public) VALUES
  ('programme_delivery_target', '2026-07-31', true),
  ('programme_phase2_phase3_window_start', '2026-07-05', false),
  ('package3_review_start_date', '2026-07-01', false),
  ('package3_review_end_date', '2026-07-31', false),
  ('package3_review_status', 'In Progress', true),
  ('programme_delivery_mode', 'Phase 2 + Phase 3 Parallel Delivery', true),
  ('programme_review_outcome', 'Pending Review', false),
  ('primary_approver_cbc', 'Dr. Rudy Phillis', false),
  ('primary_approver_filament', 'Monique Phillis', false)
ON CONFLICT (key) DO NOTHING;

-- 4. Legacy Phase Migration UPDATEs
-- Retainer → Phase 3 (individual items, not mass-update)
UPDATE tracker_items SET phase = 'Phase 3', status = 'Recurring — Active',
  delivery_context = 'Package 3 Review', record_type = 'Recurring Activity'
WHERE id IN ('task-later-social-posting','task-later-social-graphics',
             'task-later-web-bugfixes','task-later-web-updates',
             'task-later-domain-monitoring','task-later-email-troubleshoot',
             'task-later-mailbox-monitoring');

-- Old Phase 2 stays Phase 2 (Deferred items)
UPDATE tracker_items SET status = 'Deferred', delivery_context = 'Package 3 Review', record_type = 'Task'
WHERE id IN ('task-later-google-profile','task-later-meta-pixel','task-later-whatsapp-setup');

-- Old Phase 2 → Phase 3 (included in Package 3)
UPDATE tracker_items SET phase = 'Phase 3', status = 'Not Started',
  delivery_context = 'Package 3 Review', record_type = 'Task'
WHERE id IN ('task-later-seo-hygiene','task-later-comms-tier2');

-- Old Phase 3 systems + Out of Scope → Separate Scope
UPDATE tracker_items SET phase = 'Separate Scope', status = 'Separate Scope',
  delivery_context = 'Future / Separate Scope', record_type = 'Context'
WHERE id IN ('task-later-web-forms','task-later-ai-kb','task-later-system-build',
             'task-later-gms','task-later-ai-docs','task-later-ai-marketing',
             'task-later-system-planning','task-later-seo-deep','task-later-comms-tier3',
             'task-later-crm','task-later-dashboard','task-later-ai-video',
             'task-later-business-plans','task-later-whatsapp-api');

-- Phase 1 records: delivery_context only (no status change)
UPDATE tracker_items SET delivery_context = 'Historical Foundation'
WHERE phase = 'Phase 1';

-- 5. New Items INSERT (ON CONFLICT DO NOTHING)
INSERT INTO tracker_items (id, title, entity, category, phase, status, delivery_context, record_type, owner_label, priority) VALUES
('p2-approval-workflow', 'Establish Approval Workflows', 'Both', 'Approval & Workflow', 'Phase 2', 'In Progress', 'Package 3 Review', 'Task', 'Embark Digitals', 'High'),
('p2-consent-process', 'Confirm Graduate Consent Process', 'Chasm Bridge Charity', 'Approval & Workflow', 'Phase 2', 'In Progress', 'Package 3 Review', 'Task', 'Embark Digitals', 'High'),
('p2-recruitment-boundaries', 'Set Recruitment Communication Boundaries', 'Chasm Bridge Charity', 'Approval & Workflow', 'Phase 2', 'Not Started', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'High'),
('p3-social-media-management', 'Ongoing Social Media Management', 'Both', 'Social Media', 'Phase 3', 'Recurring — Active', 'Package 3 Review', 'Recurring Activity', 'Embark Digitals', 'High'),
('p3-content-production', 'Content Production', 'Both', 'Content & Design', 'Phase 3', 'Recurring — Active', 'Package 3 Review', 'Recurring Activity', 'Embark Digitals', 'High'),
('p3-testimonial-collection', 'Testimonial Collection & Design', 'Chasm Bridge Charity', 'Testimonials & Consent', 'Phase 3', 'In Progress', 'Package 3 Review', 'Task', 'Embark Digitals', 'Medium'),
('risk-delayed-approvals', 'Delayed Approvals on Content', 'Both', 'Approval & Workflow', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-graduate-availability', 'Graduate Availability for Testimonials', 'Chasm Bridge Charity', 'Testimonials & Consent', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'Medium'),
('milestone-package3-continuation-review', 'Package 3 Continuation Review', 'Both', 'Programme Review', 'Phase 3', 'In Progress', 'Package 3 Review', 'Approval Gate', 'Client Team', 'High'),
('scope-crm-system', 'CRM / Applicant Tracking System', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-graduate-management', 'Graduate Management System', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low')
,
('p2-approval-authority', 'Confirm Primary Approvers & Turnaround Times', 'Both', 'Approval & Workflow', 'Phase 2', 'In Progress', 'Package 3 Review', 'Decision', 'Embark Digitals', 'High'),
('p2-access-control', 'Confirm Social Admin & Agency Access Levels', 'Both', 'Approval & Workflow', 'Phase 2', 'Not Started', 'Package 3 Review', 'Task', 'Embark Digitals', 'High'),
('p2-testimonial-workflow', 'Finalise Testimonial Collection Process & Template', 'Chasm Bridge Charity', 'Testimonials & Consent', 'Phase 2', 'In Progress', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'High'),
('p2-content-calendar', 'Prepare First 30-Day Content Calendar', 'Both', 'Content & Design', 'Phase 2', 'Not Started', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'High'),
('p2-website-update-process', 'Establish Website Update Request Process', 'Both', 'Website Care', 'Phase 2', 'Not Started', 'Package 3 Review', 'Task', 'Embark Digitals', 'Medium'),
('p2-analytics-reporting', 'Analytics Setup & July Reporting Baseline', 'Both', 'Google / SEO', 'Phase 2', 'Not Started', 'Package 3 Review', 'Task', 'Embark Digitals', 'Medium'),
('p2-email-signatures-cards', 'Finalise Email Signatures & Digital Cards', 'Both', 'Content & Design', 'Phase 2', 'Not Started', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'Medium'),
('p2-google-business', 'Google Business Profile Setup Decision', 'Both', 'Google / SEO', 'Phase 2', 'Not Started', 'Package 3 Review', 'Decision', 'Embark Digitals', 'Low'),
('p2-graduate-data-governance', 'Establish Graduate Data Governance & Alignment', 'Chasm Bridge Charity', 'Strategy', 'Phase 2', 'Not Started', 'Package 3 Review', 'Task', 'Embark Digitals', 'High'),
('p2-monthly-deliverables', 'Confirm Monthly Deliverable Expectations', 'Both', 'Approval & Workflow', 'Phase 2', 'In Progress', 'Package 3 Review', 'Decision', 'Embark Digitals', 'High'),
('p2-priority-confirmation', 'Phase 2 Priority Confirmation', 'Both', 'Strategy', 'Phase 2', 'In Progress', 'Package 3 Review', 'Decision', 'Embark Digitals', 'High'),
('p3-website-care', 'Website Care & Monitoring', 'Both', 'Website Care', 'Phase 3', 'Recurring — Active', 'Package 3 Review', 'Recurring Activity', 'Embark Digitals', 'High'),
('p3-coordination-tracking', 'Coordination & Approval Tracking', 'Both', 'Approval & Workflow', 'Phase 3', 'Recurring — Active', 'Package 3 Review', 'Recurring Activity', 'Embark Digitals', 'High'),
('p3-month1-review-prep', 'One-Month Review Preparation', 'Both', 'Programme Review', 'Phase 3', 'In Progress', 'Package 3 Review', 'Task', 'Embark Digitals', 'High'),
('p3-social-posters', 'Finalise Social Follow Posters', 'Both', 'Content & Design', 'Phase 3', 'Not Started', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'High'),
('p3-cv-training-update', 'Publish CV Submission / Training Update', 'Chasm Bridge Charity', 'Content & Design', 'Phase 3', 'Not Started', 'Package 3 Review', 'Deliverable', 'Embark Digitals', 'High'),
('risk-unclear-ownership', 'Unclear Content Ownership & Decision Maker', 'Both', 'Strategy', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-missing-assets', 'Missing or Late Content Inputs', 'Both', 'Content & Design', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-unapproved-claims', 'Unapproved Public Claims', 'Both', 'Approval & Workflow', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-access-limitations', 'Access Limitations & Delays', 'Both', 'Social Media', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-scope-creep', 'Scope Changes Without Approval', 'Both', 'Strategy', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('risk-no-consent', 'No Consent for Graduate Photos/Stories', 'Chasm Bridge Charity', 'Testimonials & Consent', 'Phase 3', 'In Progress', 'Package 3 Review', 'Risk', 'Client Team', 'High'),
('context-organic-reach', 'Reliance on Unpaid Organic Reach', 'Both', 'Social Media', 'Phase 3', 'In Progress', 'Package 3 Review', 'Context', 'Embark Digitals', 'Low'),
('scope-paid-media', 'Paid Advertising & Boosted Posts', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-premium-content', 'Premium Video, Photography & Animations', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-print-materials', 'Brochures, Pitch Decks & Printing', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-backend-dev', 'Backend Web Dev & Application Forms', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-automation', 'WhatsApp API & Email Automation', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-advanced-analytics', 'Advanced Analytics Dashboards', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-premium-software', 'Premium Software & Domain Renewals', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-emergency-work', 'Emergency Turnaround Work', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('scope-advanced-seo', 'Advanced SEO Campaigns', 'Both', 'Future Systems', 'Separate Scope', 'Separate Scope', 'Future / Separate Scope', 'Context', 'Embark Digitals', 'Low'),
('milestone-package3-review-start', 'Package 3 Review Start Date Confirmation', 'Both', 'Approval & Workflow', 'Phase 3', 'In Progress', 'Package 3 Review', 'Approval Gate', 'Embark Digitals', 'High')
,
('p2-separate-cost-confirmation', 'Confirm Separate-Cost Items for Review Period', 'Both', 'Approval & Workflow', 'Phase 2', 'Not Started', 'Package 3 Review', 'Approval Gate', 'Embark Digitals', 'High')
ON CONFLICT (id) DO NOTHING;

UPDATE tracker_items SET requires_approval = true, approval_status = 'Ready for Review' WHERE id = 'p2-separate-cost-confirmation';
