-- Client Delivery Assurance & Collaboration Layer (V4A)
-- Additive, idempotent schema additions.

-- 1. user_access_profiles
CREATE TABLE IF NOT EXISTS user_access_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('admin', 'client_contributor', 'viewer')),
  entity_scope text NOT NULL CHECK (entity_scope IN ('Chasm Bridge Charity', 'Filament', 'Both')),
  is_active boolean DEFAULT true,
  display_name text,
  update_author_id text REFERENCES update_authors(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for user_access_profiles (Admin manages, users can read their own)
ALTER TABLE user_access_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access user_access_profiles" ON user_access_profiles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users read own profile" ON user_access_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2. client_input_templates
CREATE TABLE IF NOT EXISTS client_input_templates (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE client_input_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated users read templates" ON client_input_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write templates" ON client_input_templates FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 3. client_input_template_sections
CREATE TABLE IF NOT EXISTS client_input_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL REFERENCES client_input_templates(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_label text NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('Short Text', 'Long Text', 'Exact Copy', 'Checklist', 'Yes / No', 'Select')),
  help_text text,
  sort_order integer DEFAULT 0,
  is_required boolean DEFAULT false,
  controlled_options jsonb
);
ALTER TABLE client_input_template_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated users read template sections" ON client_input_template_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write template sections" ON client_input_template_sections FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Helper function to check if user has entity access
CREATE OR REPLACE FUNCTION has_entity_access(request_entity text) RETURNS boolean AS $$
DECLARE
  user_scope text;
BEGIN
  SELECT entity_scope INTO user_scope FROM user_access_profiles WHERE user_id = auth.uid() AND is_active = true AND role = 'client_contributor';
  IF user_scope IS NULL THEN
    RETURN false;
  END IF;
  IF user_scope = 'Both' THEN
    RETURN true;
  END IF;
  RETURN user_scope = request_entity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. client_input_requests
CREATE TABLE IF NOT EXISTS client_input_requests (
  id text PRIMARY KEY,
  title text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('Chasm Bridge Charity', 'Filament', 'Both')),
  linked_tracker_item_id text REFERENCES tracker_items(id) ON DELETE SET NULL,
  template_id text NOT NULL REFERENCES client_input_templates(id),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Ready for Embark Review', 'Clarification Required', 'Requirements Confirmed', 'In Production', 'Client Review', 'Changes Requested', 'Approved', 'Delivered')),
  assigned_contributor_user_id uuid REFERENCES auth.users(id),
  primary_approver_author_id text REFERENCES update_authors(id),
  revision_number integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  review_acknowledged_at timestamptz,
  confirmed_at timestamptz
);
ALTER TABLE client_input_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access input_requests" ON client_input_requests FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors read assigned entity requests" ON client_input_requests FOR SELECT TO authenticated USING (has_entity_access(entity));
-- Update allowed if assigned to them and status is active input phase
CREATE POLICY "Contributors update assigned requests" ON client_input_requests FOR UPDATE TO authenticated USING (assigned_contributor_user_id = auth.uid() AND status IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required')) WITH CHECK (assigned_contributor_user_id = auth.uid());

-- 5. client_input_responses
CREATE TABLE IF NOT EXISTS client_input_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_request_id text NOT NULL REFERENCES client_input_requests(id) ON DELETE CASCADE,
  template_section_id uuid NOT NULL REFERENCES client_input_template_sections(id) ON DELETE CASCADE,
  content text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE client_input_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access input_responses" ON client_input_responses FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select assigned responses" ON client_input_responses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_responses.input_request_id AND has_entity_access(entity))
);
CREATE POLICY "Contributors update assigned responses" ON client_input_responses FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_responses.input_request_id AND assigned_contributor_user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_responses.input_request_id AND assigned_contributor_user_id = auth.uid())
);
CREATE POLICY "Contributors insert assigned responses" ON client_input_responses FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_responses.input_request_id AND assigned_contributor_user_id = auth.uid())
);

-- 6. client_input_response_revisions
CREATE TABLE IF NOT EXISTS client_input_response_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES client_input_responses(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  content text,
  changed_by_user_id uuid REFERENCES auth.users(id),
  changed_by_author_id text REFERENCES update_authors(id),
  revision_reason text,
  created_at timestamptz DEFAULT now(),
  is_current_confirmed boolean DEFAULT false
);
ALTER TABLE client_input_response_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access revisions" ON client_input_response_revisions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select entity revisions" ON client_input_response_revisions FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM client_input_responses r 
    JOIN client_input_requests req ON r.input_request_id = req.id
    WHERE r.id = client_input_response_revisions.response_id AND has_entity_access(req.entity)
  )
);

