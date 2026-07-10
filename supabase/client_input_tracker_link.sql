-- Client Input → Tracker Items Relationship (V4A.13)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor.
--
-- Purpose: establishes a first-class FK relationship between
-- client_input_requests and tracker_items so the Register can display
-- current linked delivery item context without copying title/phase/status.
--
-- NOTE: collaboration_layer_schema.sql (already live) defines
-- client_input_requests with the linked_tracker_item_id column at Line 69:
--   linked_tracker_item_id text REFERENCES tracker_items(id) ON DELETE SET NULL
-- That column already physically exists in the schema. This migration is
-- therefore additive commentary + function/trigger extensions only.
-- If the column was somehow absent it would be safe to run this migration
-- first — the ADD COLUMN IF NOT EXISTS is idempotent.
--
-- Forensic note: tracker_items.id is type TEXT (confirmed from schema).

-- =============================================================================
-- 1. ENSURE COLUMN EXISTS (idempotent guard — column is already live from
--    collaboration_layer_schema.sql Line 69)
-- =============================================================================
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS linked_tracker_item_id text
    REFERENCES tracker_items(id) ON DELETE SET NULL;

-- Useful index for join performance in the internal read RPC
CREATE INDEX IF NOT EXISTS idx_client_input_requests_linked_tracker_item
  ON client_input_requests (linked_tracker_item_id);


-- =============================================================================
-- 2. EXTEND INTERNAL READ RPC — get_internal_client_input_requests
-- =============================================================================
-- The function currently lives in client_input_persistence_and_guided_reviews.sql
-- (already executed live). PostgreSQL cannot CREATE OR REPLACE a function when
-- the RETURNS TABLE columns change incompatibly with an existing overloaded
-- match; we therefore DROP IF EXISTS with the exact input signature first and
-- immediately recreate it with the extended return contract.
--
-- IMPORTANT: The input signature (p_author_id text) is IDENTICAL to the
-- original. Only the RETURNS TABLE is extended with five new linked-item
-- columns. The function is immediately recreated so no gap in availability
-- exists within the same migration transaction.

DROP FUNCTION IF EXISTS get_internal_client_input_requests(text);

CREATE OR REPLACE FUNCTION get_internal_client_input_requests(p_author_id text)
RETURNS TABLE (
  id text,
  title text,
  entity text,
  template_id text,
  template_title text,
  status text,
  request_origin text,
  requirement_source text,
  assigned_contributor_user_id uuid,
  assigned_contributor_name text,
  client_reported_urgency text,
  created_at timestamptz,
  submitted_at timestamptz,
  review_acknowledged_at timestamptz,
  created_by_label text,
  review_total bigint,
  review_completed bigint,
  -- Extended: current linked tracker item truth (LEFT JOIN — NULL when unlinked)
  linked_tracker_item_id text,
  linked_tracker_item_title text,
  linked_tracker_item_phase text,
  linked_tracker_item_status text,
  linked_tracker_item_entity text
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
    r.id, r.title, r.entity, r.template_id, t.title,
    r.status, r.request_origin, r.requirement_source,
    r.assigned_contributor_user_id, uap.display_name,
    r.client_reported_urgency, r.created_at, r.submitted_at, r.review_acknowledged_at,
    cba.display_name || ' — ' || cba.organisation_label,
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id),
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id AND e.review_status <> 'Not Reviewed'),
    -- Linked tracker item fields (current truth from tracker_items, never copied)
    r.linked_tracker_item_id,
    ti.title,
    ti.phase,
    ti.status,
    ti.entity
  FROM client_input_requests r
  LEFT JOIN client_input_templates t ON t.id = r.template_id
  LEFT JOIN user_access_profiles uap ON uap.user_id = r.assigned_contributor_user_id
  LEFT JOIN update_authors cba ON cba.id = r.created_by_author_id
  LEFT JOIN tracker_items ti ON ti.id = r.linked_tracker_item_id
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_internal_client_input_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_internal_client_input_requests(text) TO anon, authenticated;


