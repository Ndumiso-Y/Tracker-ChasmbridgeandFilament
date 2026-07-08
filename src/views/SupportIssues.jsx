import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { ShieldCheck, CheckCircle, Clock, ChevronRight, Plus, X, Link2, ExternalLink } from 'lucide-react';
import { cx } from '../utils/cx';
import { isMoreThanTwoBusinessDaysOld } from '../utils/businessDays';

const ENTITY_OPTIONS = ['Chasm Bridge Charity', 'Filament', 'Both'];
const CATEGORY_OPTIONS = [
  'Email & Mailbox', 'Website', 'Domain', 'Social Media', 'Access & Permissions',
  'Content Correction', 'Technical Issue', 'Account Configuration', 'Graduate/Cohort System', 'Other',
];
const ISSUE_TYPE_OPTIONS = ['Standalone Issue', 'Task-Linked Issue'];
const URGENCY_OPTIONS = ['Normal', 'Time Sensitive', 'Urgent'];
const URGENCY_BADGE = {
  'Normal': 'bg-slate-100 text-slate-600 border-slate-200',
  'Time Sensitive': 'bg-amber-50 text-amber-700 border-amber-200',
  'Urgent': 'bg-red-50 text-red-700 border-red-200',
};
const NO_TASK_REQUIRED_NOTE = 'No separate delivery task required.';

const emptyTicketForm = (defaultEntity) => ({
  title: '', entity: defaultEntity, category: 'Technical Issue', issueType: 'Standalone Issue',
  relatedTaskId: '', description: '', expectedOutcome: '', clientReportedUrgency: 'Normal', evidenceUrl: '',
});

