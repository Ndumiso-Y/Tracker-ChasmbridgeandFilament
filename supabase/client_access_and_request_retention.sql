-- Client Access Provisioning, Request Retention & Support Status Correction (V4A.15)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor after review.
--
-- This migration contains three independent, narrowly-scoped corrections:
--
--   1. SUPPORT STATUS CHECK CORRECTION (functional defect fix)
--      The live protect_support_columns trigger (support_ticket_workflow.sql,
--      already executed) explicitly permits a contributor to transition a
--      Resolved ticket to 'Open' ("Still Not Resolved"), and the frontend
--      display mapping already treats 'Open' as canonical — but the original
--      support_tickets.status CHECK constraint (collaboration_layer_schema.sql)
--      never included 'Open'. The client rejection path therefore fails on
--      constraint 23514 in production. This adds 'Open' to the CHECK,
--      preserving every existing value.
--
--   2. CLIENT ACCESS PROVISIONING (master operational blocker)
--      Zero user_access_profiles rows with role='client_contributor' exist
--      and nothing in the product can create one. This adds ONE narrow,
--      admin-session-gated RPC that activates client access for an EXACT
--      email that has already signed in via Magic Link (auth.users row must
--      already exist — this function never fabricates identities).
--      Security: is_admin() required; role is hard-coded 'client_contributor'
--      (this path can never create or modify an admin); no anon grant;
--      no arbitrary auth.users browsing is exposed to the frontend.
--
--   3. REQUEST RETENTION (Delete Draft + Archive Real Work)
--      client_input_requests gains an additive archived_at column plus three
--      narrow Active-Editor-validated RPCs: archive, unarchive, and a
--      draft-only delete restricted to never-client-visible drafts
--      (status = 'Draft' AND assigned_contributor_user_id IS NULL).
--      Real collaboration records are never deleted — only archived,
--      reversibly, with provenance recorded in client_input_comments.
--      The internal register read RPC is recreated (same input signature)
--      with archived_at added to its return contract.
--
-- This migration does NOT:
--   - use or reference service_role
--   - add any RLS policy, anon table access, or USING(true) policy
--   - create any generic mutation or generic delete function
--   - touch app.internal_operator_bridge (its single setter remains
--     assign_internal_client_input_contributor)
--   - modify any previously-executed migration file's objects except the
--     two explicitly-versioned recreations documented below
--     (support_tickets status CHECK; get_internal_client_input_requests).

-- =============================================================================
-- 1. SUPPORT STATUS CHECK CORRECTION — add 'Open'
-- =============================================================================
-- Original value list preserved verbatim; 'Open' added because the live
-- trigger contract and the product's display mapping already use it.
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (
  status IN (
    'New', 'Open', 'Acknowledged', 'Investigating', 'Waiting on Client',
    'Waiting on Third Party', 'Fix In Progress', 'Resolution Proposed',
    'Awaiting Client Confirmation', 'Resolved', 'Closed', 'Reopened'
  )
);

-- =============================================================================
-- 2. CLIENT ACCESS PROVISIONING RPC
-- =============================================================================
-- Activates (or reactivates/updates) client contributor access for a person
-- who has ALREADY signed in at least once via Magic Link. Exact-email match
-- only. Refuses to touch admin profiles in either direction.
CREATE OR REPLACE FUNCTION provision_client_contributor(
  p_email text,
  p_display_name text,
  p_entity_scope text
) RETURNS user_access_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_role text;
  v_row user_access_profiles;
BEGIN
  -- Caller must be an authenticated admin — provisioning is never public,
  -- never anon, never client-self-service.
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only an authenticated admin can provision client access.';
  END IF;

  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'A display name is required.';
  END IF;

  IF p_entity_scope NOT IN ('Chasm Bridge Charity', 'Filament', 'Both') THEN
    RAISE EXCEPTION 'Invalid entity scope: %', p_entity_scope;
  END IF;

  -- Exact-email lookup of an EXISTING sign-in identity. This function never
  -- creates auth.users rows and never exposes auth.users browsing.
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No sign-in found for %. Ask the person to sign in once via the Magic Link email first, then activate them here.', p_email;
  END IF;

  -- Never elevate to or demote from admin through this path.
  SELECT role INTO v_existing_role FROM user_access_profiles WHERE user_id = v_user_id;
  IF v_existing_role = 'admin' THEN
    RAISE EXCEPTION 'This account is an admin profile — it cannot be managed through client access provisioning.';
  END IF;

  INSERT INTO user_access_profiles (user_id, role, entity_scope, is_active, display_name)
  VALUES (v_user_id, 'client_contributor', p_entity_scope, true, trim(p_display_name))
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'client_contributor',
    entity_scope = EXCLUDED.entity_scope,
    is_active = true,
    display_name = EXCLUDED.display_name,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION provision_client_contributor(text, text, text) FROM PUBLIC;
