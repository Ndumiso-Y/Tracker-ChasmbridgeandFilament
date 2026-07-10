-- =============================================================================
-- FIX: get_internal_support_ticket_comments — 42702 "column reference id is ambiguous"
-- =============================================================================
-- The live version of this function (from support_ticket_workflow.sql) fails on
-- EVERY call: its RETURNS TABLE declares an output column named "id", and the
-- Active Editor validation lookup used an unqualified "WHERE id = p_author_id",
-- which PostgreSQL cannot disambiguate between the output column and
-- update_authors.id. Result: the internal operator's ticket Activity Thread has
-- never loaded ("column reference \"id\" is ambiguous").
--
-- This file recreates the function with the lookup fully qualified. Contract,
-- security model, and grants are unchanged:
--   - SECURITY DEFINER read gated on a valid, active Active Editor id
--   - anon + authenticated may execute; no table-level access is widened
-- Run this once in the Supabase SQL editor. Safe to re-run.
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
