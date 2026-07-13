-- Filament Website Review v1
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Review first, then run once in Supabase SQL Editor.
--
-- Adds a versioned guided-review template for the Filament website:
--   template-filament-website-review-v1
--
-- The ordered 32-section website inventory remains in
-- src/data/guidedReviewConfigs.js. This migration creates only the database
-- template contract and extends the existing template-aware completeness
-- gates so Website Review v1 requires exactly 32 reviewed entries before
-- submission.
--
-- Historical contracts preserved:
--   Company Profile Review       -> 16
--   Presentation Review v1       -> 43
--   Presentation Review v2       -> 61
--   Website Review v1            -> 32

-- =============================================================================
-- 1. WEBSITE REVIEW v1 TEMPLATE ROW
-- =============================================================================
INSERT INTO client_input_templates (id, title, description)
VALUES (
  'template-filament-website-review-v1',
  'Filament Website Review',
  'Structured section-by-section review of the Filament website (32 visible website sections).'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. WEBSITE REVIEW v1 STRUCTURED SECTIONS
-- =============================================================================
INSERT INTO client_input_template_sections
  (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
SELECT * FROM (VALUES
  ('template-filament-website-review-v1', 'current_concern', 'Corrected Wording', 'Long Text', 'Correct wording, names, facts or claims for this website section.', 10, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'remove_content', 'Information to Remove', 'Long Text', 'Information, people, visuals or claims that should be removed.', 20, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'replace_content', 'Information to Add', 'Exact Copy', 'Information or wording that should be added.', 30, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'copy_treatment', 'Logo or Branding Change', 'Long Text', 'Logo, brand, colour or visual identity feedback.', 35, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'visual_direction', 'Image or Photograph Change', 'Long Text', 'Image, photograph, diagram or visual feedback.', 40, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'structure_changes', 'Layout or Section Order Change', 'Long Text', 'Layout, order or section-structure feedback.', 50, false, NULL::jsonb),
  ('template-filament-website-review-v1', 'additional_comments', 'Additional Comments', 'Long Text', 'Button, link, contact detail or any other feedback Embark should know.', 60, false, NULL::jsonb)
) AS v(template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
WHERE NOT EXISTS (
  SELECT 1 FROM client_input_template_sections s
  WHERE s.template_id = 'template-filament-website-review-v1' AND s.section_key = v.section_key
);

-- =============================================================================
-- 3. VERSION-AWARE SUBMIT GATE (internal Active Editor path)
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
  SELECT ua.display_name || ' — ' || ua.organisation_label INTO v_author_label
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
-- 4. VERSION-AWARE COMPLETENESS TRIGGER (authenticated client path)
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
        RAISE EXCEPTION 'Guided review incomplete: % of % items reviewed — every page, slide or website section must be marked before submission', v_reviewed, v_expected;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_guided_review_completeness ON client_input_requests;
CREATE TRIGGER trg_enforce_guided_review_completeness BEFORE UPDATE ON client_input_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_guided_review_completeness();