-- Authenticated only — the function itself re-verifies is_admin().
-- Deliberately NOT granted to anon.
GRANT EXECUTE ON FUNCTION provision_client_contributor(text, text, text) TO authenticated;

-- =============================================================================
-- 3. REQUEST RETENTION — archived_at column
-- =============================================================================
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_client_input_requests_archived_at
  ON client_input_requests (archived_at);

-- =============================================================================
-- 4. ARCHIVE / UNARCHIVE RPCs (Active-Editor validated, reversible)
-- =============================================================================
CREATE OR REPLACE FUNCTION archive_internal_client_input_request(
  p_author_id text,
  p_request_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT * INTO v_row FROM client_input_requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This request is already archived.';
  END IF;

  UPDATE client_input_requests
  SET archived_at = now(), updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  -- Provenance: archiving is an audited operational action, never silent.
  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (p_request_id, p_author_id, 'Request archived by ' || v_author_label || '.');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION archive_internal_client_input_request(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION archive_internal_client_input_request(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION unarchive_internal_client_input_request(
  p_author_id text,
  p_request_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT * INTO v_row FROM client_input_requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_row.archived_at IS NULL THEN
    RAISE EXCEPTION 'This request is not archived.';
  END IF;

  UPDATE client_input_requests
  SET archived_at = NULL, updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (p_request_id, p_author_id, 'Request restored from archive by ' || v_author_label || '.');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION unarchive_internal_client_input_request(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unarchive_internal_client_input_request(text, text) TO anon, authenticated;

-- =============================================================================
-- 5. DRAFT-ONLY DELETE RPC
-- =============================================================================
-- Permanent delete is allowed ONLY for a request that never entered the
-- collaboration lifecycle: status = 'Draft' AND never assigned to a client
-- contributor (drafts are already labelled "not visible to the client" in
-- the product). Everything else must use archive. Child rows (responses,
-- comments, review entries, checklist items, revisions) are removed by the
-- existing ON DELETE CASCADE foreign keys — no generic delete surface exists.
CREATE OR REPLACE FUNCTION delete_internal_draft_client_input_request(
  p_author_id text,
  p_request_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_status text;
  v_assigned uuid;
BEGIN
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;

  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT status, assigned_contributor_user_id INTO v_status, v_assigned
  FROM client_input_requests WHERE id = p_request_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_status <> 'Draft' THEN
    RAISE EXCEPTION 'Only Draft requests can be deleted. This request is %. Use Archive instead.', v_status;
  END IF;
  IF v_assigned IS NOT NULL THEN
    RAISE EXCEPTION 'This draft has been assigned to a client contributor and may have been seen — use Archive instead.';
  END IF;

  DELETE FROM client_input_requests WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_internal_draft_client_input_request(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_internal_draft_client_input_request(text, text) TO anon, authenticated;

-- =============================================================================
-- 6. RECREATE INTERNAL REGISTER READ — add archived_at to the return contract
-- =============================================================================
-- Same pattern as client_input_tracker_link.sql (already live): identical
-- input signature (p_author_id text); RETURNS TABLE extended by exactly one
-- column (archived_at); dropped and immediately recreated in the same
-- migration transaction.
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
  linked_tracker_item_id text,
  linked_tracker_item_title text,
  linked_tracker_item_phase text,
  linked_tracker_item_status text,
  linked_tracker_item_entity text,
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
    r.id, r.title, r.entity, r.template_id, t.title,
    r.status, r.request_origin, r.requirement_source,
    r.assigned_contributor_user_id, uap.display_name,
    r.client_reported_urgency, r.created_at, r.submitted_at, r.review_acknowledged_at,
    cba.display_name || ' — ' || cba.organisation_label,
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id),
    (SELECT count(*) FROM client_input_review_entries e WHERE e.request_id = r.id AND e.review_status <> 'Not Reviewed'),
    r.linked_tracker_item_id,
    ti.title,
    ti.phase,
    ti.status,
    ti.entity,
    r.archived_at
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
