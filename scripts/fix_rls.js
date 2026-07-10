import fs from 'fs';

let sql = fs.readFileSync('supabase/collaboration_layer_schema.sql', 'utf8');

const triggerSQL = `

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
`;

if (!sql.includes('trg_protect_support_columns')) {
  fs.writeFileSync('supabase/collaboration_layer_schema.sql', sql + triggerSQL);
  console.log('Appended security triggers to SQL');
} else {
  console.log('Security triggers already exist');
}
