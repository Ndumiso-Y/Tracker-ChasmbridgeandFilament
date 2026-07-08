-- Client-Originated Requirement Workflow (V4A.7)
-- Additive migration. Run manually in the Supabase SQL Editor after review.
-- Do not run automatically.
--
-- RUN ORDER: run this file BEFORE supabase/internal_operator_creation_
-- workflow.sql — that file's create_internal_client_input_request function
-- writes to the request_origin column added here.
--
-- Purpose: the internal "Request Client Input" flow (Embark asks a client
-- for structured input) and this client-originated flow (a client directly
-- raises a requirement/change with Embark) are two different directions
-- through the SAME client_input_requests / responses / revisions / comments
-- architecture — no second request store. Until now, client_input_requests
-- had no INSERT policy for an authenticated client_contributor at all (only
-- "Admin full access" FOR ALL and a client UPDATE policy existed) — a client
-- had no way to create their own request row. This is the narrow, additive
-- correction: one new column to truthfully record which direction a request
-- came from, and one new RLS INSERT policy letting a client_contributor
-- create only a request assigned to themselves, in the correct starting
-- status, correctly labelled as client-originated. Every other existing
-- request lifecycle mechanic (Save Draft / Submit to Embark, revision
-- freezing, template rendering, comment provenance) is reused completely
-- unchanged — see src/views/ClientInputRequirements.jsx.

-- =============================================================================
-- 1. request_origin (distinguishes who initiated the request)
-- =============================================================================
-- Genuinely needed beyond display: without it, an admin cannot reliably
-- filter/report "requests Embark asked for" vs "requests the client raised
-- themselves" — a request created by the internal bridge with a contributor
-- pre-assigned at creation is otherwise indistinguishable, by column values
-- alone, from one a client self-assigned by submitting directly. Existing
-- rows (all created through the internal-only path prior to this
-- correction) default to 'Internal Requested Input', which is truthful.
ALTER TABLE client_input_requests
  ADD COLUMN IF NOT EXISTS request_origin text NOT NULL DEFAULT 'Internal Requested Input'
  CHECK (request_origin IN ('Internal Requested Input', 'Client-Originated Requirement'));

-- =============================================================================
-- 2. CLIENT-ORIGINATED REQUEST CREATION (RLS)
-- =============================================================================
-- A client_contributor may INSERT a request only for themselves (self-
-- assignment, never on behalf of another user), only within their own
-- entity access, only starting in the one status that means "needs client
-- input, and the client is about to provide it right now", and only
-- correctly labelled as client-originated — they cannot claim
-- 'Internal Requested Input' or start a row in an already-advanced/frozen
-- status. Admin ("Admin full access input_requests", FOR ALL) is untouched.
-- The internal Active Editor bridge (SECURITY DEFINER) is untouched and
-- unaffected by RLS either way.
CREATE POLICY "Contributors create own requests" ON client_input_requests FOR INSERT TO authenticated WITH CHECK (
  assigned_contributor_user_id = auth.uid()
  AND has_entity_access(entity)
  AND status = 'Client Input Required'
  AND request_origin = 'Client-Originated Requirement'
);