-- 7. delivery_assurance_checklist_items
CREATE TABLE IF NOT EXISTS delivery_assurance_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_request_id text REFERENCES client_input_requests(id) ON DELETE CASCADE,
  linked_tracker_item_id text REFERENCES tracker_items(id) ON DELETE CASCADE,
  checklist_type text NOT NULL CHECK (checklist_type IN ('Ready for Production', 'Completion')),
  item_key text NOT NULL,
  item_label text NOT NULL,
  is_required boolean DEFAULT true,
  is_completed boolean DEFAULT false,
  completed_by_user_id uuid REFERENCES auth.users(id),
  completed_by_author_id text REFERENCES update_authors(id),
  completed_at timestamptz,
  confirmation_source text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE delivery_assurance_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access checklist_items" ON delivery_assurance_checklist_items FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select checklist_items" ON delivery_assurance_checklist_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM client_input_requests req WHERE req.id = delivery_assurance_checklist_items.input_request_id AND has_entity_access(req.entity)
  )
);

-- 8. client_input_comments
CREATE TABLE IF NOT EXISTS client_input_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_request_id text NOT NULL REFERENCES client_input_requests(id) ON DELETE CASCADE,
  response_id uuid REFERENCES client_input_responses(id) ON DELETE CASCADE,
  author_id text REFERENCES update_authors(id),
  user_id uuid REFERENCES auth.users(id),
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE client_input_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access comments" ON client_input_comments FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select comments" ON client_input_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_comments.input_request_id AND has_entity_access(entity))
);
CREATE POLICY "Contributors insert comments" ON client_input_comments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM client_input_requests WHERE id = client_input_comments.input_request_id AND assigned_contributor_user_id = auth.uid())
);

-- 9. support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id text PRIMARY KEY,
  title text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('Chasm Bridge Charity', 'Filament', 'Both')),
  category text NOT NULL CHECK (category IN ('Email & Mailbox', 'Website', 'Domain', 'Social Media', 'Access & Permissions', 'Content Correction', 'Technical Issue', 'Account Configuration', 'Graduate/Cohort System', 'Other')),
  description text NOT NULL,
  linked_tracker_item_id text REFERENCES tracker_items(id) ON DELETE SET NULL,
  reported_by_user_id uuid REFERENCES auth.users(id),
  priority text DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  responsible_party text DEFAULT 'Embark Digitals',
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Acknowledged', 'Investigating', 'Waiting on Client', 'Waiting on Third Party', 'Fix In Progress', 'Resolution Proposed', 'Awaiting Client Confirmation', 'Resolved', 'Closed', 'Reopened')),
  investigation_summary text,
  action_taken text,
  resolution_proposed_at timestamptz,
  client_confirmed_at timestamptz,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access support_tickets" ON support_tickets FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select entity tickets" ON support_tickets FOR SELECT TO authenticated USING (has_entity_access(entity));
CREATE POLICY "Contributors insert entity tickets" ON support_tickets FOR INSERT TO authenticated WITH CHECK (has_entity_access(entity));
CREATE POLICY "Contributors update own reported tickets" ON support_tickets FOR UPDATE TO authenticated USING (reported_by_user_id = auth.uid() OR has_entity_access(entity)) WITH CHECK (reported_by_user_id = auth.uid() OR has_entity_access(entity));

-- 10. weekly_delivery_reviews
CREATE TABLE IF NOT EXISTS weekly_delivery_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  reviewer_user_id uuid REFERENCES auth.users(id),
  entity text NOT NULL CHECK (entity IN ('Chasm Bridge Charity', 'Filament')),
  overall_delivery text NOT NULL CHECK (overall_delivery IN ('Excellent', 'Good', 'Acceptable', 'Needs Improvement', 'Poor')),
  communication_rating text CHECK (communication_rating IN ('Clear', 'Mostly Clear', 'Sometimes Unclear', 'Poor')),
  delivery_timing text CHECK (delivery_timing IN ('On Time', 'Mostly On Time', 'Delayed', 'Materially Delayed')),
  requirement_understanding text CHECK (requirement_understanding IN ('Understood First Time', 'Minor Clarification Required', 'Multiple Revisions Required', 'Requirement Misunderstood')),
  issue_resolution text CHECK (issue_resolution IN ('Strong', 'Acceptable', 'Slow', 'Issue Still Open')),
  approval_process text CHECK (approval_process IN ('Smooth', 'Minor Delays', 'Unclear', 'Blocking Delivery')),
  worked_well text,
  did_not_meet_expectations text,
  next_week_priority_1 text,
  next_week_priority_2 text,
  next_week_priority_3 text,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE weekly_delivery_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access reviews" ON weekly_delivery_reviews FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select entity reviews" ON weekly_delivery_reviews FOR SELECT TO authenticated USING (has_entity_access(entity));
