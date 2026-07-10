-- Support Ticket Workflow & Comments (V4A.12)
-- Additive, idempotent migration to introduce a dedicated comment thread
-- for support tickets and narrow Active Editor lifecycle actions.
--
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor.

-- =============================================================================
-- 1. SUPPORT TICKET COMMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id text NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by_author_id text REFERENCES update_authors(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text
);

ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access support_ticket_comments" ON support_ticket_comments FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Contributors read entity ticket comments" ON support_ticket_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM support_tickets WHERE id = support_ticket_comments.ticket_id AND has_entity_access(entity))
);

CREATE POLICY "Contributors insert ticket comments" ON support_ticket_comments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM support_tickets WHERE id = support_ticket_comments.ticket_id AND has_entity_access(entity))
  AND created_by_user_id = auth.uid()
);


-- =============================================================================
-- 2. INTERNAL ACTIVE EDITOR TICKET EDIT RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION update_internal_support_ticket(
  p_author_id text,
  p_ticket_id text,
  p_linked_tracker_item_id text,
  p_title text,
  p_description text,
  p_client_reported_urgency text
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
    RAISE EXCEPTION 'Cannot edit a closed support ticket';
  END IF;

  -- Update allowed safe fields
  UPDATE support_tickets
  SET
    linked_tracker_item_id = p_linked_tracker_item_id,
    title = p_title,
    description = p_description,
    client_reported_urgency = COALESCE(p_client_reported_urgency, client_reported_urgency),
    updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION update_internal_support_ticket(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_internal_support_ticket(text, text, text, text, text, text) TO anon, authenticated;


-- =============================================================================
-- 3. INTERNAL ACTIVE EDITOR MARK RESOLVED RPC
-- =============================================================================
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


-- =============================================================================
-- 4. INTERNAL ACTIVE EDITOR ADD COMMENT RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION create_internal_support_ticket_comment(
  p_author_id text,
  p_ticket_id text,
  p_body text
) RETURNS support_ticket_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row support_ticket_comments;
  v_ticket_exists boolean;
BEGIN
  -- Validate Active Editor
  SELECT display_name || ' — ' || organisation_label INTO v_author_label
  FROM update_authors
  WHERE id = p_author_id AND is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  -- Verify ticket exists
  SELECT EXISTS(SELECT 1 FROM support_tickets WHERE id = p_ticket_id) INTO v_ticket_exists;
  IF NOT v_ticket_exists THEN
    RAISE EXCEPTION 'Support ticket not found';
  END IF;

  IF trim(p_body) = '' THEN
    RAISE EXCEPTION 'Comment body cannot be empty';
  END IF;

  INSERT INTO support_ticket_comments (ticket_id, body, created_by_author_id, activity_type)
  VALUES (p_ticket_id, p_body, p_author_id, 'comment')
  RETURNING * INTO v_row;

  -- Touch ticket updated_at
  UPDATE support_tickets SET updated_at = now() WHERE id = p_ticket_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION create_internal_support_ticket_comment(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_internal_support_ticket_comment(text, text, text) TO anon, authenticated;


-- =============================================================================
-- 5. INTERNAL ACTIVE EDITOR COMMENT READ RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION get_internal_support_ticket_comments(
  p_author_id text,
  p_ticket_id text
)
RETURNS TABLE (
  id uuid,
  ticket_id text,
  body text,
  created_at timestamptz,
  created_by_author_id text,
  created_by_user_id uuid,
  activity_type text,
  author_display_name text,
  user_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_label text;
BEGIN
  -- NOTE: the lookup below MUST stay table-qualified. This function's
  -- RETURNS TABLE declares an "id" output column, so an unqualified
  -- "WHERE id = ..." is ambiguous (42702) and the call always fails.
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.ticket_id, c.body, c.created_at,
    c.created_by_author_id, c.created_by_user_id, c.activity_type,
    ua.display_name AS author_display_name,
    uap.display_name AS user_display_name
  FROM support_ticket_comments c
  LEFT JOIN update_authors ua ON ua.id = c.created_by_author_id
  LEFT JOIN user_access_profiles uap ON uap.user_id = c.created_by_user_id
  WHERE c.ticket_id = p_ticket_id
  ORDER BY c.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_support_ticket_comments(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_support_ticket_comments(text, text) TO anon, authenticated;


-- =============================================================================
-- 6. CLIENT CONFIRM/REJECT RESOLUTION
-- =============================================================================
-- Update the protect_support_columns trigger to explicitly allow status transitions
-- by contributors when responding to resolution.
CREATE OR REPLACE FUNCTION protect_support_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

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
