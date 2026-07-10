-- Client Input Request Edit (V4A.18)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor after review.
--
-- GAP: support tickets have always had a safe internal edit
-- (update_internal_support_ticket), but client input requests never did —
-- a typo in a logged request was permanent. This adds the matching narrow
-- edit RPC for the internal Active Editor.
--
-- Contract (deliberately narrow):
--   - Editable fields ONLY: title, entity, client_reported_urgency,
--     requirement_source. Never status, origin, assignment, approver,
--     timestamps, or the linked delivery item (which has its own link RPC).
--   - Lifecycle guard: anything except Approved / Delivered is editable
--     (matching the ticket rule of "anything not Closed").
--   - Entity changes are validated against a linked delivery item's entity.
--   - Every edit writes a provenance comment; optional additional context
--     is appended as provenance too (the original ask is never rewritten —
--     comments are append-only history).
--   - protect_request_columns is untouched: none of its guarded columns
--     (status / approver / confirmation timestamps) can be reached here.

CREATE OR REPLACE FUNCTION update_internal_client_input_request(
  p_author_id text,
  p_request_id text,
  p_title text,
  p_entity text,
  p_client_reported_urgency text,
  p_requirement_source text,
  p_additional_context text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_status text;
  v_link text;
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

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'A request title is required.';
  END IF;
  IF p_entity NOT IN ('Chasm Bridge Charity', 'Filament', 'Both') THEN
    RAISE EXCEPTION 'Invalid entity: %', p_entity;
  END IF;
  IF p_client_reported_urgency NOT IN ('Normal', 'Time Sensitive', 'Urgent') THEN
    RAISE EXCEPTION 'Invalid urgency: %', p_client_reported_urgency;
  END IF;
  IF p_requirement_source IS NOT NULL
     AND p_requirement_source NOT IN ('Platform', 'WhatsApp', 'Email', 'Meeting', 'Phone Call', 'Other') THEN
    RAISE EXCEPTION 'Invalid requirement source: %', p_requirement_source;
  END IF;

  SELECT status, linked_tracker_item_id INTO v_status, v_link
  FROM client_input_requests WHERE id = p_request_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_status IN ('Approved', 'Delivered') THEN
    RAISE EXCEPTION 'A % request can no longer be edited.', v_status;
  END IF;

  -- Entity change must stay compatible with a linked delivery item.
  IF v_link IS NOT NULL THEN
    SELECT entity INTO v_item_entity FROM tracker_items WHERE id = v_link;
    IF v_item_entity IS NOT NULL AND v_item_entity != 'Both'
       AND p_entity != 'Both' AND v_item_entity != p_entity THEN
      RAISE EXCEPTION 'Entity % does not match the linked delivery item (entity: %). Unlink it first or keep a compatible entity.', p_entity, v_item_entity;
    END IF;
  END IF;

  UPDATE client_input_requests
  SET
    title = trim(p_title),
    entity = p_entity,
    client_reported_urgency = p_client_reported_urgency,
    requirement_source = COALESCE(p_requirement_source, requirement_source),
    updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  -- Append-only provenance: the edit itself, plus any added context.
  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (p_request_id, p_author_id, 'Request details updated by ' || v_author_label || '.');

  IF p_additional_context IS NOT NULL AND length(trim(p_additional_context)) > 0 THEN
    INSERT INTO client_input_comments (input_request_id, author_id, comment)
    VALUES (p_request_id, p_author_id, 'Context added by ' || v_author_label || ': ' || trim(p_additional_context));
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION update_internal_client_input_request(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_internal_client_input_request(text, text, text, text, text, text, text) TO anon, authenticated;
