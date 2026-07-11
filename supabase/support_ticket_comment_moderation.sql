-- =============================================================================
-- SUPPORT TICKET COMMENT MODERATION — edit & delete for the internal operator
-- =============================================================================
-- Adds the ability for Active Editors to edit and delete Activity Thread
-- comments on support tickets. Authority model:
--   - EDIT: only the comment's own author (created_by_author_id must match the
--     acting Active Editor). Editing someone else's words would misattribute
--     them, so there is no override.
--   - DELETE: the comment's own author, or any Embark Digitals editor —
--     consistent with the existing Embark-only removal authority for tickets,
--     requests and reviews.
--   - Only plain comments (activity_type = 'comment') can be edited or
--     deleted. System entries (resolution notes, archive provenance) are the
--     ticket's audit trail and stay immutable.
--
-- Also adds an edited_at marker and recreates the read function to return it
-- (return-type change requires DROP + CREATE). Supersedes
-- fix_support_comment_read.sql — safe to run after it, safe to re-run.
-- Run once in the Supabase SQL editor.
-- =============================================================================

-- 1. Edited marker
ALTER TABLE support_ticket_comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- =============================================================================
-- 2. EDIT OWN COMMENT
-- =============================================================================
CREATE OR REPLACE FUNCTION update_internal_support_ticket_comment(
  p_author_id text,
  p_comment_id uuid,
  p_body text
) RETURNS support_ticket_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row support_ticket_comments;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT * INTO v_row FROM support_ticket_comments WHERE support_ticket_comments.id = p_comment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;
  IF v_row.activity_type IS DISTINCT FROM 'comment' THEN
    RAISE EXCEPTION 'Only plain comments can be edited — system entries are the ticket audit trail';
  END IF;
  IF v_row.created_by_author_id IS DISTINCT FROM p_author_id THEN
    RAISE EXCEPTION 'Only the comment author can edit their own comment';
  END IF;
  IF trim(coalesce(p_body, '')) = '' THEN
    RAISE EXCEPTION 'Comment body cannot be empty';
  END IF;

  UPDATE support_ticket_comments
  SET body = p_body, edited_at = now()
  WHERE support_ticket_comments.id = p_comment_id
  RETURNING * INTO v_row;

  UPDATE support_tickets SET updated_at = now() WHERE support_tickets.id = v_row.ticket_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION update_internal_support_ticket_comment(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_internal_support_ticket_comment(text, uuid, text) TO anon, authenticated;

-- =============================================================================
-- 3. DELETE COMMENT (own, or any as Embark Digitals)
-- =============================================================================
CREATE OR REPLACE FUNCTION delete_internal_support_ticket_comment(
  p_author_id text,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_author_org text;
  v_row support_ticket_comments;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label, ua.organisation_label
  INTO v_author_label, v_author_org
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT * INTO v_row FROM support_ticket_comments WHERE support_ticket_comments.id = p_comment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;
  IF v_row.activity_type IS DISTINCT FROM 'comment' THEN
    RAISE EXCEPTION 'Only plain comments can be deleted — system entries are the ticket audit trail';
  END IF;
  IF v_row.created_by_author_id IS DISTINCT FROM p_author_id
     AND v_author_org IS DISTINCT FROM 'Embark Digitals' THEN
    RAISE EXCEPTION 'Only the comment author or an Embark Digitals editor can delete a comment';
  END IF;

  DELETE FROM support_ticket_comments WHERE support_ticket_comments.id = p_comment_id;
  UPDATE support_tickets SET updated_at = now() WHERE support_tickets.id = v_row.ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_internal_support_ticket_comment(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_internal_support_ticket_comment(text, uuid) TO anon, authenticated;

-- =============================================================================
-- 4. READ — recreated to return edited_at (return-type change needs DROP)
-- =============================================================================
DROP FUNCTION IF EXISTS get_internal_support_ticket_comments(text, text);

CREATE FUNCTION get_internal_support_ticket_comments(
  p_author_id text,
  p_ticket_id text
)
RETURNS TABLE (
  id uuid,
  ticket_id text,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
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
  -- NOTE: lookups must stay table-qualified — this function's RETURNS TABLE
  -- declares "id"/"ticket_id" output columns, and an unqualified reference
  -- is ambiguous (42702) and fails every call.
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.ticket_id, c.body, c.created_at, c.edited_at,
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
