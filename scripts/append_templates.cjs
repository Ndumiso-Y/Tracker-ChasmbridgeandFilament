const fs = require('fs');
const content = `
-- 7. Insert Sections for Social Content
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-social', 'platform', 'Platform (IG, FB, LinkedIn)', 'Short Text', 'Which platform is this for?', 10, true),
('template-social', 'copy_feedback', 'Copy Feedback', 'Long Text', 'Feedback on the text/caption.', 20, false),
('template-social', 'creative_feedback', 'Creative Feedback', 'Long Text', 'Feedback on the image/video.', 30, false),
('template-social', 'exact_copy', 'Replace with this exact wording', 'Exact Copy', 'If changing text, provide exact copy.', 40, false)
ON CONFLICT DO NOTHING;

-- 8. Insert Sections for Testimonial
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-testimonial', 'testimonial_copy', 'Testimonial Copy', 'Long Text', 'The actual testimonial text.', 10, true),
('template-testimonial', 'grammar_refinement', 'Grammar Refinement Permission', 'Yes / No', 'Can Embark refine grammar?', 20, true),
('template-testimonial', 'name_permission', 'Name Usage Permission', 'Yes / No', 'Can we use the real name?', 30, true),
('template-testimonial', 'photo_permission', 'Photo Usage Permission', 'Yes / No', 'Can we use their photo?', 40, true),
('template-testimonial', 'story_permission', 'Story/Context Permission', 'Yes / No', 'Can we share their broader story?', 50, true),
('template-testimonial', 'client_review', 'Client Reviewed', 'Yes / No', 'Has the client reviewed this?', 60, true),
('template-testimonial', 'final_approval', 'Final Approval', 'Yes / No', 'Is this approved for publishing?', 70, true)
ON CONFLICT DO NOTHING;

-- 9. Insert Sections for Technical Setup
INSERT INTO client_input_template_sections (template_id, section_key, section_label, section_type, help_text, sort_order, is_required) VALUES
('template-technical', 'technical_domain', 'Technical Domain', 'Select', 'e.g. Meta Pixel, SEO, GBP, WhatsApp, Web Forms', 10, true),
('template-technical', 'business_details', 'Business Details & Links', 'Long Text', 'Provide current URLs, addresses, or phone numbers.', 20, true),
('template-technical', 'admin_credentials', 'Admin Credentials / Access', 'Long Text', 'How will Embark get access? (Secure link/Invite)', 30, true),
('template-technical', 'delegation_choice', 'Delegation Choice', 'Select', 'Embark Full Setup / Client Co-manage / Client Setup', 40, true),
('template-technical', 'setup_checklist', 'Setup Requirements', 'Checklist', 'Specific technical requirements.', 50, false)
ON CONFLICT DO NOTHING;
`;
fs.appendFileSync('supabase/seed_v4a_templates.sql', content);
