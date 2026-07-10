-- Support Ticket Retention — Embark-Only Removal Authority (V4A.16)
-- + MARK-RESOLVED TRIGGER CONFLICT FIX (V4A.17, section 5)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor after review.
--
-- Product-owner ownership rule (fixed): ONLY EMBARK DIGITALS may remove
-- tickets. Clients never delete, never archive, never see removal actions.
--
-- Retention model: DELETE TEST / EMPTY TICKET + ARCHIVE REAL TICKET.
--   - Permanent delete is allowed ONLY for a ticket that never became an
--     operational conversation: status New/Open, zero comments, no proposed
--     resolution, no client confirmation. Anything beyond that is history
--     between three organisations and can only be ARCHIVED (reversible).
--   - Authority is enforced SERVER-SIDE: the acting Active Editor must be
--     active AND belong to organisation_label = 'Embark Digitals'. Client
--     Active Editors (e.g. Dr. Rudy) are refused by the database, not just
--     hidden by the UI.
--
-- This migration does NOT add RLS policies, does not grant anon table
-- access, does not create a generic delete, and does not touch
-- app.internal_operator_bridge. The get_internal_support_tickets read is
-- recreated (same input signature) with archived_at added to its return
-- contract — same versioning pattern as client_input_tracker_link.sql.

-- =============================================================================
-- 1. ARCHIVE COLUMN
-- =============================================================================
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_tickets_archived_at
  ON support_tickets (archived_at);

