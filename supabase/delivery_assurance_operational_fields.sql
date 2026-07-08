-- Delivery Assurance Operational Fields (V4A.3)
-- Additive, idempotent migration. Run manually in the Supabase SQL Editor
-- after review. Do not run automatically.
--
-- Covers two North Star requirements that have no existing physical field:
--   1. Client-reported urgency — distinct from Embark's internal tracker
--      priority, on both client input requests and support tickets.
--   2. A real issue-report workflow on support_tickets (task-linked vs
--      standalone issue, expected outcome, evidence/reference URL).
--
-- support_tickets.linked_tracker_item_id already exists (see
-- collaboration_layer_schema.sql) and already fully supports both the
-- "Link Existing Task" and "Create Follow-Up Task" dispositions — no new
-- relational column is required for that provenance.
--
-- This migration is purely additive: no table is dropped, no row is
-- deleted, no existing ticket/request text is altered.

-- 1. Client-reported urgency on client_input_requests. Distinct from
-- tracker_items.priority — set by the client, never auto-applied to
-- Embark's internal delivery priority.
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS client_reported_urgency text DEFAULT 'Normal';

ALTER TABLE client_input_requests DROP CONSTRAINT IF EXISTS client_input_requests_client_reported_urgency_check;
ALTER TABLE client_input_requests ADD CONSTRAINT client_input_requests_client_reported_urgency_check
  CHECK (client_reported_urgency IN ('Normal', 'Time Sensitive', 'Urgent'));

-- 2. Support ticket issue-report workflow fields.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS issue_type text DEFAULT 'Standalone Issue',
  ADD COLUMN IF NOT EXISTS expected_outcome text,
  ADD COLUMN IF NOT EXISTS client_reported_urgency text DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS evidence_url text;

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_issue_type_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_issue_type_check
  CHECK (issue_type IN ('Task-Linked Issue', 'Standalone Issue'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_client_reported_urgency_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_client_reported_urgency_check
  CHECK (client_reported_urgency IN ('Normal', 'Time Sensitive', 'Urgent'));

-- No RLS changes required for the new columns above: existing policies on
-- client_input_requests and support_tickets already govern row-level
-- access, and the existing protect_request_columns()/protect_support_columns
-- triggers do not block them, so the reporting client remains free to set or
-- later adjust their own urgency indicator on their own record.

-- 3. Issue-to-delivery-action disposition (Link Existing Task / Create
-- Follow-Up Task) is an admin-only decision. support_tickets.
-- linked_tracker_item_id already exists and already fully represents this
-- relation, but the existing protect_support_columns() trigger (defined in
-- collaboration_layer_schema.sql, already live) does not yet guard it,
-- meaning a client contributor could set it directly on their own reported
-- ticket via the existing "Contributors update own reported tickets"
-- policy. Extend the trigger — CREATE OR REPLACE is additive/idempotent and
-- does not require recreating the existing trigger binding.
CREATE OR REPLACE FUNCTION protect_support_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority OR
     NEW.responsible_party IS DISTINCT FROM OLD.responsible_party OR
     NEW.investigation_summary IS DISTINCT FROM OLD.investigation_summary OR
     NEW.action_taken IS DISTINCT FROM OLD.action_taken OR
     NEW.resolution_proposed_at IS DISTINCT FROM OLD.resolution_proposed_at OR
     NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at OR
     NEW.linked_tracker_item_id IS DISTINCT FROM OLD.linked_tracker_item_id THEN
    RAISE EXCEPTION 'Contributors cannot change admin-controlled ticket fields';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'Resolved' AND NEW.status NOT IN ('Closed', 'Investigating') THEN
      RAISE EXCEPTION 'Contributors can only Confirm Resolved (Closed) or mark Still Not Resolved (Investigating)';
    END IF;
    IF OLD.status != 'Resolved' THEN
      RAISE EXCEPTION 'Contributors cannot change ticket status directly';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- V4A.1 SUPPORTING EVIDENCE ATTACHMENTS (deferred, not part of this
-- migration): private Supabase Storage, screenshot/PDF/document uploads,
-- attachment metadata, access policies, and size/type controls remain a
-- future requirement. evidence_url above is a plain reference link only.
