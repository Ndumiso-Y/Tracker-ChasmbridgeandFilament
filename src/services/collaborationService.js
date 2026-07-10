import { supabase } from '../lib/supabase';

export const collaborationService = {
  async createInternalDeliveryItem(payload) {
    const { data, error } = await supabase
      .rpc('create_internal_delivery_item', {
        p_author_id: payload.authorId,
        p_title: payload.title,
        p_entity: payload.entity,
        p_phase: payload.phase,
        p_record_type: payload.recordType,
        p_category: payload.category,
        p_status: payload.status,
        p_priority: payload.priority,
        p_due_date: payload.dueDate,
        p_owner_label: payload.ownerLabel,
        p_next_action: payload.nextAction,
        p_client_input: payload.clientInput,
        p_delivery_context: payload.deliveryContext,
        p_scope_treatment: payload.scopeTreatment,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async createInternalSupportIssue(payload) {
    const { data, error } = await supabase
      .rpc('create_internal_support_issue', {
        p_author_id: payload.authorId,
        p_title: payload.title,
        p_entity: payload.entity,
        p_category: payload.category,
        p_issue_type: payload.issueType,
        p_linked_tracker_item_id: payload.linkedTrackerItemId,
        p_description: payload.description,
        p_expected_outcome: payload.expectedOutcome,
        p_client_reported_urgency: payload.clientReportedUrgency,
        p_evidence_url: payload.evidenceUrl,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async updateInternalSupportTicket(payload) {
    const { data, error } = await supabase
      .rpc('update_internal_support_ticket', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
        p_linked_tracker_item_id: payload.linkedTrackerItemId || null,
        p_title: payload.title,
        p_description: payload.description,
        p_client_reported_urgency: payload.clientReportedUrgency,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async markInternalSupportTicketResolved(payload) {
    const { data, error } = await supabase
      .rpc('mark_internal_support_ticket_resolved', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
        p_resolution_note: payload.resolutionNote || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async createInternalSupportTicketComment(payload) {
    const { data, error } = await supabase
      .rpc('create_internal_support_ticket_comment', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
        p_body: payload.body,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async createInternalClientInputRequest(payload) {
    const { data, error } = await supabase
      .rpc('create_internal_client_input_request', {
        p_author_id: payload.authorId,
        p_title: payload.title,
        p_entity: payload.entity,
        p_template_id: payload.templateId,
        // Assigned contributor is optional at creation — an empty selection
        // ("Unassigned") must be sent as null, not "", which would fail
        // Postgres uuid casting.
        p_assigned_contributor_user_id: payload.contributorUserId || null,
        p_primary_approver_author_id: payload.approverAuthorId,
        p_request_context: payload.contextNote,
        p_client_reported_urgency: payload.clientReportedUrgency,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async assignInternalClientInputContributor(payload) {
    const { data, error } = await supabase
      .rpc('assign_internal_client_input_contributor', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
        p_contributor_user_id: payload.contributorUserId || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Read-only helper backing the internal operator's Assign/Change
  // Contributor control and the Open Weekly Review contributor picker — see
  // get_internal_active_client_contributors() in
  // internal_operator_creation_workflow.sql for why this goes through a
  // narrow, Active-Editor-validated RPC rather than a direct table select.
  // Internal Active Editor: link or clear a tracker item on a client input
  // request. Uses the narrow link_internal_client_input_request_tracker_item
  // SECURITY DEFINER RPC — never a generic request update path.
  async linkInternalClientInputRequestTrackerItem(payload) {
    const { data, error } = await supabase
      .rpc('link_internal_client_input_request_tracker_item', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
        p_tracker_item_id: payload.trackerItemId || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Client Access provisioning (V4A.15) — authenticated admin only. The RPC
  // re-verifies is_admin() server-side, activates client_contributor access
  // for an exact email that has already signed in via Magic Link, and can
  // never create or modify an admin profile. Never granted to anon.
  async provisionClientContributor(payload) {
    const { data, error } = await supabase
      .rpc('provision_client_contributor', {
        p_email: payload.email,
        p_display_name: payload.displayName,
        p_entity_scope: payload.entityScope,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Admin-only reads/updates over user_access_profiles ride the existing
  // "Admin full access" RLS policy directly — no new server surface.
  async getClientAccessProfiles() {
    const { data, error } = await supabase
      .from('user_access_profiles')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async setClientAccessActive(userId, isActive) {
    const { data, error } = await supabase
      .from('user_access_profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Request edit (V4A.18): the narrow internal edit matching the ticket
  // edit contract — title/entity/urgency/source only, lifecycle-guarded,
  // provenance-commented server-side.
  async updateInternalClientInputRequest(payload) {
    const { data, error } = await supabase
      .rpc('update_internal_client_input_request', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
        p_title: payload.title,
        p_entity: payload.entity,
        p_client_reported_urgency: payload.clientReportedUrgency,
        p_requirement_source: payload.requirementSource || null,
        p_additional_context: payload.additionalContext || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Request retention (V4A.15): archive is the removal model for real
  // collaboration records (reversible, provenance-commented); permanent
  // delete exists ONLY for never-assigned Drafts via a status-guarded RPC.
  async archiveInternalClientInputRequest(payload) {
    const { data, error } = await supabase
      .rpc('archive_internal_client_input_request', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async unarchiveInternalClientInputRequest(payload) {
    const { data, error } = await supabase
      .rpc('unarchive_internal_client_input_request', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async deleteInternalDraftClientInputRequest(payload) {
    const { error } = await supabase
      .rpc('delete_internal_draft_client_input_request', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
      });
    if (error) throw error;
  },

  // Support ticket retention (V4A.16): removal authority is EMBARK ONLY —
  // enforced server-side (active editor AND organisation_label = 'Embark
  // Digitals'), never by UI hiding alone. Real tickets archive reversibly;
  // permanent delete exists only for New/Open tickets with zero history.
  async archiveInternalSupportTicket(payload) {
    const { data, error } = await supabase
      .rpc('archive_internal_support_ticket', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async unarchiveInternalSupportTicket(payload) {
    const { data, error } = await supabase
      .rpc('unarchive_internal_support_ticket', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async deleteInternalTestSupportTicket(payload) {
    const { error } = await supabase
      .rpc('delete_internal_test_support_ticket', {
        p_author_id: payload.authorId,
        p_ticket_id: payload.ticketId,
      });
    if (error) throw error;
  },

  // Weekly review retention (V4A.17) — same Embark-only server-enforced
  // model as tickets: archive real reviews reversibly; permanent delete only
  // for a never-submitted review with zero feedback.
  async archiveInternalWeeklyReview(payload) {
    const { data, error } = await supabase
      .rpc('archive_internal_weekly_review', {
        p_author_id: payload.authorId,
        p_review_id: payload.reviewId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async unarchiveInternalWeeklyReview(payload) {
    const { data, error } = await supabase
      .rpc('unarchive_internal_weekly_review', {
        p_author_id: payload.authorId,
        p_review_id: payload.reviewId,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async deleteInternalEmptyWeeklyReview(payload) {
    const { error } = await supabase
      .rpc('delete_internal_empty_weekly_review', {
        p_author_id: payload.authorId,
        p_review_id: payload.reviewId,
      });
    if (error) throw error;
  },

  async getInternalActiveClientContributors(authorId) {
    const { data, error } = await supabase
      .rpc('get_internal_active_client_contributors', { p_author_id: authorId });
    if (error) throw error;
    return data;
  },

  // Internal operator logs a client requirement communicated outside the
  // platform (WhatsApp/Email/Meeting/Phone Call/Other). Honest provenance:
  // request_origin = 'Internally Logged Client Requirement', never a faked
  // client identity.
  async logInternalClientRequirement(payload) {
    const { data, error } = await supabase
      .rpc('log_internal_client_requirement', {
        p_author_id: payload.authorId,
        p_title: payload.title,
        p_entity: payload.entity,
        p_template_id: payload.templateId,
        p_requirement_source: payload.requirementSource,
        p_client_reported_urgency: payload.clientReportedUrgency,
        p_contributor_user_id: payload.contributorUserId || null,
        p_request_context: payload.contextNote,
        p_guided_review: !!payload.guidedReview,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // The real internal register read path (V4A.10): the no-session Active
  // Editor cannot SELECT client_input_requests directly (anon RLS correctly
  // returns zero rows), so the register loads through this narrow,
  // Active-Editor-validated SECURITY DEFINER read — never an optimistic
  // React-state merge.
  async getInternalClientInputRequests(authorId) {
    const { data, error } = await supabase
      .rpc('get_internal_client_input_requests', { p_author_id: authorId });
    if (error) throw error;
    // Reshape flat joined linked-item fields into nested tracker_items object
    // matching the authenticated getRequests() shape for consistent rendering.
    return (data || []).map(r => ({
      ...r,
      tracker_items: r.linked_tracker_item_id ? {
        title: r.linked_tracker_item_title,
        phase: r.linked_tracker_item_phase,
        status: r.linked_tracker_item_status,
        entity: r.linked_tracker_item_entity,
      } : null,
    }));
  },

  async getInternalClientInputResponses(authorId, requestId) {
    const { data, error } = await supabase
      .rpc('get_internal_client_input_responses', { p_author_id: authorId, p_request_id: requestId });
    if (error) throw error;
    return data || [];
  },

  async getInternalClientInputComments(authorId, requestId) {
    const { data, error } = await supabase
      .rpc('get_internal_client_input_comments', { p_author_id: authorId, p_request_id: requestId });
    if (error) throw error;
    return data || [];
  },

  // Guided review entries — internal operator path (author-validated RPCs).
  async getInternalReviewEntries(authorId, requestId) {
    const { data, error } = await supabase
      .rpc('get_internal_client_input_review_entries', { p_author_id: authorId, p_request_id: requestId });
    if (error) throw error;
    return data || [];
  },

  async upsertInternalReviewEntry(payload) {
    const { data, error } = await supabase
      .rpc('upsert_internal_client_input_review_entry', {
        p_author_id: payload.authorId,
        p_request_id: payload.requestId,
        p_review_item_key: payload.reviewItemKey,
        p_review_item_type: payload.reviewItemType,
        p_review_item_number: payload.reviewItemNumber,
        p_review_item_title: payload.reviewItemTitle,
        p_review_group: payload.reviewGroup || null,
        p_review_status: payload.reviewStatus,
        p_current_concern: payload.currentConcern || null,
        p_remove_this: payload.removeThis || null,
        p_replacement_copy: payload.replacementCopy || null,
        p_copy_treatment: payload.copyTreatment || null,
        p_visual_direction: payload.visualDirection || null,
        p_structure_changes: payload.structureChanges || null,
        p_additional_comments: payload.additionalComments || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  async submitInternalClientInputReview(authorId, requestId) {
    const { data, error } = await supabase
      .rpc('submit_internal_client_input_review', { p_author_id: authorId, p_request_id: requestId });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Guided review entries — authenticated client contributor path
  // (RLS-owned direct reads/writes on client_input_review_entries).
  async getReviewEntries(requestId) {
    const { data, error } = await supabase
      .from('client_input_review_entries')
      .select('*')
      .eq('request_id', requestId)
      .order('review_item_number', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async upsertReviewEntry(entryData) {
    const { data, error } = await supabase
      .from('client_input_review_entries')
      .upsert({ ...entryData, updated_at: new Date().toISOString() }, { onConflict: 'request_id,review_item_key' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async openInternalWeeklyReview(payload) {
    const { data, error } = await supabase
      .rpc('open_internal_weekly_review', {
        p_author_id: payload.authorId,
        p_entity: payload.entity,
        p_review_period_start: payload.periodStart,
        p_review_period_end: payload.periodEnd,
        p_assigned_contributor_user_id: payload.contributorUserId || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Atomic internal open path: creates the review AND links tracker items in
  // one SECURITY DEFINER function invocation, preventing partial linkage and
  // providing a protected write path for the no-session Active Editor persona.
  // Use this for the internal operator open flow. The plain openInternalWeeklyReview
  // is retained for callers that do not supply work-preview items.
  async openInternalWeeklyReviewWithItems(payload) {
    const { data, error } = await supabase
      .rpc('open_internal_weekly_review_with_items', {
        p_author_id: payload.authorId,
        p_entity: payload.entity,
        p_review_period_start: payload.periodStart,
        p_review_period_end: payload.periodEnd,
        p_assigned_contributor_user_id: payload.contributorUserId || null,
        p_tracker_item_ids: payload.trackerItemIds || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },



  async assignInternalWeeklyReviewContributor(payload) {
    const { data, error } = await supabase
      .rpc('assign_internal_weekly_review_contributor', {
        p_author_id: payload.authorId,
        p_review_id: payload.reviewId,
        p_contributor_user_id: payload.contributorUserId || null,
      });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  // Profiles & Auth
  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('user_access_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Fallback for existing Ndumiso / Embark admin role in user_roles
    const { data: legacyRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
      
    if (legacyRole?.role === 'admin') {
      return {
        ...(data || {}),
        role: 'admin',
        is_active: true,
        is_legacy_admin: true
      };
    }

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  async sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Active operational identities, used to populate admin orchestration pickers
  // (Primary Approver, request-authoring attribution). Same table/RLS the
  // existing Active Editor selector already reads from.
  async getActiveUpdateAuthors() {
    const { data, error } = await supabase
      .from('update_authors')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Approved, active client-contributor profiles available to assign a
  // request/ticket to. Does not create or promote profiles.
  async getActiveClientContributors() {
    const { data, error } = await supabase
      .from('user_access_profiles')
      .select('user_id, display_name, entity_scope')
      .eq('role', 'client_contributor')
      .eq('is_active', true);
    if (error) throw error;
    return data;
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

  // Requests (authenticated admin/client persona — RLS-owned direct read;
  // the no-session internal operator uses getInternalClientInputRequests).
  // Guided-review progress is not nested here deliberately: the entries
  // table ships in a pending migration, and nesting it would break this
  // existing live read until that migration runs. Progress comes from the
  // internal register RPC (counts) and the guided detail loader instead.
  async getRequests() {
    const { data, error } = await supabase
      .from('client_input_requests')
      .select(`
        *,
        client_input_templates ( title ),
        client_input_responses ( * ),
        client_input_comments ( * ),
        tracker_items ( title, phase, status, entity )
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

  // Comments (used for optional request context/purpose notes)
  async addRequestComment(inputRequestId, commentData) {
    const { data, error } = await supabase
      .from('client_input_comments')
      .insert({ input_request_id: inputRequestId, ...commentData })
      .select()
      .single();
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

  // Tracker item linkage (shared by Support Issues and Weekly Review — the
  // master delivery register, read/queried directly, never duplicated).
  // Phase 1 and Separate Scope are excluded by the Phase 2/3 filter itself.
  // When a review period is supplied, the list is further narrowed to work
  // actually relevant to that week — anything still active (not Done, so
  // ongoing work always stays visible) plus anything due or completed
  // within the period — rather than every Phase 2/3 item in the register.
  async getCurrentDeliveryTrackerItems(entity, periodStart, periodEnd) {
    const { data, error } = await supabase
      .from('tracker_items')
      .select('id, title, phase, status, entity, due_date, completed_at, updated_at')
      .in('phase', ['Phase 2', 'Phase 3'])
      .order('title', { ascending: true });
    if (error) throw error;
    let items = entity ? data.filter(t => t.entity === 'Both' || t.entity === entity) : data;
    if (periodStart && periodEnd) {
      const inPeriod = (d) => d && d.slice(0, 10) >= periodStart && d.slice(0, 10) <= periodEnd;
      items = items.filter(t => t.status !== 'Done' || inPeriod(t.due_date) || inPeriod(t.completed_at) || inPeriod(t.updated_at));
    }
    return items;
  },

  async searchTrackerItemsForLinking() {
    const { data, error } = await supabase
      .from('tracker_items')
      .select('id, title, phase, status')
      .neq('phase', 'Separate Scope')
      .order('title', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Creates a new tracker_items row (the single delivery spine — never a
  // duplicate task store) as a follow-up action from a support issue, using
  // the "task-" id prefix so it is correctly recognised by the existing
  // App.jsx category mapping and immediately visible in the Task Command
  // Center / Delivery Board / Dashboard.
  async createFollowUpTask(taskData) {
    const id = `task-followup-${Date.now()}`;
    const { data, error } = await supabase
      .from('tracker_items')
      .insert({
        id,
        status: 'Not Started',
        record_type: 'Task',
        delivery_context: 'Package 3 Review',
        owner_label: 'Embark Digitals',
        ...taskData,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Tracker item audit trail — used to preserve provenance when a
  // collaboration action (e.g. a follow-up task created from a support
  // issue) creates or affects a tracker_items row, matching the existing
  // Notes & History audit model.
  async createTrackerItemNote(noteData) {
    const { data, error } = await supabase
      .from('tracker_item_notes')
      .insert(noteData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Weekly Review <-> tracker item linkage (many-to-many junction table)
  async getReviewTrackerItems(reviewId) {
    const { data, error } = await supabase
      .from('weekly_review_tracker_items')
      .select('id, tracker_item_id, tracker_items ( title )')
      .eq('review_id', reviewId);
    if (error) throw error;
    return data;
  },

  async linkReviewTrackerItem(reviewId, trackerItemId) {
    const { data, error } = await supabase
      .from('weekly_review_tracker_items')
      .insert({ review_id: reviewId, tracker_item_id: trackerItemId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async unlinkReviewTrackerItem(reviewId, trackerItemId) {
    const { error } = await supabase
      .from('weekly_review_tracker_items')
      .delete()
      .eq('review_id', reviewId)
      .eq('tracker_item_id', trackerItemId);
    if (error) throw error;
  },

  // Internal operator collaboration reads (V4A.11): the same disappearing-
  // record defect class fixed for Client Input in V4A.10 also applied to
  // the Support and Weekly Review registers — direct anon SELECTs return
  // zero rows for the no-session Active Editor, so created records vanished
  // on navigation. These four narrow author-validated RPCs are the real
  // read path for that persona; authenticated admin/client personas keep
  // their existing RLS-owned direct reads below.
  async getInternalSupportTickets(authorId) {
    const { data, error } = await supabase
      .rpc('get_internal_support_tickets', { p_author_id: authorId });
    if (error) throw error;
    // Reshape the flat joined title to the nested shape the register renders.
    return (data || []).map(t => ({ ...t, tracker_items: t.linked_tracker_item_title ? { title: t.linked_tracker_item_title } : null }));
  },

  async getInternalWeeklyReviews(authorId) {
    const { data, error } = await supabase
      .rpc('get_internal_weekly_reviews', { p_author_id: authorId });
    if (error) throw error;
    return data || [];
  },

  async getInternalWeeklyReviewFeedback(authorId, reviewId) {
    const { data, error } = await supabase
      .rpc('get_internal_weekly_review_feedback', { p_author_id: authorId, p_review_id: reviewId });
    if (error) throw error;
    return data || [];
  },

  async getInternalWeeklyReviewTrackerItems(authorId, reviewId) {
    const { data, error } = await supabase
      .rpc('get_internal_weekly_review_tracker_items', { p_author_id: authorId, p_review_id: reviewId });
    if (error) throw error;
    return (data || []).map(li => ({ ...li, tracker_items: li.tracker_item_title ? { title: li.tracker_item_title } : null }));
  },

  async getInternalSupportTicketComments(authorId, ticketId) {
    const { data, error } = await supabase
      .rpc('get_internal_support_ticket_comments', { p_author_id: authorId, p_ticket_id: ticketId });
    if (error) throw error;
    return data || [];
  },

  // Support Tickets
  async getTickets() {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*, tracker_items ( title )')
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

  async getSupportTicketComments(ticketId) {
    const { data, error } = await supabase
      .from('support_ticket_comments')
      .select('*, update_authors (display_name), user_access_profiles (display_name)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(c => ({
      ...c,
      author_display_name: c.update_authors?.display_name,
      user_display_name: c.user_access_profiles?.display_name,
    }));
  },

  async addSupportTicketComment(payload) {
    const { data, error } = await supabase
      .from('support_ticket_comments')
      .insert(payload)
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

  async createReview(reviewData) {
    const { data, error } = await supabase
      .from('weekly_delivery_reviews')
      .insert(reviewData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateReview(id, updates) {
    const { data, error } = await supabase
      .from('weekly_delivery_reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
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
