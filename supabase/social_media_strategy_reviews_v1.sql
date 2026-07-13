-- Social Media Strategy Reviews v1
-- Additive, idempotent activation migration.
-- DO NOT RUN AUTOMATICALLY. Review first, then run once in Supabase SQL Editor.
--
-- Adds two simplified 14-section guided review templates:
--   template-filament-social-media-strategy-review-v1
--   template-chasm-bridge-social-media-strategy-review-v1
--
-- The detailed section inventory lives in src/data/guidedReviewConfigs.js.
-- This file creates the database template contracts and replaces the shared
-- guided-review completeness gates with the final superset count map:
--   Company Profile Review                 -> 16
--   Presentation Review v1                 -> 43
--   Presentation Review v2                 -> 61
--   Filament Website Review v1             -> 32
--   Chasm Bridge Charity Website Review v1 -> 31
--   Filament Social Media Strategy v1      -> 14
--   Chasm Social Media Strategy v1         -> 14

-- =============================================================================
-- 1. TEMPLATE ROWS
-- =============================================================================
INSERT INTO client_input_templates (id, title, description)
VALUES
  (
    'template-filament-social-media-strategy-review-v1',
    'Filament 3-Month Social Media Strategy Review',
    'Simplified 14-section review of the Filament Social Media Growth & Awareness Strategy for 13 July 2026 - 13 October 2026.'
  ),
  (
    'template-chasm-bridge-social-media-strategy-review-v1',
    'Chasm Bridge Charity 3-Month Social Media Strategy Review',
    'Simplified 14-section review of the Chasm Bridge Charity Social Media Growth & Awareness Strategy for 13 July 2026 - 13 October 2026.'
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. SHARED STRUCTURED FIELDS
-- =============================================================================
INSERT INTO client_input_template_sections
  (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
SELECT * FROM (VALUES
  ('template-filament-social-media-strategy-review-v1', 'current_concern', 'What should be changed?', 'Long Text', 'Describe the strategy change required for this section.', 10, false, NULL::jsonb),
  ('template-filament-social-media-strategy-review-v1', 'replacement_copy', 'Specific wording, date, audience or calendar change', 'Long Text', 'Optional exact wording or specific detail Embark should use.', 20, false, NULL::jsonb),
  ('template-filament-social-media-strategy-review-v1', 'additional_comments', 'What should we discuss?', 'Long Text', 'Meeting discussion notes. Discuss in Meeting responses are stored here with the DISCUSS IN MEETING marker.', 30, false, NULL::jsonb),
  ('template-chasm-bridge-social-media-strategy-review-v1', 'current_concern', 'What should be changed?', 'Long Text', 'Describe the strategy change required for this section.', 10, false, NULL::jsonb),
  ('template-chasm-bridge-social-media-strategy-review-v1', 'replacement_copy', 'Specific wording, date, audience or calendar change', 'Long Text', 'Optional exact wording or specific detail Embark should use.', 20, false, NULL::jsonb),
  ('template-chasm-bridge-social-media-strategy-review-v1', 'additional_comments', 'What should we discuss?', 'Long Text', 'Meeting discussion notes. Discuss in Meeting responses are stored here with the DISCUSS IN MEETING marker.', 30, false, NULL::jsonb)
) AS v(template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
WHERE NOT EXISTS (
  SELECT 1 FROM client_input_template_sections s
  WHERE s.template_id = v.template_id AND s.section_key = v.section_key
);

-- =============================================================================
-- 3. FINAL SUPERSET SUBMIT GATE (internal Active Editor path)
-- =============================================================================
CREATE OR REPLACE FUNCTION submit_internal_client_input_review(
  p_author_id text,
  p_request_id text
) RETURNS client_input_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_label text;
  v_request_status text;
  v_template_id text;
  v_expected integer;
  v_reviewed bigint;
  v_not_reviewed bigint;
  v_row client_input_requests;
BEGIN
  SELECT ua.display_name || ' - ' || ua.organisation_label INTO v_author_label
  FROM update_authors ua
  WHERE ua.id = p_author_id AND ua.is_active = true;
  IF v_author_label IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive Active Editor id: %', p_author_id;
  END IF;

  SELECT r.status, r.template_id INTO v_request_status, v_template_id
  FROM client_input_requests r WHERE r.id = p_request_id;
  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'Client input request not found: %', p_request_id;
  END IF;
  IF v_request_status NOT IN ('Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required') THEN
    RAISE EXCEPTION 'This review has already been submitted (%)', v_request_status;
  END IF;

  v_expected := CASE v_template_id
    WHEN 'template-filament-profile-review' THEN 16
    WHEN 'template-filament-slides-review' THEN 43
    WHEN 'template-filament-slides-review-v2' THEN 61
    WHEN 'template-filament-website-review-v1' THEN 32
    WHEN 'template-chasm-bridge-website-review-v1' THEN 31
    WHEN 'template-filament-social-media-strategy-review-v1' THEN 14
    WHEN 'template-chasm-bridge-social-media-strategy-review-v1' THEN 14
    ELSE NULL
  END;

  SELECT
    count(*) FILTER (WHERE e.review_status <> 'Not Reviewed'),
    count(*) FILTER (WHERE e.review_status = 'Not Reviewed')
  INTO v_reviewed, v_not_reviewed
  FROM client_input_review_entries e
  WHERE e.request_id = p_request_id;

  IF v_not_reviewed > 0 THEN
    RAISE EXCEPTION 'Cannot submit: % item(s) are still Not Reviewed', v_not_reviewed;
  END IF;
  IF v_expected IS NOT NULL AND v_reviewed <> v_expected THEN
    RAISE EXCEPTION 'Cannot submit: only % of % items have been reviewed', v_reviewed, v_expected;
  END IF;

  UPDATE client_input_requests
  SET status = 'Ready for Embark Review',
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  INSERT INTO client_input_comments (input_request_id, author_id, comment)
  VALUES (p_request_id, p_author_id, 'Guided review submitted by ' || v_author_label || '.');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION submit_internal_client_input_review(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_internal_client_input_review(text, text) TO anon, authenticated;

-- =============================================================================
-- 4. FINAL SUPERSET COMPLETENESS TRIGGER (authenticated client path)
-- =============================================================================
CREATE OR REPLACE FUNCTION enforce_guided_review_completeness() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_reviewed bigint;
  v_not_reviewed bigint;
BEGIN
  IF NEW.status = 'Ready for Embark Review' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_expected := CASE NEW.template_id
      WHEN 'template-filament-profile-review' THEN 16
      WHEN 'template-filament-slides-review' THEN 43
      WHEN 'template-filament-slides-review-v2' THEN 61
      WHEN 'template-filament-website-review-v1' THEN 32
      WHEN 'template-chasm-bridge-website-review-v1' THEN 31
      WHEN 'template-filament-social-media-strategy-review-v1' THEN 14
      WHEN 'template-chasm-bridge-social-media-strategy-review-v1' THEN 14
      ELSE NULL
    END;
    IF v_expected IS NOT NULL THEN
      SELECT
        count(*) FILTER (WHERE e.review_status <> 'Not Reviewed'),
        count(*) FILTER (WHERE e.review_status = 'Not Reviewed')
      INTO v_reviewed, v_not_reviewed
      FROM client_input_review_entries e
      WHERE e.request_id = NEW.id;

      IF v_not_reviewed > 0 OR v_reviewed <> v_expected THEN
        RAISE EXCEPTION 'Guided review incomplete: % of % items reviewed - every page, slide, website section or strategy section must be marked before submission', v_reviewed, v_expected;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_guided_review_completeness ON client_input_requests;
CREATE TRIGGER trg_enforce_guided_review_completeness BEFORE UPDATE ON client_input_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_guided_review_completeness();
