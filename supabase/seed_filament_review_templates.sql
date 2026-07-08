-- Filament Company Profile & Slides Review Templates (V4A.9)
-- Additive seed data. Run manually in the Supabase SQL Editor after review.
-- Do not run automatically. Deliberately separate from the already-live
-- seed_v4a_templates.sql (never modify a previously-executed migration for
-- unrelated changes) — this only adds two new rows to client_input_templates
-- plus their sections, using the exact same schema-backed template
-- architecture (client_input_templates / client_input_template_sections).
-- No new table, no second template store.
--
-- Both templates use controlled Select options rather than one hardcoded
-- form per page/slide (16 pages, 43 slides) — the client picks the page or
-- section/slide from a dropdown, then fills in the same seven structured
-- review fields already established by the Presentation Review template.
-- The renderer has no cascading-select support, so "Presentation Section"
-- and "Slide" are two independent Select fields (not a dynamic filtered
-- pair) — the client is expected to pick a consistent combination, exactly
-- as they already pick a template_id then fill in unrelated free-text
-- fields elsewhere in this form model.

-- 1. Templates
INSERT INTO client_input_templates (id, title, description) VALUES
('template-filament-profile-review', 'Filament Company Profile Review', 'Page-by-page review and correction of the Filament Company Profile document.'),
('template-filament-slides-review', 'Filament Slides Review', 'Slide-by-slide review and correction of the Filament strategic presentation deck.')
ON CONFLICT (id) DO NOTHING;

-- 2. Filament Company Profile Review sections
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-filament-profile-review', 'page_section', 'Page / Section', 'Select', 'Which page of the Company Profile are you reviewing?', 10, true, '[
  "Page 1 — Cover / Filament Company Profile",
  "Page 2 — Corporate Snapshot / Company Information",
  "Page 3 — Who We Are / Introduction / Core Improvement Capability",
  "Page 4 — What We Do / Triple Thread Service",
  "Page 5 — Vision, Mission & Values",
  "Page 6 — Business Model / Goals & Objectives / Economic Intent / Business Concept",
  "Page 7 — Strategy & Quality Policy",
  "Page 8 — Competitive Edge",
  "Page 9 — Our Team & Management — Monique Phillis",
  "Page 10 — Our Team — Vincent Seboni",
  "Page 11 — Enterprise Transformation Bench / Strategic Partner Overview",
  "Page 12 — Mxolisi Kobus — Executive Profile",
  "Page 13 — Sadha Govender — Executive Profile",
  "Page 14 — Marc Corcoran — Executive Profile",
  "Page 15 — Zweli Ndese — Executive Profile",
  "Page 16 — Lefu Mohloki — Executive Profile"
]'::jsonb),
('template-filament-profile-review', 'current_concern', 'Current Concern', 'Long Text', 'What is wrong or needs attention on this page?', 15, false, NULL),
('template-filament-profile-review', 'remove_content', 'Remove This', 'Long Text', 'Specify exactly what to remove.', 20, false, NULL),
('template-filament-profile-review', 'replace_content', 'Replace with This Exact Wording', 'Exact Copy', 'Provide the exact replacement copy.', 30, false, NULL),
('template-filament-profile-review', 'copy_treatment', 'Copy Treatment', 'Select', 'How should Embark handle the copy?', 35, true, '["Use Exact Copy as Supplied", "Embark May Refine Grammar Only", "Embark May Professionally Rewrite for Approval", "Requires Discussion"]'::jsonb),
('template-filament-profile-review', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Feedback on visuals or layout.', 40, false, NULL),
('template-filament-profile-review', 'order_instruction', 'Order / Structure Changes', 'Long Text', 'E.g. move this section elsewhere in the document.', 45, false, NULL),
('template-filament-profile-review', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 50, false, NULL)
ON CONFLICT DO NOTHING;

-- 3. Filament Slides Review sections
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-filament-slides-review', 'presentation_section', 'Presentation Section', 'Select', 'Which major section of the deck are you reviewing?', 5, true, '[
  "Section 1 — Opening & Executive Storyline (Slides 1–2)",
  "Section 2 — Productivity & Mining Challenge (Slides 3–11)",
  "Section 3 — Filament Company & Strategic Positioning (Slides 12–17)",
  "Section 4 — Theory of Constraints & Improvement Methodology (Slides 18–25)",
  "Section 5 — Lean Transformation & Sustainment (Slides 26–31)",
  "Section 6 — Proof, Leadership & Enterprise Capability (Slides 32–39)",
  "Section 7 — Clients, Opportunity & Way Forward (Slides 40–43)"
]'::jsonb),
('template-filament-slides-review', 'slide', 'Slide', 'Select', 'Which specific slide?', 10, true, '[
  "1. Productivity Transformation, One Person at a Time",
  "2. Executive Storyline / Presentation Overview",
  "3. Why Productivity Transformation?",
  "4. Employer Problem-Solving Dilemma",
  "5. Highly Interdependent Mining System",
  "6. VUCA, Governance & MHSA Pressure",
  "7. Resource Management & The Goal",
  "8. Mining as ROI",
  "9. Linear Mining Process Logic",
  "10. Day in the Life of an Employer",
  "11. Transactional vs Transformational Improvement",
  "12. Filament at a Glance",
  "13. Vision, Mission & Values",
  "14. Strategy & Quality Policy",
  "15. What Filament Does",
  "16. Competitive Edge",
  "17. Business Model",
  "18. TOC Foundation",
  "19. Five Focusing Steps",
  "20. Balanced Flowline",
  "21. Unbalanced Flowline",
  "22. Blockage, Starvation & Buffer Logic",
  "23. Continuous Improvement Methodology",
  "24. POOGI Implementation Profile",
  "25. Unique Value Proposition & ROI",
  "26. Lean Transformation Architecture",
  "27. Lean Transformation Timeframe",
  "28. The Sustainment Problem",
  "29. Crossing the Chasm",
  "30. Graduate Capability & Sustainment",
  "31. Win-Win-Win Strategy",
  "32. Proof: Credentials & Results",
  "33. Endorsements as Source Evidence",
  "34. Monique Phillis Profile",
  "35. Vincent Seboni Profile",
  "36. Enterprise Transformation Bench",
  "37. Partner Capability Matrix",
  "38. Partner Profile Section",
  "39. Integrated Enterprise Transformation Capability",
  "40. Our Clients",
  "41. Proposed Engagement & Opportunity",
  "42. Quo Vadis: Way Forward",
  "43. Build Lasting Performance / Closing"
]'::jsonb),
('template-filament-slides-review', 'current_concern', 'Current Concern', 'Long Text', 'What is wrong or needs attention on this slide?', 15, false, NULL),
('template-filament-slides-review', 'remove_content', 'Remove This', 'Long Text', 'Specify exactly what to remove.', 20, false, NULL),
('template-filament-slides-review', 'replace_content', 'Replace with This Exact Wording', 'Exact Copy', 'Provide the exact replacement copy.', 30, false, NULL),
('template-filament-slides-review', 'copy_treatment', 'Copy Treatment', 'Select', 'How should Embark handle the copy?', 35, true, '["Use Exact Copy as Supplied", "Embark May Refine Grammar Only", "Embark May Professionally Rewrite for Approval", "Requires Discussion"]'::jsonb),
('template-filament-slides-review', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Feedback on visuals or layout.', 40, false, NULL),
('template-filament-slides-review', 'order_instruction', 'Order / Structure Changes', 'Long Text', 'E.g. move this slide earlier/later in the deck.', 45, false, NULL),
('template-filament-slides-review', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 50, false, NULL)
ON CONFLICT DO NOTHING;