-- =============================================================================
-- 3. NARROW INTERNAL LINK RPC
-- =============================================================================
-- Narrow SECURITY DEFINER function for the Active Editor to link or clear
-- a tracker item on an existing client_input_requests record.
-- Does NOT touch any other field — no generic request update path.
-- Allows clearing the link by passing p_tracker_item_id = NULL.
CREATE OR REPLACE FUNCTION link_internal_client_input_request_tracker_item(
  p_author_id text,
  p_request_id text,
  p_tracker_item_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_request_status text;
  v_request_entity text;
  v_item_entity text;
  v_row client_input_requests;
BEGIN
  -- Validate Active Editor
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  -- Load request status and entity
  SELECT status, entity INTO v_request_status, v_request_entity
  FROM client_input_requests
  WHERE id = p_request_id;

  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;

  -- Only allow linking while request is in a triage / pre-confirmed lifecycle.
  -- Confirmed, Delivered, or Approved requests should not have their delivery
  -- item association changed after sign-off.
  IF v_request_status IN ('Approved', 'Delivered') THEN
    RAISE EXCEPTION 'Cannot change linked delivery item on a request in status: %', v_request_status;
  END IF;

  -- Validate the tracker item if one is being set
  IF p_tracker_item_id IS NOT NULL THEN
    SELECT entity INTO v_item_entity
    FROM tracker_items
    WHERE id = p_tracker_item_id;

    IF v_item_entity IS NULL THEN
      RAISE EXCEPTION 'Tracker item not found: %', p_tracker_item_id;
    END IF;

    -- Entity relevance check: item entity must match request entity or be Both
    IF v_item_entity != 'Both' AND v_request_entity != 'Both' AND v_item_entity != v_request_entity THEN
      RAISE EXCEPTION 'Tracker item (entity: %) does not match request entity: %', v_item_entity, v_request_entity;
    END IF;
  END IF;

  -- Update only the link field
  UPDATE client_input_requests
  SET linked_tracker_item_id = p_tracker_item_id,
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION link_internal_client_input_request_tracker_item(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_internal_client_input_request_tracker_item(text, text, text) TO anon, authenticated;


-- =============================================================================
-- 4. AUTHENTICATED CLIENT ENTITY VALIDATION TRIGGER
-- =============================================================================
-- When an authenticated client contributor includes linked_tracker_item_id
-- in their INSERT or UPDATE on client_input_requests (RLS-guarded), verify
-- the tracker item exists and is relevant to their request entity.
-- This is the server-side guard — never rely only on React filtering.
CREATE OR REPLACE FUNCTION validate_client_input_tracker_link() RETURNS trigger AS $$
DECLARE
  v_item_entity text;
BEGIN
  -- NULL link is always permitted (clearing the link)
  IF NEW.linked_tracker_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If the link hasn't actually changed on update, skip re-validation
  IF TG_OP = 'UPDATE' AND NEW.linked_tracker_item_id IS NOT DISTINCT FROM OLD.linked_tracker_item_id THEN
    RETURN NEW;
  END IF;

  -- Skip validation for internal SECURITY DEFINER callers (they set
  -- app.internal_operator_bridge = 'true' to signal server-validated paths).
  IF current_setting('app.internal_operator_bridge', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT entity INTO v_item_entity
  FROM tracker_items
  WHERE id = NEW.linked_tracker_item_id;

  IF v_item_entity IS NULL THEN
    RAISE EXCEPTION 'Linked tracker item does not exist: %', NEW.linked_tracker_item_id;
  END IF;

  -- Verify entity relevance
  IF v_item_entity != 'Both' AND NEW.entity != 'Both' AND v_item_entity != NEW.entity THEN
    RAISE EXCEPTION 'Linked tracker item (entity: %) is not accessible for request entity: %', v_item_entity, NEW.entity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_client_input_tracker_link ON client_input_requests;
CREATE TRIGGER trg_validate_client_input_tracker_link
  BEFORE INSERT OR UPDATE OF linked_tracker_item_id ON client_input_requests
  FOR EACH ROW
  EXECUTE FUNCTION validate_client_input_tracker_link();
