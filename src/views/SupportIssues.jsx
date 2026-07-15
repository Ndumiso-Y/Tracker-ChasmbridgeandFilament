import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { ShieldCheck, CheckCircle, Clock, ChevronRight, Plus, X, Link2, ExternalLink, Send, Edit, ChevronDown } from 'lucide-react';
import { cx } from '../utils/cx';
import { isMoreThanTwoBusinessDaysOld } from '../utils/businessDays';
import { PROGRAMME_PHASES, TICKET_URGENCY, PROGRAMME_ENTITIES } from '../data/programmeContext';
import { ticketResponsibility } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { explainDbError } from '../utils/dbErrors';
import CopyLinkButton from '../components/CopyLinkButton';
import { buildSupportIssuePath, buildSupportIssueUrl } from '../utils/trackerRoutes';

const URGENCY_BADGE = {
  // Live DB values (delivery_assurance_operational_fields.sql CHECK constraint):
  'Normal': 'bg-slate-100 text-slate-600 border-slate-200',
  'Time Sensitive': 'bg-amber-50 text-amber-700 border-amber-200',
  'Urgent': 'bg-red-50 text-red-700 border-red-200',
  // Legacy display fallbacks for pre-constraint rows:
  'Standard (3-5 days)': 'bg-slate-100 text-slate-600 border-slate-200',
  'High (1-2 days)': 'bg-amber-50 text-amber-700 border-amber-200',
  'Critical (Blocker)': 'bg-red-50 text-red-700 border-red-200',
};

// Resolved display mapping: physical DB status → visible product language.
// Never mutates physical historical statuses.
const TICKET_STATUS_DISPLAY = {
  'New': 'Open',
  'Open': 'Open',
  'Resolved': 'Resolved — Awaiting Client Confirmation',
  'Closed': 'Closed',
};
function displayTicketStatus(status) {
  return TICKET_STATUS_DISPLAY[status] || status;
}

const emptyTicketForm = (defaultEntity) => ({
  title: '', entity: defaultEntity, phase: 'Phase 1', topicTaskId: '',
  description: '', expectedOutcome: '', clientReportedUrgency: 'Normal', evidenceUrl: '',
});

