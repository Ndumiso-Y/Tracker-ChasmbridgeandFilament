const fs = require('fs');

const sql = `-- V4A Seed Minimum Template Library

-- 1. Insert Templates
INSERT INTO client_input_templates (id, title, description) VALUES
('template-presentation', 'Presentation Review', 'Review and provide slide-by-slide feedback for presentations.'),
('template-website', 'Website Requirements', 'Review webpage structure, copy, and visual direction.'),
('template-graphic', 'Flyer / Graphic', 'Provide feedback on flyers, social posts, or other graphic assets.'),
('template-social', 'Social Content', 'Review written copy and creative for social channels.'),
('template-testimonial', 'Testimonial', 'Gather and approve graduate/stakeholder testimonials with explicit permissions.'),
('template-technical', 'Technical Setup', 'Structured input for systems, profiles, and domains (GBP, Meta Pixel, SEO, etc.).'),
('template-general', 'General Request', 'General delivery input requirement.')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Sections for Presentation Review
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-presentation', 'slide_number', 'Slide Number(s)', 'Short Text', 'E.g., Slide 2, Slides 4-6, or All Slides', 10, true, NULL),
('template-presentation', 'remove_content', 'Remove this', 'Long Text', 'Specify exactly what to remove.', 20, false, NULL),
('template-presentation', 'replace_content', 'Replace with this exact wording', 'Exact Copy', 'Provide the exact replacement copy.', 30, false, NULL),
('template-presentation', 'copy_treatment', 'Copy Treatment', 'Select', 'How should Embark handle the copy?', 35, true, '["Use Exact Copy as Supplied", "Embark May Refine Grammar Only", "Embark May Professionally Rewrite for Approval", "Requires Discussion"]'::jsonb),
('template-presentation', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Feedback on visuals or layout.', 40, false, NULL),
('template-presentation', 'order_instruction', 'Order / Structure Changes', 'Long Text', 'E.g. Move Slide 8 before Slide 6.', 45, false, NULL),
('template-presentation', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 50, false, NULL)
ON CONFLICT DO NOTHING;

-- 3. Insert Sections for Website Feedback
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-website', 'page_url', 'Page / URL', 'Short Text', 'Which page are you reviewing?', 10, true, NULL),
('template-website', 'page_objective', 'Website/Page Objective', 'Long Text', 'Goal of this page.', 15, true, NULL),
('template-website', 'required_inclusions', 'Sections / Content Structure', 'Long Text', 'Specify required sections.', 20, true, NULL),
('template-website', 'exact_copy', 'Exact Copy', 'Exact Copy', 'Exact wording to use.', 30, false, NULL),
('template-website', 'copy_treatment', 'Copy Treatment', 'Select', 'How should we treat the copy?', 40, true, '["Use Exact Copy as Supplied", "Embark May Refine Grammar Only", "Embark May Professionally Rewrite for Approval", "Requires Discussion"]'::jsonb),
('template-website', 'structure_changes', 'Order / Structure Changes', 'Long Text', 'Feedback on page layout/order.', 50, false, NULL),
('template-website', 'technical_reqs', 'Technical/Functionality Requirements', 'Long Text', 'Forms, integrations, etc.', 60, false, NULL),
('template-website', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 70, false, NULL)
ON CONFLICT DO NOTHING;

-- 4. Insert Sections for Graphic Review
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-graphic', 'graphic_reference', 'Graphic Reference', 'Short Text', 'Which graphic? (e.g. Instagram Post 1, Flyer Front)', 10, true, NULL),
('template-graphic', 'objective', 'Objective / Target Audience', 'Long Text', 'Goal of the flyer/graphic.', 15, true, NULL),
('template-graphic', 'exact_copy', 'Mandatory Exact Copy', 'Exact Copy', 'Provide exact copy to use.', 20, true, NULL),
('template-graphic', 'remove_content', 'Remove Instruction', 'Long Text', 'What to remove.', 30, false, NULL),
('template-graphic', 'cta', 'Call To Action (CTA)', 'Short Text', 'What should the user do?', 40, true, NULL),
('template-graphic', 'visual_direction', 'Image / Visual Direction', 'Long Text', 'Design notes.', 50, false, NULL),
('template-graphic', 'additional_comments', 'Additional Comments', 'Long Text', 'Any other instructions.', 60, false, NULL)
ON CONFLICT DO NOTHING;

-- 5. Insert Sections for Social Content
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-social', 'platform', 'Platform / Entity Context', 'Short Text', 'e.g. Instagram for Filament.', 10, true, NULL),
('template-social', 'objective', 'Content Objective / Pillar', 'Long Text', 'Goal of the post.', 20, true, NULL),
('template-social', 'factual_info', 'Factual / Source Information', 'Long Text', 'Facts we must include.', 30, true, NULL),
('template-social', 'exact_copy', 'Copy Feedback / Exact Wording', 'Exact Copy', 'Provide exact copy.', 40, false, NULL),
('template-social', 'copy_treatment', 'Rewrite / Copy Treatment', 'Select', 'How to handle the text.', 45, true, '["Use Exact Copy as Supplied", "Embark May Professionally Rewrite for Approval"]'::jsonb),
('template-social', 'creative_feedback', 'Creative / Image Feedback', 'Long Text', 'Feedback on visuals.', 50, false, NULL),
('template-social', 'cta', 'Call To Action (CTA)', 'Short Text', 'Link in bio, DM us, etc.', 60, false, NULL)
ON CONFLICT DO NOTHING;

-- 6. Insert Sections for General Request
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-general', 'general_instructions', 'Instructions / Feedback', 'Long Text', 'Please provide detailed instructions.', 10, true, NULL),
('template-general', 'exact_copy', 'Exact Wording (Optional)', 'Exact Copy', 'Any specific copy required.', 20, false, NULL)
ON CONFLICT DO NOTHING;

-- 7. Insert Sections for Testimonial
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-testimonial', 'testimonial_copy', 'Testimonial Copy', 'Long Text', 'The actual testimonial text.', 10, true, NULL),
('template-testimonial', 'grammar_refinement', 'Grammar Refinement Permission', 'Yes / No', 'Can Embark refine grammar?', 20, true, NULL),
('template-testimonial', 'name_permission', 'Name Usage Permission', 'Yes / No', 'Can we use the real name?', 30, true, NULL),
('template-testimonial', 'photo_permission', 'Photo Usage Permission', 'Yes / No', 'Can we use their photo?', 40, true, NULL),
('template-testimonial', 'story_permission', 'Story/Context Permission', 'Yes / No', 'Can we share their broader story?', 50, true, NULL),
('template-testimonial', 'client_review', 'Client Reviewed', 'Yes / No', 'Has the client reviewed this?', 60, true, NULL),
('template-testimonial', 'final_approval', 'Final Approval', 'Yes / No', 'Is this approved for publishing?', 70, true, NULL)
ON CONFLICT DO NOTHING;

-- 8. Insert Sections for Technical Setup
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required, controlled_options) VALUES
('template-technical', 'technical_domain', 'Technical Domain', 'Select', 'e.g. Meta Pixel, SEO, GBP, WhatsApp, Web Forms', 10, true, '["Google Business Profile", "Meta Pixel", "Basic SEO", "Deeper SEO", "WhatsApp Setup", "Web Form Integration", "AI Knowledge Base", "System Planning", "Other"]'::jsonb),
('template-technical', 'business_details', 'Business / Context Information', 'Long Text', 'Provide current URLs, addresses, or phone numbers.', 20, true, NULL),
('template-technical', 'admin_credentials', 'Access Method / Admin Invite', 'Long Text', 'Describe how Embark Digitals should be granted access, for example an admin invitation or approved access-sharing process. Do not enter passwords, OTPs, recovery codes, API secrets, or private keys.', 30, true, NULL),
('template-technical', 'delegation_choice', 'Delegation Choice', 'Select', 'Who will handle this?', 40, true, '["Embark Digitals Handles Technical Setup", "Client Provides Information, Embark Configures", "Client and Embark Co-manage", "Requires Discussion"]'::jsonb),
('template-technical', 'setup_checklist', 'Setup Requirements', 'Checklist', 'Specific technical requirements.', 50, false, '["Verify Domain Ownership", "Grant Admin Access", "Provide Billing Details if applicable", "Review Existing Setup"]'::jsonb)
ON CONFLICT DO NOTHING;
`;

fs.writeFileSync('supabase/seed_v4a_templates.sql', sql);
