-- Filament Presentation Review v2 — 61-Slide Source-of-Truth Correction (V4A.16)
-- Additive, idempotent migration.
-- DO NOT RUN AUTOMATICALLY. Run manually in Supabase SQL Editor after review.
--
-- WHY: the original presentation review template
-- (template-filament-slides-review) was built on a 43-slide inventory that
-- does not correspond to the physical Filament presentation. The real deck
-- (Filament Presentation/web-presentation/src/data/slides.js — deployed at
-- ndumiso-y.github.io/FilamentSlides/) contains exactly 61 slides.
--
-- BACKWARD COMPATIBILITY (deliberate design):
--   - The 43-slide template row and every historical persisted review
--     (client_input_review_entries keyed under it) remain untouched and
--     readable forever.
--   - A NEW template row, template-filament-slides-review-v2, carries the
--     corrected 61-slide contract. New reviews are created only against v2
--     (the frontend retires v1 from all creation pickers).
--   - The two server completeness gates are recreated with the version-aware
--     CASE: 16 for the profile template, 43 for the historical v1 template,
--     61 for v2. No blind global 43 → 61 replacement — a historical v1
--     review still in flight would still be gated at its true 43.
--
-- NOTE on template sections: the guided slide-by-slide wizard renders from
-- src/data/guidedReviewConfigs.js (the 61-slide inventory) and persists to
-- client_input_review_entries — it never renders template sections. The v2
-- sections seeded here are the same seven structured review fields as v1
-- (concern / remove / exact copy / copy treatment / visual direction /
-- structure changes / additional comments), WITHOUT a 61-option slide
-- Select: the guided config is the single slide inventory, and duplicating
-- it as SQL options would create a second source of truth to drift.
--
-- This migration does NOT touch RLS, grants beyond the two recreated
-- functions (same grants as before), any already-executed migration file,
-- app.internal_operator_bridge, or any table structure.

-- =============================================================================
-- 1. TEMPLATE v2 ROW
-- =============================================================================
INSERT INTO client_input_templates (id, title, description)
VALUES (
  'template-filament-slides-review-v2',
  'Filament Presentation Review',
  'Structured slide-by-slide review of the Filament presentation (61 slides across the deck''s real sections).'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. TEMPLATE v2 STRUCTURED SECTIONS (same seven review fields as v1)
-- =============================================================================
INSERT INTO client_input_template_sections
  (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
SELECT * FROM (VALUES
  ('template-filament-slides-review-v2', 'current_concern', 'Current Concern', 'Long Text', 'What is wrong or unclear on this slide?', 10, false, NULL::jsonb),
  ('template-filament-slides-review-v2', 'remove_content', 'Remove This', 'Long Text', 'Anything to remove from this slide.', 20, false, NULL::jsonb),
  ('template-filament-slides-review-v2', 'replace_content', 'Replace with This Exact Wording', 'Exact Copy', 'Provide the exact replacement copy.', 30, false, NULL::jsonb),
  ('template-filament-slides-review-v2', 'copy_treatment', 'Copy Treatment', 'Select', 'How should Embark handle the copy?', 35, true, '["Use Exact Copy as Supplied", "Embark May Refine Grammar Only", "Embark May Professionally Rewrite for Approval", "Requires Discussion"]'::jsonb),
  ('template-filament-slides-review-v2', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Visual or image direction for this slide.', 40, false, NULL::jsonb),
  ('template-filament-slides-review-v2', 'structure_changes', 'Order / Structure Changes', 'Long Text', 'Sequence or structural changes.', 50, false, NULL::jsonb),
  ('template-filament-slides-review-v2', 'additional_comments', 'Additional Comments', 'Long Text', 'Anything else Embark should know.', 60, false, NULL::jsonb)
) AS v(template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options)
WHERE NOT EXISTS (
  SELECT 1 FROM client_input_template_sections s
  WHERE s.template_id = 'template-filament-slides-review-v2' AND s.section_key = v.section_key
);

-- =============================================================================
-- 3. VERSION-AWARE SUBMIT GATE (recreated — internal submit RPC)
-- =============================================================================
-- Identical to the live definition in
-- client_input_persistence_and_guided_reviews.sql except the expected-count
-- CASE gains the v2 61-slide mapping. 16 and 43 mappings preserved.
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

  -- Version-aware expected counts, in lockstep with guidedReviewConfigs.js:
  -- 16 profile pages; 43 for the retired historical presentation inventory;
  -- 61 for the corrected physical deck.
  v_expected := CASE v_template_id
    WHEN 'template-filament-profile-review' THEN 16
    WHEN 'template-filament-slides-review' THEN 43
    WHEN 'template-filament-slides-review-v2' THEN 61
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
-- 4. VERSION-AWARE COMPLETENESS TRIGGER (recreated)
-- =============================================================================
-- Same guard as the live definition, with the v2 mapping added. Still has
-- deliberately NO is_admin()/bridge bypass, and still touches only the
-- transition to 'Ready for Embark Review' on guided templates.
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
        RAISE EXCEPTION 'Guided review incomplete: % of % items reviewed — every page/slide must be marked before submission', v_reviewed, v_expected;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_guided_review_completeness ON client_input_requests;
CREATE TRIGGER trg_enforce_guided_review_completeness BEFORE UPDATE ON client_input_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_guided_review_completeness();