export default function SupportIssues({ selectedAuthorId = "", authors = [], onSelectAuthor, targetRecordId = null, onRecordTargetConsumed = null }) {
  const { profile, isAdmin, isClient } = useAuth();
  const isInternalOperator = !isClient;
  const canCreateSupportIssue = isClient || isInternalOperator;
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [targetError, setTargetError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [needsAuthorSelection, setNeedsAuthorSelection] = useState(false);

  // Inline Active Editor picker state (Reporting As / Change)
  const [authorPickerOpen, setAuthorPickerOpen] = useState(false);
  const authorPickerRef = useRef(null);

  // Comments State
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  // Comment truth (V4A.16): errors surface INSIDE the thread sidebar, next
  // to the composer — never in a different column. "No comments yet" is only
  // shown when comments genuinely loaded empty; the internal persona without
  // an Active Editor gets an explicit unavailable state instead.
  const [commentError, setCommentError] = useState(null);
  const [commentsUnavailable, setCommentsUnavailable] = useState(false);

  // Retention (V4A.16): archived tickets leave the default register;
  // internal users can reveal them. Removal is Embark-only.
  const [showArchivedTickets, setShowArchivedTickets] = useState(false);
  const [retentionBusy, setRetentionBusy] = useState(false);
  // Inline comment moderation: edit is author-only, delete author-or-Embark
  // (mirrors the server rules in support_ticket_comment_moderation.sql).
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const isEmbarkEditor = !!authors.find(a => a.id === selectedAuthorId && a.organisation_label === 'Embark Digitals');

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [trackerItems, setTrackerItems] = useState([]);
  const [newTicketForm, setNewTicketForm] = useState(emptyTicketForm(profile?.entity_scope || 'Both'));

  useEffect(() => {
    loadTickets();
    // selectedAuthorId is a real dependency: the no-session internal
    // operator's register loads through the author-validated RPC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, selectedAuthorId]);

  useEffect(() => {
    if (selectedTicket) {
      document.title = `Support - ${selectedTicket.title || 'Issue'}`;
    }
  }, [selectedTicket]);

  // Persona-correct read path (V4A.11)
  const fetchRegister = async () => {
    if (profile) {
      const data = await collaborationService.getTickets();
      return data || [];
    }
    if (selectedAuthorId) {
      return await collaborationService.getInternalSupportTickets(selectedAuthorId);
    }
    return null; // no identity yet
  };

  const loadTickets = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchRegister();
      setTickets(rows || []);
      setNeedsAuthorSelection(rows === null);
    } catch (err) {
      console.error(err);
      setTickets([]);
      setLoadError('Unable to load support issues. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (ticketId) => {
    setLoadingComments(true);
    setCommentError(null);
    setCommentsUnavailable(false);
    try {
      if (isInternalOperator) {
        if (selectedAuthorId) {
          const data = await collaborationService.getInternalSupportTicketComments(selectedAuthorId, ticketId);
          setComments(data);
        } else {
          // Honest state: without an Active Editor the internal persona
          // cannot load the thread — say so instead of "No comments yet".
          setComments([]);
          setCommentsUnavailable(true);
        }
      } else {
        const data = await collaborationService.getSupportTicketComments(ticketId);
        setComments(data);
      }
    } catch (err) {
      console.error('Failed to load comments', err);
      setCommentError(explainDbError(err, 'support comment read'));
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAction = async (statusUpdate) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await collaborationService.updateTicket(selectedTicket.id, statusUpdate);
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      await loadTickets();
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Unable to update this issue. The change was not saved.');
    } finally {
      setActionLoading(false);
    }
  };

  // Persona-correct resolution (V4A.15): the internal operator (Active
  // Editor selected) resolves through the narrow author-validated RPC; an
  // authenticated admin without an Active Editor falls back to the direct
  // admin RLS path. A client never reaches this handler.
  const handleMarkResolved = async () => {
    if (!selectedAuthorId && !isAdmin) {
      setActionError('Select an Active Editor in the sidebar to mark this ticket resolved.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      if (selectedAuthorId) {
        const updated = await collaborationService.markInternalSupportTicketResolved({
          authorId: selectedAuthorId,
          ticketId: selectedTicket.id,
          resolutionNote: null
        });
        setSelectedTicket(prev => ({ ...prev, ...updated }));
      } else {
        await handleAction({ status: 'Resolved', resolution_proposed_at: new Date().toISOString() });
      }
      await loadTickets();
      await loadComments(selectedTicket.id); // Reload comments to see resolution note
    } catch (err) {
      console.error(err);
      // Known live defect (V4A.17): the executed support workflow shipped a
      // resolve RPC that its own protect trigger blocks. The corrected pair
      // ships in the pending retention migration — say so honestly.
      const raw = err.message || 'Failed to mark resolved.';
      setActionError(
        /resolution_proposed_at directly|only transition a Resolved ticket/i.test(raw)
          ? 'Marking resolved is blocked by a live support ticket contract mismatch. Please ask Embark Digitals to verify the production setup, then try again.'
          : raw
      );
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateModal = async () => {
    setCreateError(null);
    setNewTicketForm(emptyTicketForm(profile?.entity_scope || 'Both'));
    setShowCreateModal(true);
    try {
      // Load all items to filter by phase client-side, or use searchTrackerItemsForLinking
      // assuming it returns all active items for linking.
      const items = await collaborationService.searchTrackerItemsForLinking();
      setTrackerItems(items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicketForm.title.trim() || !newTicketForm.description.trim()) {
      setCreateError('Title and description are required.');
      return;
    }
    if (isInternalOperator && !selectedAuthorId) {
      setCreateError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    setCreating(true);
    setCreateError(null);

    // Derive category/issueType based on topic
    let derivedCategory = 'Other';
    const isTaskLinked = !!newTicketForm.topicTaskId;
    const derivedIssueType = isTaskLinked ? 'Task-Linked Issue' : 'Standalone Issue';
    if (isTaskLinked) {
      const task = trackerItems.find(t => t.id === newTicketForm.topicTaskId);
      if (task) derivedCategory = task.category || 'Other';
    }

    try {
      let created;
      if (isInternalOperator) {
        created = await collaborationService.createInternalSupportIssue({
          authorId: selectedAuthorId,
          title: newTicketForm.title.trim(),
          entity: newTicketForm.entity,
          category: derivedCategory,
          issueType: derivedIssueType,
          linkedTrackerItemId: newTicketForm.topicTaskId || null,
          description: newTicketForm.description.trim(),
          expectedOutcome: newTicketForm.expectedOutcome.trim() || null,
          clientReportedUrgency: newTicketForm.clientReportedUrgency,
          evidenceUrl: newTicketForm.evidenceUrl.trim() || null,
        });
      } else {
        created = await collaborationService.createTicket({
          id: `ticket-${Date.now()}`,
          title: newTicketForm.title.trim(),
          entity: newTicketForm.entity,
          category: derivedCategory,
          issue_type: derivedIssueType,
          linked_tracker_item_id: newTicketForm.topicTaskId || null,
          description: newTicketForm.description.trim(),
          expected_outcome: newTicketForm.expectedOutcome.trim() || null,
          client_reported_urgency: newTicketForm.clientReportedUrgency,
          evidence_url: newTicketForm.evidenceUrl.trim() || null,
          reported_by_user_id: profile?.user_id || null,
          status: 'New',
        });
      }
      setShowCreateModal(false);
      try {
        const rows = await fetchRegister();
        if (created && rows !== null && !rows.some(t => t.id === created.id)) {
          setTickets([created, ...rows]);
        } else {
          setTickets(rows || (created ? [created] : []));
        }
      } catch (reloadErr) {
        console.error(reloadErr);
        if (created) setTickets(prev => (prev.some(t => t.id === created.id) ? prev : [created, ...prev]));
      }
    } catch (err) {
      console.error(err);
      setCreateError(err.message || 'Failed to create support issue.');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectTicket = async (ticket, options = {}) => {
    if (!options.preserveHash) window.location.hash = buildSupportIssuePath(ticket.id);
    setTargetError(null);
    setSelectedTicket(ticket);
    setIsEditing(false);
    setActionError(null);
    setCommentBody('');

    await loadComments(ticket.id);

    if (!trackerItems.length) {
      try {
        const items = await collaborationService.searchTrackerItemsForLinking();
        setTrackerItems(items || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSaveEdit = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      let updated;
      if (isInternalOperator) {
        updated = await collaborationService.updateInternalSupportTicket({
          authorId: selectedAuthorId,
          ticketId: selectedTicket.id,
          linkedTrackerItemId: editForm.topicTaskId || null,
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          clientReportedUrgency: editForm.clientReportedUrgency,
        });
      } else {
        updated = await collaborationService.updateTicket(selectedTicket.id, {
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          client_reported_urgency: editForm.clientReportedUrgency,
          linked_tracker_item_id: editForm.topicTaskId || null,
        });
      }
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      setIsEditing(false);
      await loadTickets();
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Failed to save edits.');
    } finally {
      setActionLoading(false);
    }
  };

  // Comment posting (V4A.16): errors render in the thread sidebar next to
  // the composer (commentError), never in another column; the composer only
  // clears after a confirmed write; the thread always canonically reloads.
  const handlePostComment = async () => {
    if (!commentBody.trim()) return;
    if (isInternalOperator && !selectedAuthorId) {
      setCommentError('Select an Active Editor in the sidebar to post comments.');
      return;
    }
    setActionLoading(true);
    setCommentError(null);
    try {
      if (isInternalOperator) {
        await collaborationService.createInternalSupportTicketComment({
          authorId: selectedAuthorId,
          ticketId: selectedTicket.id,
          body: commentBody.trim()
        });
      } else {
        await collaborationService.addSupportTicketComment({
          ticket_id: selectedTicket.id,
          body: commentBody.trim(),
          created_by_user_id: profile?.user_id || null
        });
      }
      setCommentBody('');
      await loadComments(selectedTicket.id);
    } catch (err) {
      console.error(err);
      setCommentError(err.message || 'Your comment could not be posted. It has not been saved — please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Comment moderation — server re-verifies authority (author-only edit,
  // author-or-Embark delete, plain comments only).
  const handleSaveCommentEdit = async () => {
    if (!editingCommentBody.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      await collaborationService.updateInternalSupportTicketComment(
        selectedAuthorId, editingCommentId, editingCommentBody.trim()
      );
      setEditingCommentId(null);
      setEditingCommentBody('');
      await loadComments(selectedTicket.id);
    } catch (err) {
      console.error(err);
      setCommentError(explainDbError(err, 'support comment moderation'));
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (comment) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      await collaborationService.deleteInternalSupportTicketComment(selectedAuthorId, comment.id);
      if (editingCommentId === comment.id) setEditingCommentId(null);
      await loadComments(selectedTicket.id);
    } catch (err) {
      console.error(err);
      setCommentError(explainDbError(err, 'support comment moderation'));
    } finally {
      setCommentBusy(false);
    }
  };

  // Retention actions (V4A.16) — Embark-only; server re-verifies authority.
  const handleArchiveTicketToggle = async (ticket, archive) => {
    setRetentionBusy(true);
    setActionError(null);
    try {
      if (archive) {
        await collaborationService.archiveInternalSupportTicket({ authorId: selectedAuthorId, ticketId: ticket.id });
      } else {
        await collaborationService.unarchiveInternalSupportTicket({ authorId: selectedAuthorId, ticketId: ticket.id });
      }
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      console.error(err);
      setActionError(explainDbError(err, 'support ticket retention'));
    } finally {
      setRetentionBusy(false);
    }
  };

  const handleDeleteTestTicket = async (ticket) => {
    if (!window.confirm(`Permanently delete the ticket "${ticket.title}"? Only a New/Open ticket with no conversation can be deleted.`)) return;
    setRetentionBusy(true);
    setActionError(null);
    try {
      await collaborationService.deleteInternalTestSupportTicket({ authorId: selectedAuthorId, ticketId: ticket.id });
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      console.error(err);
      setActionError(explainDbError(err, 'support ticket retention'));
    } finally {
      setRetentionBusy(false);
    }
  };

  // The retired issue→delivery disposition micro-workflow (link existing /
  // create follow-up / no task required) was removed with the simplified
  // ticket intake: linking now happens through the ticket's own edit form
  // (Related Task Topic), and follow-up tasks are created in the Task
  // Command Center. The createFollowUpTask service capability is retained.

  // Direct record navigation (V4A.14): consume a targeted ticket id once the
  // persona-correct register has loaded — find the real loaded row, open its
  // detail (which loads the conversation), then clear the consumed target.
  useEffect(() => {
    if (!targetRecordId || loading) return;
    if (needsAuthorSelection) return;
    const found = tickets.find(t => t.id === targetRecordId);
    if (found) {
      handleSelectTicket(found, { preserveHash: true });
      if (onRecordTargetConsumed) onRecordTargetConsumed();
    } else if (tickets.length > 0) {
      setTargetError('This item could not be found.');
      setSelectedTicket(null);
      if (onRecordTargetConsumed) onRecordTargetConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRecordId, loading, needsAuthorSelection, tickets]);

  const isStale = (ticket) => {
    if (['Closed'].includes(ticket.status)) return false;
    return isMoreThanTwoBusinessDaysOld(ticket.updated_at);
  };

  const isEmbarkDelay = (ticket) => {
    if (!isStale(ticket)) return false;
    if (['Waiting on Client', 'Awaiting Client Confirmation', 'Waiting on Third Party', 'Resolved'].includes(ticket.status)) return false;
    return true;
  };

  if (loading && !selectedTicket) {
    return <div className="p-8 text-slate-500">Loading support issues...</div>;
  }

  const phaseFilteredTasksCreate = trackerItems.filter(t => t.phase === newTicketForm.phase);

  if (selectedTicket) {
    const linkedTitle = selectedTicket.tracker_items?.title;
    const isClosed = selectedTicket.status === 'Closed';
    const isResolved = selectedTicket.status === 'Resolved';
    const phaseFilteredTasksEdit = editForm ? trackerItems.filter(t => t.phase === editForm.phase) : [];

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <button
            onClick={() => {
              setSelectedTicket(null);
              window.location.hash = '/support';
            }}
            className="text-navy hover:text-gold text-sm font-bold mb-6 flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Tickets
          </button>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-200 bg-slate-50/60">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-navy mb-2">{selectedTicket.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <ResponsibilityBadge value={ticketResponsibility(selectedTicket)} />
                    <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedTicket.category}</span>
                    <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedTicket.entity}</span>
                    <span className={cx(
                      "px-2.5 py-1 rounded-full font-medium border",
                      isResolved ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      isClosed ? "bg-slate-100 text-slate-600 border-slate-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {displayTicketStatus(selectedTicket.status)}
                    </span>
                    {selectedTicket.client_reported_urgency && (
                      <span className={cx("px-2.5 py-1 rounded-full font-medium border", URGENCY_BADGE[selectedTicket.client_reported_urgency] || URGENCY_BADGE['Normal'])}>
                        Urgency: {selectedTicket.client_reported_urgency}
                      </span>
                    )}
                  </div>
                </div>
                <CopyLinkButton getUrl={() => buildSupportIssueUrl(selectedTicket.id)} label="Copy Support Issue Link" />
                {!isClosed && !isEditing && (
                  <button
                    onClick={() => {
                      setEditForm({
                        title: selectedTicket.title,
                        description: selectedTicket.description,
                        clientReportedUrgency: selectedTicket.client_reported_urgency,
                        topicTaskId: selectedTicket.linked_tracker_item_id || '',
                        phase: trackerItems.find(t => t.id === selectedTicket.linked_tracker_item_id)?.phase || 'Phase 1'
                      });
                      setIsEditing(true);
                    }}
                    className="p-2 text-slate-400 hover:text-navy hover:bg-slate-200 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-navy mb-1.5">Issue Title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={e => setEditForm(prev => ({...prev, title: e.target.value}))}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-navy mb-1.5">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({...prev, description: e.target.value}))}
                      rows={4}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Phase Filter</label>
                      <select
                        value={editForm.phase}
                        onChange={(e) => setEditForm(prev => ({ ...prev, phase: e.target.value, topicTaskId: '' }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                      >
                        {PROGRAMME_PHASES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-navy mb-1.5">Related Task Topic</label>
                      <select
                        value={editForm.topicTaskId}
                        onChange={(e) => setEditForm(prev => ({ ...prev, topicTaskId: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                      >
                        <option value="">General Phase Query (No Task)</option>
                        {phaseFilteredTasksEdit.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                    <select
                      value={editForm.clientReportedUrgency}
                      onChange={e => setEditForm(prev => ({...prev, clientReportedUrgency: e.target.value}))}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                    >
                      {TICKET_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={actionLoading} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg">Save Changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">Description</h3>
                    <div className="bg-slate-50 rounded-lg p-4 text-slate-700 border border-slate-200 whitespace-pre-wrap">
                      {selectedTicket.description}
                    </div>
                  </div>

                  {selectedTicket.expected_outcome && (
                    <div>
                      <h3 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">Expected Outcome</h3>
                      <div className="bg-slate-50 rounded-lg p-4 text-slate-700 border border-slate-200">
                        {selectedTicket.expected_outcome}
                      </div>
                    </div>
                  )}

                  {selectedTicket.evidence_url && (
                    <div>
                      <h3 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">Evidence / Reference</h3>
                      <a
                        href={selectedTicket.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"
                      >
                        <ExternalLink className="w-4 h-4" /> Open reference link
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>

            {actionError && (
              <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{actionError}</div>
            )}

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-slate-500">
                {selectedTicket.linked_tracker_item_id ? (
                  <span className="flex items-center gap-2"><Link2 className="w-4 h-4 text-emerald-600" /> Linked to: <span className="font-bold text-navy">{linkedTitle}</span></span>
                ) : (
                  <span>General Support Query</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Embark disposition — every internal persona (Active Editor
                    or authenticated admin), never the client. */}
                {isInternalOperator && !isResolved && !isClosed && (
                  <button
                    onClick={handleMarkResolved}
                    disabled={actionLoading}
                    className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-600/20 transition-all"
                  >
                    Mark as Resolved (Embark)
                  </button>
                )}

                {/* Client confirmation — only the authenticated client may
                    confirm or reject a proposed resolution. */}
                {isClient && isResolved && (
                  <>
                    <button
                      onClick={() => handleAction({ status: 'Open', client_confirmed_at: null })}
                      disabled={actionLoading}
                      className="px-6 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Still Not Resolved
                    </button>
                    <button
                      onClick={() => handleAction({ status: 'Closed', client_confirmed_at: new Date().toISOString() })}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-600/20 transition-all"
                    >
                      <CheckCircle className="w-4 h-4" /> Confirm Resolved
                    </button>
                  </>
                )}
                {isInternalOperator && isResolved && (
                  <p className="text-xs text-slate-400">Waiting for the client to confirm or reopen this resolution.</p>
                )}

                {/* Retention — EMBARK DIGITALS ONLY. Clients never see these;
                    the server additionally refuses non-Embark editors. */}
                {isInternalOperator && !isClient && isEmbarkEditor && (
                  <>
                    {['New', 'Open'].includes(selectedTicket.status) && comments.length === 0 && !selectedTicket.resolution_proposed_at && !selectedTicket.client_confirmed_at ? (
                      <button
                        onClick={() => handleDeleteTestTicket(selectedTicket)}
                        disabled={retentionBusy}
                        className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-60"
                      >
                        Delete Ticket
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchiveTicketToggle(selectedTicket, !selectedTicket.archived_at)}
                        disabled={retentionBusy}
                        className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-60"
                      >
                        {selectedTicket.archived_at ? 'Unarchive' : 'Archive Ticket'}
                      </button>
                    )}
                  </>
                )}
                {isInternalOperator && !isClient && !isEmbarkEditor && (
                  <p className="text-xs text-slate-400">🔒 Deleting or archiving tickets is Embark Digitals only — switch the Active Editor to an Embark member.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Comments Sidebar */}
        <div className="w-full md:w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm max-h-[800px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50/60">
            <h3 className="font-bold text-navy flex items-center gap-2">Activity Thread</h3>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {loadingComments ? (
              <p className="text-slate-400 text-sm text-center">Loading activity...</p>
            ) : commentsUnavailable ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Select an Active Editor in the sidebar to view and post on this ticket's activity thread.
              </p>
            ) : comments.length === 0 ? (
              <p className="text-slate-400 text-sm text-center">No comments yet.</p>
            ) : (
              comments.map(c => {
                // Moderation mirrors the server rules: plain comments only;
                // edit is author-only; delete is author-or-Embark.
                const isPlainComment = c.activity_type === 'comment';
                const isOwnComment = !!selectedAuthorId && c.created_by_author_id === selectedAuthorId;
                const canEditComment = isInternalOperator && isPlainComment && isOwnComment;
                const canDeleteComment = isInternalOperator && isPlainComment && (isOwnComment || isEmbarkEditor);
                const isBeingEdited = editingCommentId === c.id;
                return (
                  <div key={c.id} className={cx(
                    "p-3 rounded-lg text-sm",
                    c.activity_type === 'resolution_proposed' ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50 border border-slate-100"
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-navy">{c.author_display_name || c.user_display_name || 'System'}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.created_at).toLocaleDateString()}
                        {c.edited_at ? ' · edited' : ''}
                      </span>
                    </div>
                    {isBeingEdited ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingCommentBody}
                          onChange={e => setEditingCommentBody(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveCommentEdit}
                            disabled={commentBusy || !editingCommentBody.trim()}
                            className="px-3 py-1 text-xs font-bold text-navy bg-gold hover:bg-gold/90 rounded disabled:opacity-50"
                          >
                            {commentBusy ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingCommentId(null); setEditingCommentBody(''); }}
                            disabled={commentBusy}
                            className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
                        {(canEditComment || canDeleteComment) && (
                          <div className="mt-1.5 flex gap-3">
                            {canEditComment && (
                              <button
                                onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); setCommentError(null); }}
                                disabled={commentBusy}
                                className="text-[11px] font-bold text-slate-500 hover:text-navy transition"
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteComment && (
                              <button
                                onClick={() => handleDeleteComment(c)}
                                disabled={commentBusy}
                                className="text-[11px] font-bold text-red-400 hover:text-red-600 transition"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {!isClosed && (
            <div className="p-4 border-t border-slate-200">
              {commentError && (
                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{commentError}</div>
              )}
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder="Type a comment..."
                rows={2}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold resize-none mb-2"
              />
              <button
                onClick={handlePostComment}
                disabled={actionLoading || !commentBody.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Post Comment
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Archived tickets leave the default register; internal users can reveal
  // them when the live support ticket contract returns archived_at.
  const archivedCount = tickets.filter(t => t.archived_at).length;
  const visibleTickets = tickets.filter(t => (showArchivedTickets ? true : !t.archived_at));

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Support & Tickets</h1>
          <p className="text-slate-500">Issues the client has reported to Embark, and where each one stands.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Support is CLIENT → EMBARK issue reporting. The client raises
              issues directly; Embark's action exists only to record an issue
              the client reported outside the platform — Embark never
              "complains to Embark". */}
          {isClient && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Report an Issue
            </button>
          )}
          {canCreateSupportIssue && !isClient && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-navy font-bold text-sm hover:border-gold transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Log a Ticket
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={loadTickets} className="text-xs font-bold underline">Retry</button>
        </div>
      )}
      {needsAuthorSelection && !loadError && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Select an Active Editor in the sidebar to load the support issue register.
        </div>
      )}
      {targetError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800" role="alert">
          {targetError}
        </div>
      )}

      {!isClient && archivedCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowArchivedTickets(v => !v)}
            className="text-xs font-bold text-slate-500 underline hover:text-navy"
          >
            {showArchivedTickets ? 'Hide archived' : `Show archived (${archivedCount})`}
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {visibleTickets.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-navy">
              {isInternalOperator ? 'No client-reported issues on record.' : 'No support tickets'}
            </h3>
            <p className="text-slate-500 mt-2">
              {isInternalOperator
                ? 'When a client reports an issue by phone, WhatsApp or in a meeting, record it here.'
                : 'Something not working, or need help? Report an issue and Embark will respond here.'}
            </p>
          </div>
        ) : (
          visibleTickets.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => handleSelectTicket(ticket)}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-gold/50 hover:shadow-md cursor-pointer transition-all group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className={cx(
                  "p-3 rounded-lg flex-shrink-0 mt-1",
                  ticket.status === 'Resolved' ? "bg-emerald-50 text-emerald-600" :
                  ticket.status === 'Closed' ? "bg-slate-100 text-slate-500" :
                  "bg-amber-50 text-amber-600"
                )}>
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy flex items-center gap-2">
                    {ticket.title}
                    {isAdmin && isStale(ticket) && (
                      <span className={cx(
                        "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border",
                        isEmbarkDelay(ticket)
                          ? "bg-red-50 text-red-600 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {isEmbarkDelay(ticket) ? 'Embark Overdue' : 'Follow-up Required'}
                      </span>
                    )}
                    {ticket.client_reported_urgency && (
                      <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full border", URGENCY_BADGE[ticket.client_reported_urgency] || URGENCY_BADGE['Normal'])}>
                        {ticket.client_reported_urgency}
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                    <ResponsibilityBadge value={ticketResponsibility(ticket)} />
                    {ticket.archived_at && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-500 border-slate-200">Archived</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {displayTicketStatus(ticket.status)}</span>
                    <span>•</span>
                    <span>{ticket.category}</span>
                    {ticket.linked_tracker_item_id && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-600"><Link2 className="w-3.5 h-3.5" /> {ticket.tracker_items?.title || 'Linked task'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-gold" />
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-navy">{isClient ? 'Report an Issue' : 'Log a Ticket'}</h2>
                {!isClient && (
                  <p className="text-xs text-slate-400 mt-0.5">Record an issue the client reported outside the platform (call, WhatsApp or meeting).</p>
                )}
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="p-6 space-y-5">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{createError}</div>
              )}

              {/* REPORTING AS — inline Active Editor change control */}
              {isInternalOperator && (
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Reporting As</label>
                  {selectedAuthorId ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-navy">
                        {authors.find(a => a.id === selectedAuthorId)?.display_name || selectedAuthorId}
                      </span>
                      <div className="relative" ref={authorPickerRef}>
                        <button
                          type="button"
                          onClick={() => setAuthorPickerOpen(v => !v)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
                        >
                          Change <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {authorPickerOpen && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 min-w-[220px]">
                            {authors.filter(a => a.is_active).map(a => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => { onSelectAuthor?.(a.id); setAuthorPickerOpen(false); }}
                                className={cx(
                                  "w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl",
                                  a.id === selectedAuthorId ? "font-bold text-gold" : "text-navy"
                                )}
                              >
                                {a.display_name}
                                <span className="block text-xs text-slate-400 font-normal">{a.organisation_label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                        Select who is reporting this ticket.
                      </p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        {authors.filter(a => a.is_active).map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onSelectAuthor?.(a.id)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                          >
                            <span className="font-bold text-navy">{a.display_name}</span>
                            <span className="block text-xs text-slate-400">{a.organisation_label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PHASE */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Phase</label>
                <select
                  value={newTicketForm.phase}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, phase: e.target.value, topicTaskId: '' }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {PROGRAMME_PHASES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              {/* TOPIC / DELIVERY ITEM — tracker_items filtered by phase */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Topic / Delivery Item</label>
                <select
                  value={newTicketForm.topicTaskId}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, topicTaskId: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  <option value="">General Phase Query / Issue</option>
                  {phaseFilteredTasksCreate.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>

              {/* ENTITY — only shown when no specific delivery item selected */}
              {!newTicketForm.topicTaskId && (
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                  <select
                    value={newTicketForm.entity}
                    onChange={(e) => setNewTicketForm(prev => ({ ...prev, entity: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    {PROGRAMME_ENTITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              )}

              {/* SUBJECT */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Subject</label>
                <input
                  type="text"
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief summary of the issue"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              {/* QUERY / ISSUE */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Query / Issue</label>
                <textarea
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the query or issue in full."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              {/* URGENCY — Normal / Urgent matching DB CHECK constraint */}
              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Urgency</label>
                <select
                  value={newTicketForm.clientReportedUrgency}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {TICKET_URGENCY.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {creating ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