-- =============================================================================
-- 2. EMBARK-ONLY ARCHIVE / UNARCHIVE
-- =============================================================================
CREATE OR REPLACE FUNCTION archive_internal_support_ticket(
  p_author_id text,
  p_ticket_id text
) RETURNS support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row support_tickets;
BEGIN
  -- Embark-only authority: active editor AND Embark Digitals organisation.
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may archive tickets.';
  END IF;

  SELECT * INTO v_row FROM support_tickets WHERE id = p_ticket_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
  END IF;
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This ticket is already archived.';
  END IF;

  UPDATE support_tickets
  SET archived_at = now(), updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;

  -- Provenance in the ticket's own activity thread.
  INSERT INTO support_ticket_comments (ticket_id, body, created_by_author_id, activity_type)
  VALUES (p_ticket_id, 'Ticket archived by ' || v_author_label || '.', p_author_id, 'lifecycle');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION archive_internal_support_ticket(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION archive_internal_support_ticket(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION unarchive_internal_support_ticket(
  p_author_id text,
  p_ticket_id text
) RETURNS support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row support_tickets;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may restore archived tickets.';
  END IF;

  SELECT * INTO v_row FROM support_tickets WHERE id = p_ticket_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
  END IF;
  IF v_row.archived_at IS NULL THEN
    RAISE EXCEPTION 'This ticket is not archived.';
  END IF;

  UPDATE support_tickets
  SET archived_at = NULL, updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;

  INSERT INTO support_ticket_comments (ticket_id, body, created_by_author_id, activity_type)
  VALUES (p_ticket_id, 'Ticket restored from archive by ' || v_author_label || '.', p_author_id, 'lifecycle');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION unarchive_internal_support_ticket(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unarchive_internal_support_ticket(text, text) TO anon, authenticated;

-- =============================================================================
-- 3. EMBARK-ONLY TEST/EMPTY TICKET DELETE
-- =============================================================================
-- Permanent delete only for a ticket that never became a conversation:
-- New/Open status, zero comments, no resolution proposed, never confirmed.
CREATE OR REPLACE FUNCTION delete_internal_test_support_ticket(
  p_author_id text,
  p_ticket_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_status text;
  v_resolution_proposed_at timestamptz;
  v_client_confirmed_at timestamptz;
  v_comment_count bigint;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true
    AND ua.organisation_label = 'Embark Digitals';

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Only an active Embark Digitals editor may delete tickets.';
  END IF;

  SELECT status, resolution_proposed_at, client_confirmed_at
  INTO v_status, v_resolution_proposed_at, v_client_confirmed_at
  FROM support_tickets WHERE id = p_ticket_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
  END IF;
  IF v_status NOT IN ('New', 'Open') THEN
    RAISE EXCEPTION 'Only a New/Open ticket with no history can be deleted. This ticket is % — use Archive instead.', v_status;
  END IF;
  IF v_resolution_proposed_at IS NOT NULL OR v_client_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This ticket carries resolution history — use Archive instead.';
  END IF;

  SELECT count(*) INTO v_comment_count
  FROM support_ticket_comments WHERE ticket_id = p_ticket_id;
  IF v_comment_count > 0 THEN
    RAISE EXCEPTION 'This ticket has a conversation (% comment(s)) — use Archive instead.', v_comment_count;
  END IF;

  DELETE FROM support_tickets WHERE id = p_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_internal_test_support_ticket(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_internal_test_support_ticket(text, text) TO anon, authenticated;

-- =============================================================================
-- 4. RECREATE INTERNAL TICKET REGISTER READ — add archived_at
-- =============================================================================
DROP FUNCTION IF EXISTS get_internal_support_tickets(text);

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
  updated_at timestamptz,
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
    st.id, st.title, st.entity, st.category, st.issue_type, st.status,
    st.priority, st.description, st.expected_outcome,
    st.client_reported_urgency, st.evidence_url,
    st.linked_tracker_item_id, ti.title,
    st.investigation_summary, st.action_taken,
    st.acknowledged_at, st.resolution_proposed_at, st.client_confirmed_at,
    st.created_at, st.updated_at,
    st.archived_at
  FROM support_tickets st
  LEFT JOIN tracker_items ti ON ti.id = st.linked_tracker_item_id
  ORDER BY st.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_support_tickets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_support_tickets(text) TO anon, authenticated;

-- =============================================================================
-- 5. MARK-RESOLVED TRIGGER CONFLICT FIX (V4A.17 — live runtime defect)
-- =============================================================================
-- CONFIRMED LIVE DEFECT: support_ticket_workflow.sql (already executed)
-- shipped a self-conflicting pair — its mark_internal_support_ticket_resolved
-- RPC sets status = 'Resolved' AND resolution_proposed_at, while the
-- protect_support_columns trigger it recreated in the same file RAISES on
-- exactly those changes for every non-admin caller ("Contributors cannot set
-- resolution_proposed_at directly"). The internal Active Editor resolve
-- action therefore always fails in production.
--
-- FIX (narrow, deliberate): a dedicated transaction-local bridge flag,
-- app.support_lifecycle_bridge, set by EXACTLY ONE function
-- (mark_internal_support_ticket_resolved — which has already validated the
-- Active Editor server-side) and honoured by protect_support_columns. This
-- mirrors the established app.internal_operator_bridge pattern
-- (assign_internal_client_input_contributor) without touching that key or
-- adding any generic mutation path. set_config(..., true) is transaction-
-- local: the flag cannot leak beyond the RPC's own statement context.

CREATE OR REPLACE FUNCTION protect_support_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  -- Narrow server-validated lifecycle bridge — set ONLY by
  -- mark_internal_support_ticket_resolved after Active Editor validation.
  IF current_setting('app.support_lifecycle_bridge', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.entity IS DISTINCT FROM OLD.entity THEN
    RAISE EXCEPTION 'Contributors cannot change ticket entity';
  END IF;

  IF NEW.resolution_proposed_at IS DISTINCT FROM OLD.resolution_proposed_at THEN
    RAISE EXCEPTION 'Contributors cannot set resolution_proposed_at directly';
  END IF;

  -- Allow clients to transition Resolved -> Closed OR Resolved -> Open
  -- but do not allow them to set arbitrary statuses or close from open directly.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'Resolved' AND NEW.status IN ('Closed', 'Open') THEN
      -- Valid client response transition
      IF NEW.status = 'Closed' THEN
        NEW.client_confirmed_at = now();
      END IF;
    ELSE
      RAISE EXCEPTION 'Contributors can only transition a Resolved ticket to Closed or Open';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the resolve RPC (identical contract) with the bridge flag set
-- immediately before its guarded UPDATE. This is the ONLY setter of
-- app.support_lifecycle_bridge.
CREATE OR REPLACE FUNCTION mark_internal_support_ticket_resolved(
  p_author_id text,
  p_ticket_id text,
  p_resolution_note text
) RETURNS support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row support_tickets;
  v_current_status text;
BEGIN
  -- Validate Active Editor
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  -- Load ticket status
  SELECT status INTO v_current_status
  FROM support_tickets
  WHERE id = p_ticket_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Support ticket not found';
  END IF;

  IF v_current_status = 'Closed' THEN
    RAISE EXCEPTION 'Cannot mark a closed support ticket resolved';
  END IF;

  -- Signal the server-validated lifecycle path to protect_support_columns.
  PERFORM set_config('app.support_lifecycle_bridge', 'true', true);

  -- Update to physical resolution state
  UPDATE support_tickets
  SET
    status = 'Resolved',
    resolution_proposed_at = now(),
    action_taken = COALESCE(p_resolution_note, action_taken),
    updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;

  -- Add a provenance event if a note was provided
  IF p_resolution_note IS NOT NULL AND trim(p_resolution_note) != '' THEN
    INSERT INTO support_ticket_comments (ticket_id, body, created_by_author_id, activity_type)
    VALUES (p_ticket_id, 'Marked Resolved: ' || p_resolution_note, p_author_id, 'resolution_proposed');
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION mark_internal_support_ticket_resolved(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_internal_support_ticket_resolved(text, text, text) TO anon, authenticated;
