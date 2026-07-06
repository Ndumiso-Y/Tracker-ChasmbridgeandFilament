-- V4A Seed Minimum Template Library

-- 1. Insert Templates
INSERT INTO client_input_templates (id, title, description) VALUES
('template-presentation', 'Presentation Review', 'Review and provide slide-by-slide feedback for presentations.'),
('template-website', 'Website Feedback', 'Review webpage structure, copy, and visual direction.'),
('template-graphic', 'Graphic Review', 'Provide feedback on flyers, social posts, or other graphic assets.'),
('template-content', 'Content Review', 'Review written copy, articles, or testimonials.'),
('template-general', 'General Request', 'General delivery input requirement.')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Sections for Presentation Review
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-presentation', 'slide_number', 'Slide Number(s)', 'Short Text', 'E.g., Slide 2, Slides 4-6, or All Slides', 10, true),
('template-presentation', 'remove_content', 'Remove this', 'Long Text', 'Specify exactly what to remove.', 20, false),
('template-presentation', 'replace_content', 'Replace with this exact wording', 'Exact Copy', 'Provide the exact replacement copy.', 30, false),
('template-presentation', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Feedback on visuals or layout.', 40, false),
('template-presentation', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 50, false)
ON CONFLICT DO NOTHING;

-- 3. Insert Sections for Website Feedback
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-website', 'page_url', 'Page / URL', 'Short Text', 'Which page are you reviewing?', 10, true),
('template-website', 'required_inclusions', 'Content that must be included', 'Long Text', 'Specify what must be added.', 20, false),
('template-website', 'exact_copy', 'Do not rewrite this copy', 'Exact Copy', 'Exact wording to use.', 30, false),
('template-website', 'embark_rewrite', 'Embark may rewrite', 'Long Text', 'General thoughts Embark can refine.', 40, false),
('template-website', 'structure_changes', 'Order / Structure Changes', 'Long Text', 'Feedback on page layout.', 50, false)
ON CONFLICT DO NOTHING;

-- 4. Insert Sections for Graphic Review
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-graphic', 'graphic_reference', 'Graphic Reference', 'Short Text', 'Which graphic? (e.g. Instagram Post 1, Flyer Front)', 10, true),
('template-graphic', 'what_to_change', 'What do you want changed?', 'Long Text', 'Overall feedback.', 20, true),
('template-graphic', 'exact_copy', 'Replace with this exact wording', 'Exact Copy', 'If changing text, provide exact copy.', 30, false)
ON CONFLICT DO NOTHING;

-- 5. Insert Sections for Content Review
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-content', 'content_reference', 'Content Reference', 'Short Text', 'Which article or section?', 10, true),
('template-content', 'exact_copy', 'Do not rewrite this copy', 'Exact Copy', 'Must-have exact wording.', 20, false),
('template-content', 'embark_rewrite', 'Embark may rewrite', 'Long Text', 'General tone/direction adjustments.', 30, false)
ON CONFLICT DO NOTHING;

-- 6. Insert Sections for General Request
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-general', 'general_instructions', 'Instructions / Feedback', 'Long Text', 'Please provide detailed instructions.', 10, true),
('template-general', 'exact_copy', 'Exact Wording (Optional)', 'Exact Copy', 'Any specific copy required.', 20, false)
ON CONFLICT DO NOTHING;
