import { supabase } from '../lib/supabase';

export const collaborationService = {
  // Profiles & Auth
  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('user_access_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // Ignore not found
    return data;
  },

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  async sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Templates
  async getTemplates() {
    const { data, error } = await supabase.from('client_input_templates').select('*');
    if (error) throw error;
    return data;
  },

  async getTemplateSections(templateId) {
    const { data, error } = await supabase
      .from('client_input_template_sections')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Requests
  async getRequests() {
    const { data, error } = await supabase
      .from('client_input_requests')
      .select(`
        *,
        client_input_templates ( title ),
        client_input_responses ( * ),
        client_input_comments ( * )
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createRequest(requestData) {
    const { data, error } = await supabase
      .from('client_input_requests')
      .insert(requestData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateRequest(id, updates) {
    const { data, error } = await supabase
      .from('client_input_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Responses
  async getResponses(requestId) {
    const { data, error } = await supabase
      .from('client_input_responses')
      .select('*')
      .eq('input_request_id', requestId);
    if (error) throw error;
    return data;
  },

  async upsertResponse(responseData) {
    const { data, error } = await supabase
      .from('client_input_responses')
      .upsert(responseData, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Revisions
  async freezeRevisions(requestId) {
    // This function assumes all responses for a request should be copied to revisions.
    // To ensure consistency, it gets all current responses.
    const responses = await this.getResponses(requestId);
    const { data: request } = await supabase.from('client_input_requests').select('revision_number').eq('id', requestId).single();
    
    const revisions = responses.map(r => ({
      response_id: r.id,
      revision_number: request.revision_number,
      content: r.content,
      changed_by_user_id: r.updated_by,
      is_current_confirmed: false // By default. Admin will confirm later.
    }));

    if (revisions.length === 0) return null;

    const { data, error } = await supabase
      .from('client_input_response_revisions')
      .insert(revisions)
      .select();
    
    if (error) throw error;
    return data;
  },

  // Checklists
  async getChecklistItems(requestId) {
    const { data, error } = await supabase
      .from('delivery_assurance_checklist_items')
      .select('*')
      .eq('input_request_id', requestId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  async upsertChecklistItem(itemData) {
    const { data, error } = await supabase
      .from('delivery_assurance_checklist_items')
      .upsert(itemData, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Support Tickets
  async getTickets() {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createTicket(ticketData) {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert(ticketData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTicket(id, updates) {
    const { data, error } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Reviews
  async getReviews() {
    const { data, error } = await supabase
      .from('weekly_delivery_reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getReviewFeedbackItems(reviewId) {
    const { data, error } = await supabase
      .from('weekly_review_feedback_items')
      .select('*')
      .eq('review_id', reviewId);
    if (error) throw error;
    return data;
  },

  async updateFeedbackItemDisposition(id, updates) {
    const { data, error } = await supabase
      .from('weekly_review_feedback_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