CREATE POLICY "Contributors insert reviews" ON weekly_delivery_reviews FOR INSERT TO authenticated WITH CHECK (has_entity_access(entity));

-- 11. weekly_review_feedback_items
CREATE TABLE IF NOT EXISTS weekly_review_feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES weekly_delivery_reviews(id) ON DELETE CASCADE,
  feedback_category text NOT NULL CHECK (feedback_category IN ('Worked Well', 'Did Not Meet Expectations', 'Timing', 'Communication', 'Requirement Understanding', 'Issue Resolution', 'Approval Process')),
  feedback_text text NOT NULL,
  sentiment text NOT NULL CHECK (sentiment IN ('Positive', 'Neutral', 'Negative', 'Critical')),
  disposition text CHECK (disposition IN ('Acknowledged — No Separate Action', 'Follow-Up Task Required', 'Support Ticket Required', 'Clarification Required', 'Process Improvement', 'Monitor Next Week')),
  linked_tracker_item_id text REFERENCES tracker_items(id) ON DELETE SET NULL,
  linked_support_ticket_id text REFERENCES support_tickets(id) ON DELETE SET NULL,
  admin_response text,
  dispositioned_by text REFERENCES update_authors(id),
  dispositioned_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE weekly_review_feedback_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access feedback_items" ON weekly_review_feedback_items FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Contributors select entity feedback_items" ON weekly_review_feedback_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM weekly_delivery_reviews WHERE id = weekly_review_feedback_items.review_id AND has_entity_access(entity))
);

-- Note Types Update for collaboration tracking
ALTER TABLE tracker_item_notes DROP CONSTRAINT IF EXISTS tracker_item_notes_note_type_check;
ALTER TABLE tracker_item_notes ADD CONSTRAINT tracker_item_notes_note_type_check CHECK (
  note_type IN (
    'manual', 'status_change', 'due_date_update', 'next_action_update', 'priority_update',
    'approval_requested', 'approval_status_change', 'decision_recorded', 'blocker_added',
    'blocker_updated', 'blocker_resolved', 'workflow_stage_change', 'delivery_lane_change',
    'cadence_status_change', 'scope_treatment_change', 'record_type_change',
    'client_input_status_change', 'support_ticket_created', 'support_ticket_status_change',
    'readiness_checklist_update', 'completion_checklist_update', 'client_input_revision'
  )
);


-- ==============================================================================
-- LIVE BLOCKER RLS CORRECTIONS (Column-level & State-level Mutability Triggers)
-- ==============================================================================

-- 1. Protect client_input_responses from modification after submission
CREATE OR REPLACE FUNCTION protect_frozen_responses() RETURNS trigger AS $$
DECLARE
  req_status text;
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  
  SELECT status INTO req_status FROM client_input_requests WHERE id = NEW.input_request_id;
  IF req_status NOT IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required') THEN
    RAISE EXCEPTION 'Cannot modify a response when the request is %', req_status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_frozen_responses ON client_input_responses;
CREATE TRIGGER trg_protect_frozen_responses BEFORE UPDATE ON client_input_responses
  FOR EACH ROW EXECUTE FUNCTION protect_frozen_responses();

-- 2. Protect client_input_requests from unauthorized column mutations by contributors
CREATE OR REPLACE FUNCTION protect_request_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  
  IF NEW.primary_approver_author_id IS DISTINCT FROM OLD.primary_approver_author_id THEN
    RAISE EXCEPTION 'Contributors cannot change the primary approver';
  END IF;
  
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('Client Input In Progress', 'Ready for Embark Review') THEN
      RAISE EXCEPTION 'Contributors can only transition status to In Progress or Ready for Review';
    END IF;
  END IF;

  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.review_acknowledged_at IS DISTINCT FROM OLD.review_acknowledged_at THEN
    RAISE EXCEPTION 'Contributors cannot mutate admin confirmation timestamps';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_request_columns ON client_input_requests;
CREATE TRIGGER trg_protect_request_columns BEFORE UPDATE ON client_input_requests
  FOR EACH ROW EXECUTE FUNCTION protect_request_columns();

-- 3. Protect support_tickets columns
CREATE OR REPLACE FUNCTION protect_support_columns() RETURNS trigger AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  
  IF NEW.priority IS DISTINCT FROM OLD.priority OR 
     NEW.responsible_party IS DISTINCT FROM OLD.responsible_party OR
     NEW.investigation_summary IS DISTINCT FROM OLD.investigation_summary OR
     NEW.action_taken IS DISTINCT FROM OLD.action_taken OR
     NEW.resolution_proposed_at IS DISTINCT FROM OLD.resolution_proposed_at OR
     NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
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

DROP TRIGGER IF EXISTS trg_protect_support_columns ON support_tickets;
CREATE TRIGGER trg_protect_support_columns BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION protect_support_columns();