export default function SupportIssues({ selectedAuthorId = "", authors = [] }) {
  const { profile, isAdmin, isClient } = useAuth();
  const isInternalOperator = !isClient;
  const canCreateSupportIssue = isClient || isInternalOperator;
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [trackerItems, setTrackerItems] = useState([]);
  const [newTicketForm, setNewTicketForm] = useState(emptyTicketForm(profile?.entity_scope || 'Both'));

  // Admin: issue -> delivery action disposition
  const [deliveryActionMode, setDeliveryActionMode] = useState(null); // null | 'link' | 'create'
  const [linkTaskId, setLinkTaskId] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [dispositionError, setDispositionError] = useState(null);

  useEffect(() => {
    loadTickets();
  }, [profile]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await collaborationService.getTickets().catch(() => []);
      setTickets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (statusUpdate) => {
    setActionLoading(true);
    try {
      const updated = await collaborationService.updateTicket(selectedTicket.id, statusUpdate);
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      await loadTickets();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateModal = async () => {
    setCreateError(null);
    setNewTicketForm(emptyTicketForm(profile?.entity_scope || 'Both'));
    setShowCreateModal(true);
    try {
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
    if (newTicketForm.issueType === 'Task-Linked Issue' && !newTicketForm.relatedTaskId) {
      setCreateError('Select the related task for a task-linked issue.');
      return;
    }
    if (isInternalOperator && !selectedAuthorId) {
      setCreateError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      let created;
      if (isInternalOperator) {
        created = await collaborationService.createInternalSupportIssue({
          authorId: selectedAuthorId,
          title: newTicketForm.title.trim(),
          entity: newTicketForm.entity,
          category: newTicketForm.category,
          issueType: newTicketForm.issueType,
          linkedTrackerItemId: newTicketForm.issueType === 'Task-Linked Issue' ? newTicketForm.relatedTaskId : null,
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
          category: newTicketForm.category,
          issue_type: newTicketForm.issueType,
          linked_tracker_item_id: newTicketForm.issueType === 'Task-Linked Issue' ? newTicketForm.relatedTaskId : null,
          description: newTicketForm.description.trim(),
          expected_outcome: newTicketForm.expectedOutcome.trim() || null,
          client_reported_urgency: newTicketForm.clientReportedUrgency,
          evidence_url: newTicketForm.evidenceUrl.trim() || null,
          reported_by_user_id: profile?.user_id || null,
          status: 'New',
        });
      }
      setShowCreateModal(false);
      // The internal Active Editor uses the anon key, which has no SELECT
      // policy on support_tickets (admin/contributor read only) — so a plain
      // refetch returns zero rows and the just-created ticket would vanish.
      // The create RPC returns the new row, so merge it in optimistically on
      // top of whatever the refetch can see (the full list for an
      // authenticated admin, nothing for the anon operator).
      const fresh = await collaborationService.getTickets().catch(() => []);
      if (created && !fresh.some(t => t.id === created.id)) {
        setTickets([created, ...fresh]);
      } else {
        setTickets(fresh);
      }
    } catch (err) {
      console.error(err);
      setCreateError(err.message || 'Failed to create support issue.');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setDeliveryActionMode(null);
    setLinkTaskId('');
    setFollowUpTitle('');
    setDispositionError(null);
    if (!trackerItems.length) {
      try {
        const items = await collaborationService.searchTrackerItemsForLinking();
        setTrackerItems(items || []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLinkExisting = async () => {
    if (!linkTaskId) {
      setDispositionError('Select a task to link.');
      return;
    }
    setActionLoading(true);
    setDispositionError(null);
    try {
      const updated = await collaborationService.updateTicket(selectedTicket.id, { linked_tracker_item_id: linkTaskId });
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      setDeliveryActionMode(null);
      await loadTickets();
    } catch (err) {
      console.error(err);
      setDispositionError(err.message || 'Failed to link task.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpTitle.trim()) {
      setDispositionError('Enter a title for the follow-up task.');
      return;
    }
    if (!selectedAuthorId) {
      setDispositionError('Select an Active Editor in the sidebar before creating a follow-up task — every tracker change must be attributed.');
      return;
    }
    setActionLoading(true);
    setDispositionError(null);
    try {
      const author = authors.find(a => a.id === selectedAuthorId);
      const authorLabel = author ? `${author.display_name} — ${author.organisation_label}` : 'Unknown Editor';
      const newTask = await collaborationService.createFollowUpTask({
        title: followUpTitle.trim(),
        entity: selectedTicket.entity,
        category: selectedTicket.category,
        phase: 'Phase 2',
        priority: selectedTicket.priority || 'Medium',
        description: selectedTicket.description,
        last_changed_by: authorLabel,
        last_changed_at: new Date().toISOString(),
      });
      await collaborationService.createTrackerItemNote({
        tracker_item_id: newTask.id,
        note_type: 'manual',
        note_text: `Created as a follow-up task from Support Issue "${selectedTicket.title}" (${selectedTicket.id}).`,
        changed_by_author_id: selectedAuthorId,
        changed_by_label: authorLabel,
      }).catch(console.warn);
      const updated = await collaborationService.updateTicket(selectedTicket.id, { linked_tracker_item_id: newTask.id });
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      setDeliveryActionMode(null);
      await loadTickets();
    } catch (err) {
      console.error(err);
      setDispositionError(err.message || 'Failed to create follow-up task.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoTaskRequired = async () => {
    setActionLoading(true);
    setDispositionError(null);
    try {
      const updated = await collaborationService.updateTicket(selectedTicket.id, { action_taken: NO_TASK_REQUIRED_NOTE });
      setSelectedTicket(prev => ({ ...prev, ...updated }));
      await loadTickets();
    } catch (err) {
      console.error(err);
      setDispositionError(err.message || 'Failed to record disposition.');
    } finally {
      setActionLoading(false);
    }
  };

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

  if (selectedTicket) {
    const linkedTitle = selectedTicket.tracker_items?.title;
    const hasNoTaskDisposition = !selectedTicket.linked_tracker_item_id && selectedTicket.action_taken === NO_TASK_REQUIRED_NOTE;

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
        <button
          onClick={() => setSelectedTicket(null)}
          className="text-navy hover:text-gold text-sm font-bold mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Tickets
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-navy mb-2">{selectedTicket.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedTicket.category}</span>
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedTicket.entity}</span>
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedTicket.issue_type || 'Standalone Issue'}</span>
                  <span className={cx(
                    "px-2.5 py-1 rounded-full font-medium border",
                    selectedTicket.status === 'Resolved' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    selectedTicket.status === 'Closed' ? "bg-slate-100 text-slate-600 border-slate-200" :
                    "bg-amber-50 text-amber-700 border-amber-200"
                  )}>
                    {selectedTicket.status}
                  </span>
                  {selectedTicket.client_reported_urgency && selectedTicket.client_reported_urgency !== 'Normal' && (
                    <span className={cx("px-2.5 py-1 rounded-full font-medium border", URGENCY_BADGE[selectedTicket.client_reported_urgency])}>
                      Client Urgency: {selectedTicket.client_reported_urgency}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-navy mb-2 uppercase tracking-wider">Description</h3>
              <div className="bg-slate-50 rounded-lg p-4 text-slate-700 border border-slate-200">
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

            {selectedTicket.investigation_summary && (
              <div>
                <h3 className="text-sm font-bold text-emerald-700 mb-2 uppercase tracking-wider">Embark Digitals Response</h3>
                <div className="bg-emerald-50 rounded-lg p-4 text-slate-700 border border-emerald-200">
                  {selectedTicket.investigation_summary}
                </div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="p-6 border-t border-slate-200 bg-slate-50/60">
              <h3 className="text-sm font-bold text-navy mb-3 uppercase tracking-wider">Delivery Action</h3>

              {selectedTicket.linked_tracker_item_id ? (
                <div className="flex items-center gap-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                  <Link2 className="w-4 h-4 text-emerald-600" />
                  Linked delivery task: <span className="font-bold text-navy">{linkedTitle || selectedTicket.linked_tracker_item_id}</span>
                </div>
              ) : hasNoTaskDisposition ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                  <ShieldCheck className="w-4 h-4 text-slate-400" /> No separate delivery task required.
                </div>
              ) : (
                <p className="text-sm text-slate-500 mb-3">This issue has not yet been assessed against the delivery register.</p>
              )}

              {dispositionError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{dispositionError}</div>
              )}

              {deliveryActionMode === 'link' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={linkTaskId}
                    onChange={(e) => setLinkTaskId(e.target.value)}
                    className="flex-1 min-w-[220px] bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    <option value="">Select a task...</option>
                    {trackerItems.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <button onClick={handleLinkExisting} disabled={actionLoading} className="px-4 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg">Confirm Link</button>
                  <button onClick={() => setDeliveryActionMode(null)} className="px-3 py-2 text-sm font-bold text-slate-500 hover:text-navy">Cancel</button>
                </div>
              ) : deliveryActionMode === 'create' ? (
                <div className="mt-3">
                  {!selectedAuthorId && (
                    <p className="mb-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      ⚠️ Select an <strong>Active Editor</strong> in the sidebar to attribute this new tracker task.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={followUpTitle}
                      onChange={(e) => setFollowUpTitle(e.target.value)}
                      placeholder="Follow-up task title"
                      className="flex-1 min-w-[220px] bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                    />
                    <button onClick={handleCreateFollowUp} disabled={actionLoading || !selectedAuthorId} className="px-4 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg disabled:opacity-50">Create Task</button>
                    <button onClick={() => setDeliveryActionMode(null)} className="px-3 py-2 text-sm font-bold text-slate-500 hover:text-navy">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setDeliveryActionMode('link')} className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-gold rounded-lg transition-colors">Link Existing Task</button>
                  <button onClick={() => setDeliveryActionMode('create')} className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-gold rounded-lg transition-colors">Create Follow-Up Task</button>
                  <button onClick={handleNoTaskRequired} disabled={actionLoading} className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-gold rounded-lg transition-colors">No Separate Task Required</button>
                </div>
              )}
            </div>
          )}

          <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-4">
            {isAdmin && selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' && (
              <button
                onClick={() => handleAction({ status: 'Resolved', resolution_proposed_at: new Date().toISOString() })}
                disabled={actionLoading}
                className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-600/20 transition-all"
              >
                Mark as Resolved (Embark)
              </button>
            )}

            {!isAdmin && selectedTicket.status === 'Resolved' && (
              <>
                <button
                  onClick={() => handleAction({ status: 'Investigating', client_confirmed_at: null })}
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Support & Issues</h1>
          <p className="text-slate-500">Track and confirm resolution of project-blocking issues.</p>
        </div>
        {canCreateSupportIssue && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Support Issue
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {tickets.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-navy">
              {isInternalOperator ? 'No support issues logged.' : 'No support tickets'}
            </h3>
            <p className="text-slate-500 mt-2">
              {isInternalOperator
                ? 'Report a task-linked or standalone issue.'
                : 'There are currently no active support issues.'}
            </p>
            {isInternalOperator && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> New Support Issue
              </button>
            )}
          </div>
        ) : (
          tickets.map(ticket => (
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
                    {ticket.client_reported_urgency && ticket.client_reported_urgency !== 'Normal' && (
                      <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full border", URGENCY_BADGE[ticket.client_reported_urgency])}>
                        {ticket.client_reported_urgency}
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {ticket.status}</span>
                    <span>•</span>
                    <span>{ticket.category}</span>
                    {ticket.linked_tracker_item_id && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-600"><Link2 className="w-3.5 h-3.5" /> {ticket.tracker_items?.title || 'Linked task'}</span>
                      </>
                    )}
                    {ticket.acknowledged_at && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Acknowledged</span>
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
              <h2 className="text-xl font-bold text-navy">New Support Issue</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="p-6 space-y-5">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{createError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Issue Title</label>
                <input
                  type="text"
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Email/account issue still unresolved"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Issue Type</label>
                <select
                  value={newTicketForm.issueType}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, issueType: e.target.value, relatedTaskId: '' }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {ISSUE_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              {newTicketForm.issueType === 'Task-Linked Issue' && (
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Related Task</label>
                  <select
                    value={newTicketForm.relatedTaskId}
                    onChange={(e) => setNewTicketForm(prev => ({ ...prev, relatedTaskId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  >
                    <option value="">Select the related task...</option>
                    {trackerItems.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                <select
                  value={newTicketForm.entity}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, entity: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {ENTITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Category</label>
                <select
                  value={newTicketForm.category}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What is happening?</label>
                <textarea
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the issue exactly as reported."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What should happen instead? <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  value={newTicketForm.expectedOutcome}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, expectedOutcome: e.target.value }))}
                  rows={2}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Client-Reported Urgency</label>
                <select
                  value={newTicketForm.clientReportedUrgency}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, clientReportedUrgency: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {URGENCY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Separate from Embark's internal delivery priority — Embark reviews and sets priority independently.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Evidence / Reference Link <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="url"
                  value={newTicketForm.evidenceUrl}
                  onChange={(e) => setNewTicketForm(prev => ({ ...prev, evidenceUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
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
                  {creating ? 'Creating...' : 'Create Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
