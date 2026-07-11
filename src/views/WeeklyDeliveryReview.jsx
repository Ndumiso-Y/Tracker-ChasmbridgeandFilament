import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { Rocket, ChevronRight, ShieldCheck, Plus, X, CheckCircle, Send, AlertCircle, Link2 } from 'lucide-react';
import { cx } from '../utils/cx';
import { PROGRAMME_ENTITIES, SECURE_SIGN_IN_ENABLED } from '../data/programmeContext';
import { reviewResponsibility } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { explainDbError } from '../utils/dbErrors';

const REVIEW_ENTITY_OPTIONS = PROGRAMME_ENTITIES.filter(e => e !== 'Both');

function NumericRatingScale({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-sm font-bold text-navy mb-1.5">{label}</label>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            title={String(n)}
            className={cx(
              "flex-1 py-2 rounded-lg border text-center text-sm font-black transition disabled:opacity-60",
              value === n
                ? "bg-gold border-gold text-navy shadow-sm"
                : "bg-white border-slate-200 text-slate-500 hover:border-gold/50"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        <span>Needs Significant Improvement</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  'Awaiting Client Review': 'bg-amber-50 text-amber-700 border-amber-200',
  'Submitted': 'bg-blue-50 text-blue-700 border-blue-200',
  'Reviewed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not Opened': 'bg-slate-100 text-slate-500 border-slate-200',
};

// Human date for register card titles — ISO strings are storage language,
// not user language.
function fmtDay(d) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

const emptySubmitForm = {
  deliveryScore: '', communicationScore: '', timingScore: '', requirementUnderstandingScore: '',
  issueResolutionScore: '', approvalProcessScore: '',
  workedWell: '', couldImprove: '', didNotMeetExpectations: '',
  priority1: '', priority2: '', priority3: '',
};

export default function WeeklyDeliveryReview({ selectedAuthorId = "", authors = [], targetRecordId = null, onRecordTargetConsumed = null }) {
  const { profile, isAdmin, isClient } = useAuth();
  const isInternalOperator = !isClient;
  const [reviews, setReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [contributors, setContributors] = useState([]);

  // Admin: open/assign a review period
  const defaultEntity = REVIEW_ENTITY_OPTIONS.includes(profile?.entity_scope) ? profile.entity_scope : REVIEW_ENTITY_OPTIONS[0];
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [loadingContributors, setLoadingContributors] = useState(false);
  const [contributorsLoadError, setContributorsLoadError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);
  const [openForm, setOpenForm] = useState({ entity: defaultEntity, periodStart: '', periodEnd: '', contributorUserId: '' });
  const [workPreview, setWorkPreview] = useState([]);

  // Client: submit an assigned, still-pending review
  const [submitForm, setSubmitForm] = useState(emptySubmitForm);
  const [submitError, setSubmitError] = useState(null);
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [hasUnresolvedIssue, setHasUnresolvedIssue] = useState(false);
  const [linkedTrackerItems, setLinkedTrackerItems] = useState([]);
  const [creatingIssueFromReview, setCreatingIssueFromReview] = useState(false);
  const [issueFromReviewCreated, setIssueFromReviewCreated] = useState(false);

  // Assignment State
  const [assignFormUser, setAssignFormUser] = useState('');

  const [loadError, setLoadError] = useState(null);
  const [needsAuthorSelection, setNeedsAuthorSelection] = useState(false);

  // Retention (V4A.17): Embark-only, server-enforced; archived reviews leave
  // the default register with an internal reveal toggle.
  const [showArchivedReviews, setShowArchivedReviews] = useState(false);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionError, setRetentionError] = useState(null);
  const isEmbarkEditor = !!authors.find(a => a.id === selectedAuthorId && a.organisation_label === 'Embark Digitals');

  const handleArchiveReviewToggle = async (rev, archive) => {
    setRetentionBusy(true);
    setRetentionError(null);
    try {
      if (archive) {
        await collaborationService.archiveInternalWeeklyReview({ authorId: selectedAuthorId, reviewId: rev.id });
      } else {
        await collaborationService.unarchiveInternalWeeklyReview({ authorId: selectedAuthorId, reviewId: rev.id });
      }
      setSelectedReview(null);
      await loadReviews();
    } catch (err) {
      console.error(err);
      setRetentionError(explainDbError(err, 'weekly review retention'));
    } finally {
      setRetentionBusy(false);
    }
  };

  const handleDeleteEmptyReview = async (rev) => {
    if (!window.confirm(`Permanently delete the ${rev.entity} review for ${rev.review_period_start} – ${rev.review_period_end}? Only a never-submitted review with no feedback can be deleted.`)) return;
    setRetentionBusy(true);
    setRetentionError(null);
    try {
      await collaborationService.deleteInternalEmptyWeeklyReview({ authorId: selectedAuthorId, reviewId: rev.id });
      setSelectedReview(null);
      await loadReviews();
    } catch (err) {
      console.error(err);
      setRetentionError(explainDbError(err, 'weekly review retention'));
    } finally {
      setRetentionBusy(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [profile, selectedAuthorId]);

  useEffect(() => {
    if (!isAdmin) return;
    collaborationService.getActiveClientContributors()
      .then(setContributors)
      .catch((err) => console.error(err));
  }, [isAdmin]);

  useEffect(() => {
    if (showOpenModal && openForm.entity && openForm.periodStart && openForm.periodEnd) {
      collaborationService.getCurrentDeliveryTrackerItems(openForm.entity, openForm.periodStart, openForm.periodEnd)
        .then(items => setWorkPreview(items || []))
        .catch(console.warn);
    }
  }, [showOpenModal, openForm.entity, openForm.periodStart, openForm.periodEnd]);

  const contributorMap = useMemo(
    () => Object.fromEntries(contributors.map(c => [c.user_id, c.display_name || c.user_id])),
    [contributors]
  );

  const fetchRegister = async () => {
    if (profile) {
      const data = await collaborationService.getReviews();
      return data || [];
    }
    if (selectedAuthorId) {
      return await collaborationService.getInternalWeeklyReviews(selectedAuthorId);
    }
    return null;
  };

  const loadReviews = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchRegister();
      setReviews(rows || []);
      setNeedsAuthorSelection(rows === null);
    } catch (err) {
      console.error(err);
      setReviews([]);
      setLoadError('Unable to load weekly reviews. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReview = async (rev) => {
    setSelectedReview(rev);
    setSubmitForm(emptySubmitForm);
    setSubmitError(null);
    setSelectedTaskIds([]);
    setHasUnresolvedIssue(false);
    setIssueFromReviewCreated(false);
    setLoading(true);
    setAssignFormUser('');
    const isMyPending = isClient && !isAdmin
      && (rev.assigned_contributor_user_id === profile?.user_id || !rev.assigned_contributor_user_id)
      && rev.review_status === 'Awaiting Client Review';
    try {
      const useInternalReads = !profile && selectedAuthorId;
      const [fItems, linked] = await Promise.all([
        useInternalReads
          ? collaborationService.getInternalWeeklyReviewFeedback(selectedAuthorId, rev.id).catch(() => [])
          : collaborationService.getReviewFeedbackItems(rev.id).catch(() => []),
        useInternalReads
          ? collaborationService.getInternalWeeklyReviewTrackerItems(selectedAuthorId, rev.id).catch(() => [])
          : collaborationService.getReviewTrackerItems(rev.id).catch(() => []),
      ]);
      setFeedbackItems(fItems);
      setLinkedTrackerItems(linked || []);

      // Auto-populate assigning field
      if (isInternalOperator) {
        setAssignFormUser(rev.assigned_contributor_user_id || '');
        if (contributors.length === 0) {
           const contribs = await collaborationService.getInternalActiveClientContributors(selectedAuthorId);
           setContributors(contribs || []);
        }
      }

      if (isMyPending) {
        const items = await collaborationService.getCurrentDeliveryTrackerItems(rev.entity, rev.review_period_start, rev.review_period_end).catch(() => []);
        setDeliveryItems(items || []);
        // Automatically check tasks that the preview would have shown, if they are already linked
        const linkedIds = (linked || []).map(l => l.tracker_item_id);
        setSelectedTaskIds(linkedIds);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Direct record navigation (V4A.14): consume a targeted review id once the
  // persona-correct register has loaded — select the real loaded row (which
  // loads linked work + feedback and resolves scorecard vs detail view),
  // then clear the consumed target.
  useEffect(() => {
    if (!targetRecordId || loading) return;
    const found = reviews.find(r => r.id === targetRecordId);
    if (found) handleSelectReview(found);
    if (onRecordTargetConsumed) onRecordTargetConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRecordId, loading, reviews]);

  // Honest persistence: the local disposition only updates after a
  // confirmed server write — a swallowed failure must never look saved.
  const handleDisposition = async (itemId, newDisposition) => {
    setActionLoading(true);
    try {
      await collaborationService.updateFeedbackItemDisposition(itemId, { disposition: newDisposition });
      setFeedbackItems(prev => prev.map(fi => fi.id === itemId ? { ...fi, disposition: newDisposition } : fi));
    } catch (err) {
      console.error(err);
      alert(err.message || 'The disposition could not be saved.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReviewed = async () => {
    setActionLoading(true);
    try {
      const updated = await collaborationService.updateReview(selectedReview.id, { review_status: 'Reviewed' });
      setSelectedReview(updated);
      await loadReviews();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const openOpenModal = async () => {
    setOpenError(null);
    setContributorsLoadError(false);
    const { start, end } = getCurrentWeekRange();
    setOpenForm({ entity: defaultEntity, periodStart: start, periodEnd: end, contributorUserId: '' });
    setShowOpenModal(true);
    setLoadingContributors(true);
    try {
      if (isAdmin) {
        const contribs = await collaborationService.getActiveClientContributors();
        setContributors(contribs || []);
      } else if (selectedAuthorId) {
        const contribs = await collaborationService.getInternalActiveClientContributors(selectedAuthorId);
        setContributors(contribs || []);
      } else {
        setContributors([]);
      }
    } catch (err) {
      console.error(err);
      setContributors([]);
      setContributorsLoadError(true);
    } finally {
      setLoadingContributors(false);
    }
  };

  const handleOpenReview = async (e) => {
    e.preventDefault();
    if (!openForm.entity) {
      setOpenError('Please select an entity.');
      return;
    }
    if (!openForm.periodStart || !openForm.periodEnd) {
      setOpenError('Please select both a review period start and end date.');
      return;
    }
    if (isInternalOperator && !selectedAuthorId) {
      setOpenError('Please select an Active Editor in the sidebar to enable editing.');
      return;
    }
    // Duplicate guard: one review per entity per period. Opening a second
    // review for the same week creates two identical cards the client cannot
    // tell apart — block it and point at the existing one instead.
    const duplicate = reviews.find(r =>
      !r.archived_at &&
      r.entity === openForm.entity &&
      r.review_period_start <= openForm.periodEnd &&
      r.review_period_end >= openForm.periodStart
    );
    if (duplicate) {
      setOpenError(`A ${duplicate.entity} review already covers ${duplicate.review_period_start} to ${duplicate.review_period_end} (${duplicate.review_status}). Open that review instead, or choose a different period.`);
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      let created;
      if (isInternalOperator) {
        // Atomic internal open: creates review AND links work-preview items
        // in one SECURITY DEFINER RPC — no post-create client-side loop.
        created = await collaborationService.openInternalWeeklyReviewWithItems({
          authorId: selectedAuthorId,
          entity: openForm.entity,
          periodStart: openForm.periodStart,
          periodEnd: openForm.periodEnd,
          contributorUserId: openForm.contributorUserId || null,
          // Pass validated Phase 2/3 work-preview ids; server validates each.
          trackerItemIds: workPreview.length > 0 ? workPreview.map(i => i.id) : null,
        });
      } else {
        created = await collaborationService.createReview({
          entity: openForm.entity,
          review_period_start: openForm.periodStart,
          review_period_end: openForm.periodEnd,
          assigned_contributor_user_id: openForm.contributorUserId || null,
          review_status: 'Awaiting Client Review',
          opened_at: new Date().toISOString(),
          submitted_at: null,
        });
        // Authenticated admin path: retain existing safe direct junction inserts.
        if (created && workPreview.length > 0) {
          for (const item of workPreview) {
            await collaborationService.linkReviewTrackerItem(created.id, item.id).catch(console.warn);
          }
        }
      }


      setShowOpenModal(false);
      try {
        const rows = await fetchRegister();
        if (created && rows !== null && !(rows || []).some(r => r.id === created.id)) {
          setReviews([created, ...(rows || [])]);
        } else {
          setReviews(rows || (created ? [created] : []));
        }
      } catch (reloadErr) {
        console.error(reloadErr);
        if (created) setReviews(prev => (prev.some(r => r.id === created.id) ? prev : [created, ...prev]));
      }
    } catch (err) {
      console.error(err);
      setOpenError(err.message || 'Failed to open weekly review.');
    } finally {
      setOpening(false);
    }
  };

  const handleAssignReviewer = async () => {
    if (!selectedAuthorId) return;
    setActionLoading(true);
    try {
      const updated = await collaborationService.assignInternalWeeklyReviewContributor({
        authorId: selectedAuthorId,
        reviewId: selectedReview.id,
        contributorUserId: assignFormUser || null,
      });
      setSelectedReview(updated);
      await loadReviews();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to assign reviewer.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!submitForm.deliveryScore) {
      setSubmitError('Delivery score is required.');
      return;
    }
    if (isInternalOperator && !selectedAuthorId) {
      setSubmitError('Select an Active Editor (Recorded by) in the sidebar first.');
      return;
    }
    setActionLoading(true);
    setSubmitError(null);
    try {
      let updated;
      if (isInternalOperator) {
        // Sign-ins are parked: the client's scores are recorded by the
        // Active Editor via an author-validated RPC. Work items were already
        // auto-linked when the review was opened, so no link loop here.
        updated = await collaborationService.submitInternalWeeklyReview({
          authorId: selectedAuthorId,
          reviewId: selectedReview.id,
          deliveryScore: submitForm.deliveryScore,
          communicationScore: submitForm.communicationScore || null,
          timingScore: submitForm.timingScore || null,
          requirementUnderstandingScore: submitForm.requirementUnderstandingScore || null,
          issueResolutionScore: submitForm.issueResolutionScore || null,
          approvalProcessScore: submitForm.approvalProcessScore || null,
          workedWell: submitForm.workedWell || null,
          couldImprove: submitForm.couldImprove || null,
          didNotMeetExpectations: submitForm.didNotMeetExpectations || null,
          priority1: submitForm.priority1 || null,
          priority2: submitForm.priority2 || null,
          priority3: submitForm.priority3 || null,
        });
      } else {
        for (const taskId of selectedTaskIds) {
          // Link them if not already linked
          if (!linkedTrackerItems.some(li => li.tracker_item_id === taskId)) {
            await collaborationService.linkReviewTrackerItem(selectedReview.id, taskId).catch(console.warn);
          }
        }
        updated = await collaborationService.updateReview(selectedReview.id, {
          delivery_score: submitForm.deliveryScore || null,
          communication_score: submitForm.communicationScore || null,
          timing_score: submitForm.timingScore || null,
          requirement_understanding_score: submitForm.requirementUnderstandingScore || null,
          issue_resolution_score: submitForm.issueResolutionScore || null,
          approval_process_score: submitForm.approvalProcessScore || null,
          worked_well: submitForm.workedWell || null,
          could_improve: submitForm.couldImprove || null,
          did_not_meet_expectations: submitForm.didNotMeetExpectations || null,
          next_week_priority_1: submitForm.priority1 || null,
          next_week_priority_2: submitForm.priority2 || null,
          next_week_priority_3: submitForm.priority3 || null,
          reviewer_user_id: profile?.user_id || null,
          assigned_contributor_user_id: profile?.user_id || null, // V4A.12 Self-claim
          submitted_at: new Date().toISOString(),
          review_status: 'Submitted',
        });
      }
      setSelectedReview(updated);
      // Re-sync from the register read so joined labels (Recorded by,
      // assignee name) appear immediately, not only after reopening.
      try {
        const rows = await fetchRegister();
        setReviews(rows || []);
        const fresh = (rows || []).find(r => r.id === updated.id);
        if (fresh) setSelectedReview(fresh);
      } catch (reloadErr) {
        console.error(reloadErr);
        await loadReviews();
      }
    } catch (err) {
      console.error(err);
      setSubmitError(explainDbError(err, 'weekly review submission'));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleTaskSelection = (id) => {
    setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleCreateIssueFromReview = async () => {
    if (!submitForm.didNotMeetExpectations.trim()) return;
    if (isInternalOperator && !selectedAuthorId) return;
    setCreatingIssueFromReview(true);
    try {
      if (isInternalOperator) {
        await collaborationService.createInternalSupportIssue({
          authorId: selectedAuthorId,
          title: `Unresolved issue from weekly review — ${selectedReview.entity}`,
          entity: selectedReview.entity,
          category: 'Other',
          issueType: 'Standalone Issue',
          linkedTrackerItemId: null,
          description: submitForm.didNotMeetExpectations.trim(),
          expectedOutcome: null,
          clientReportedUrgency: 'Normal',
          evidenceUrl: null,
        });
      } else {
        await collaborationService.createTicket({
          id: `ticket-${Date.now()}`,
          title: `Unresolved issue from weekly review — ${selectedReview.entity}`,
          entity: selectedReview.entity,
          category: 'Other',
          issue_type: 'Standalone Issue',
          description: submitForm.didNotMeetExpectations.trim(),
          reported_by_user_id: profile?.user_id || null,
          status: 'New',
        });
      }
      setIssueFromReviewCreated(true);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingIssueFromReview(false);
    }
  };

  if (loading && !selectedReview) {
    return <div className="p-8 text-slate-500">Loading weekly reviews...</div>;
  }

  const isMyPendingReview = !!selectedReview && isClient && !isAdmin
    && (selectedReview.assigned_contributor_user_id === profile?.user_id || !selectedReview.assigned_contributor_user_id)
    && selectedReview.review_status === 'Awaiting Client Review';

  // While sign-ins are parked there is no client session to complete the
  // scorecard, so the internal operator records the client's scores — the
  // same "the client tells you, an editor records it" model as Log Request.
  const canInternalComplete = !!selectedReview && isInternalOperator
    && selectedReview.review_status === 'Awaiting Client Review'
    && !selectedReview.archived_at;

  const isAwaitingOthers = !!selectedReview && selectedReview.review_status === 'Awaiting Client Review' && !isMyPendingReview && !canInternalComplete;

  if (selectedReview) {
    if (isMyPendingReview || canInternalComplete) {
      return (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto">
          <button
            onClick={() => setSelectedReview(null)}
            className="text-navy hover:text-gold text-sm font-bold mb-6 flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Reviews
          </button>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
            <div className="p-6 border-b border-slate-200 bg-amber-50/60">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Action Required</span>
              <h2 className="text-2xl font-bold text-navy mt-0.5 mb-2">Weekly Delivery Review</h2>
              <p className="text-sm text-slate-600 mb-2">
                {canInternalComplete
                  ? 'Score Embark Digitals on this period’s delivery. Capture the client’s own ratings and words — the submission is recorded under the selected Active Editor.'
                  : 'Please review Embark Digitals based on the work completed and managed during this period.'}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedReview.entity}</span>
                <span>•</span>
                <span>Review Period: {selectedReview.review_period_start} to {selectedReview.review_period_end}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitReview} className="p-6 space-y-5">
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{submitError}</div>
              )}

              <NumericRatingScale label="Delivery — Were agreed outputs delivered?" value={submitForm.deliveryScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, deliveryScore: v }))} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumericRatingScale label="Communication" value={submitForm.communicationScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, communicationScore: v }))} />
                <NumericRatingScale label="Timing" value={submitForm.timingScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, timingScore: v }))} />
                <NumericRatingScale label="Requirement Understanding" value={submitForm.requirementUnderstandingScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, requirementUnderstandingScore: v }))} />
                <NumericRatingScale label="Issue Resolution" value={submitForm.issueResolutionScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, issueResolutionScore: v }))} />
                <div className="sm:col-span-2">
                <NumericRatingScale label="Approval Process" value={submitForm.approvalProcessScore} onChange={(v) => setSubmitForm(prev => ({ ...prev, approvalProcessScore: v }))} />
                </div>
              </div>

              {/* Internal submissions skip this picker — work items were
                  auto-linked when the review was opened. */}
              {!canInternalComplete && deliveryItems.length > 0 && (
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Tasks / Deliverables for This Week <span className="font-normal text-slate-400">(optional)</span></label>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                    {deliveryItems.map(item => (
                      <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700 px-1.5 py-1 rounded hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.includes(item.id)}
                          onChange={() => toggleTaskSelection(item.id)}
                          className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold"
                        />
                        {item.title}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What did not meet expectations?</label>
                <textarea value={submitForm.didNotMeetExpectations} onChange={(e) => setSubmitForm(prev => ({ ...prev, didNotMeetExpectations: e.target.value }))} rows={3} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-navy mb-1.5">
                  <input type="checkbox" checked={hasUnresolvedIssue} onChange={(e) => setHasUnresolvedIssue(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold" />
                  Are there unresolved issues?
                </label>
                {hasUnresolvedIssue && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <p className="text-xs text-amber-800 flex items-start gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      Describe the unresolved issue above, then optionally raise it as a tracked Support Issue.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateIssueFromReview}
                      disabled={creatingIssueFromReview || issueFromReviewCreated || !submitForm.didNotMeetExpectations.trim()}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {issueFromReviewCreated ? 'Support Issue Created' : creatingIssueFromReview ? 'Creating...' : 'Create Support Issue'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What worked well this week?</label>
                <textarea value={submitForm.workedWell} onChange={(e) => setSubmitForm(prev => ({ ...prev, workedWell: e.target.value }))} rows={3} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What could Embark improve? <span className="font-normal text-slate-400">(optional, additional comments welcome here)</span></label>
                <textarea value={submitForm.couldImprove} onChange={(e) => setSubmitForm(prev => ({ ...prev, couldImprove: e.target.value }))} rows={3} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
              </div>

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">What should receive the most attention next week? <span className="font-normal text-slate-400">(optional)</span></label>
                <div className="space-y-2">
                  <input type="text" value={submitForm.priority1} onChange={(e) => setSubmitForm(prev => ({ ...prev, priority1: e.target.value }))} placeholder="Priority 1" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
                  <input type="text" value={submitForm.priority2} onChange={(e) => setSubmitForm(prev => ({ ...prev, priority2: e.target.value }))} placeholder="Priority 2" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
                  <input type="text" value={submitForm.priority3} onChange={(e) => setSubmitForm(prev => ({ ...prev, priority3: e.target.value }))} placeholder="Priority 3" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  <Send className="w-4 h-4" /> {actionLoading ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
        <button
          onClick={() => setSelectedReview(null)}
          className="text-navy hover:text-gold text-sm font-bold mb-6 flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Reviews
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <h2 className="text-2xl font-bold text-navy mb-2">Weekly Delivery Review</h2>
              <span className={cx("px-2.5 py-1 h-fit rounded-full font-medium border text-sm", STATUS_BADGE[selectedReview.review_status] || STATUS_BADGE['Not Opened'])}>
                {selectedReview.review_status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">{selectedReview.entity}</span>
              <span>•</span>
              <span>{selectedReview.review_period_start} to {selectedReview.review_period_end}</span>
              {selectedReview.assigned_contributor_user_id ? (
                <>
                  <span>•</span>
                  <span>Assigned: {selectedReview.assigned_contributor_name || contributorMap[selectedReview.assigned_contributor_user_id] || 'Contributor'}</span>
                </>
              ) : selectedReview.submitted_by_label ? (
                <>
                  <span>•</span>
                  <span>Recorded by {selectedReview.submitted_by_label}</span>
                </>
              ) : (
                <>
                  <span>•</span>
                  <span>Unassigned</span>
                </>
              )}
              {selectedReview.archived_at && (
                <span className="px-2.5 py-1 rounded-full font-medium border bg-slate-100 text-slate-500 border-slate-200">Archived</span>
              )}
            </div>

            {/* Retention — EMBARK DIGITALS ONLY (server re-verifies). A
                never-submitted review with no feedback deletes; everything
                else archives reversibly. Clients never see these. */}
            {isInternalOperator && !isClient && isEmbarkEditor && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {retentionError && (
                  <p className="w-full rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{retentionError}</p>
                )}
                {selectedReview.review_status === 'Awaiting Client Review' && feedbackItems.length === 0 ? (
                  <button
                    onClick={() => handleDeleteEmptyReview(selectedReview)}
                    disabled={retentionBusy}
                    className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-60"
                  >
                    Delete Review
                  </button>
                ) : (
                  <button
                    onClick={() => handleArchiveReviewToggle(selectedReview, !selectedReview.archived_at)}
                    disabled={retentionBusy}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {selectedReview.archived_at ? 'Unarchive' : 'Archive Review'}
                  </button>
                )}
              </div>
            )}
            {isInternalOperator && !isClient && !isEmbarkEditor && (
              <p className="mt-3 text-xs text-slate-400">
                🔒 Deleting or archiving reviews is Embark Digitals only — switch the Active Editor / Recorded by to an Embark member.
              </p>
            )}
          </div>

          {/* Reviewer assignment targets client SIGN-IN accounts, so the whole
              row is parked with SECURE_SIGN_IN_ENABLED — reviews run
              unassigned until sign-ins are called back up. */}
          {SECURE_SIGN_IN_ENABLED && isInternalOperator && selectedReview.review_status === 'Awaiting Client Review' && (
            <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center gap-4">
              <span className="text-sm font-bold text-navy">Assign Reviewer:</span>
              <select
                value={assignFormUser}
                onChange={e => setAssignFormUser(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded p-1.5 text-sm w-64"
              >
                <option value="">Unassigned</option>
                {contributors.map(c => (
                  <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id}</option>
                ))}
              </select>
              <button
                onClick={handleAssignReviewer}
                disabled={actionLoading || (!selectedReview.assigned_contributor_user_id && !assignFormUser) || (selectedReview.assigned_contributor_user_id === assignFormUser)}
                className="px-3 py-1.5 text-xs font-bold bg-gold text-navy rounded shadow-sm hover:bg-gold/90 disabled:opacity-50"
              >
                Update Assignment
              </button>
              {contributors.length === 0 && (
                <p className="w-full text-xs text-amber-700">
                  This list shows client sign-in accounts, never team members/Active Editors — none exist yet.
                  Each person must sign in once via Magic Link, then be activated under
                  <span className="font-bold"> Admin &amp; Settings → Client Access</span>. Unassigned works meanwhile — the first eligible client to complete it claims it.
                </p>
              )}
            </div>
          )}

          {isAwaitingOthers ? (
            <div className="p-6 space-y-4">
              <p className="text-slate-500">
                {selectedReview.assigned_contributor_user_id
                  ? "This review has been opened and assigned. Awaiting the client contributor's submission."
                  : 'This review is open and unassigned — the first eligible client contributor to complete it claims it.'}
              </p>
              {/* Internal instrument preview (V4A.15): Embark can always see
                  the exact instrument it is measured by. No scores are
                  invented — this renders the dimensions, never values. */}
              {isInternalOperator && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-navy">What the client will score (1–10 each)</p>
                  <ul className="mt-2 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
                    <li>Delivery — were agreed outputs delivered?</li>
                    <li>Communication</li>
                    <li>Timing</li>
                    <li>Requirement Understanding</li>
                    <li>Issue Resolution</li>
                    <li>Approval Process</li>
                  </ul>
                  <p className="mt-2 text-xs text-slate-400">
                    Plus: what worked well, what to improve, unresolved issues (optionally raised as a support ticket), and next week's priorities.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Delivery</h3>
                  {selectedReview.delivery_score != null ? (
                    <p className="text-xl font-bold text-navy">{selectedReview.delivery_score}/10</p>
                  ) : (
                    <p className={cx(
                      "text-xl font-bold",
                      selectedReview.overall_delivery === 'Excellent' || selectedReview.overall_delivery === 'Good' ? "text-emerald-600" :
                      selectedReview.overall_delivery === 'Poor' ? "text-red-600" : "text-amber-600"
                    )}>{selectedReview.overall_delivery || '—'}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Requirement Understanding</h3>
                  <p className="text-slate-700">{selectedReview.requirement_understanding_score != null ? `${selectedReview.requirement_understanding_score}/10` : (selectedReview.requirement_understanding || '—')}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Communication</h3>
                  <p className="text-slate-700">{selectedReview.communication_score != null ? `${selectedReview.communication_score}/10` : (selectedReview.communication_rating || '—')}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Delivery Timing</h3>
                  <p className="text-slate-700">{selectedReview.timing_score != null ? `${selectedReview.timing_score}/10` : (selectedReview.delivery_timing || '—')}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Issue Resolution</h3>
                  <p className="text-slate-700">{selectedReview.issue_resolution_score != null ? `${selectedReview.issue_resolution_score}/10` : (selectedReview.issue_resolution || '—')}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Approval Process</h3>
                  <p className="text-slate-700">{selectedReview.approval_process_score != null ? `${selectedReview.approval_process_score}/10` : (selectedReview.approval_process || '—')}</p>
                </div>
                {selectedReview.did_not_meet_expectations && (
                  <div className="space-y-2 sm:col-span-2">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Did Not Meet Expectations</h3>
                    <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{selectedReview.did_not_meet_expectations}</p>
                  </div>
                )}
                {selectedReview.worked_well && (
                  <div className="space-y-2 sm:col-span-2">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Worked Well</h3>
                    <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{selectedReview.worked_well}</p>
                  </div>
                )}
                {selectedReview.could_improve && (
                  <div className="space-y-2 sm:col-span-2">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Could Improve</h3>
                    <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{selectedReview.could_improve}</p>
                  </div>
                )}
                {linkedTrackerItems.length > 0 && (
                  <div className="space-y-2 sm:col-span-2">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Feedback Relates To</h3>
                    <div className="flex flex-wrap gap-2">
                      {linkedTrackerItems.map(li => (
                        <span key={li.id} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          <Link2 className="w-3 h-3" /> {li.tracker_items?.title || li.tracker_item_id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-200 bg-slate-50/60">
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-4">Feedback</h3>
                {feedbackItems.length === 0 ? (
                  <p className="text-slate-500">No individual feedback items for this review.</p>
                ) : (
                  <div className="space-y-4">
                    {feedbackItems.map(item => (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className={cx(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              item.sentiment === 'Positive' ? "bg-emerald-50 text-emerald-700" :
                              item.sentiment === 'Critical' ? "bg-red-50 text-red-600" :
                              item.sentiment === 'Negative' ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                            )}>{item.sentiment}</span>
                            <p className="mt-3 text-navy font-medium">{item.feedback_text}</p>
                            <p className="mt-1 text-xs text-slate-500">Category: {item.feedback_category}</p>
                          </div>
                        </div>

                        {isAdmin && (item.sentiment === 'Negative' || item.sentiment === 'Critical') && (
                          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-2">
                            <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">Admin Disposition Required</label>
                            <select
                              value={item.disposition || ''}
                              onChange={(e) => handleDisposition(item.id, e.target.value)}
                              disabled={actionLoading}
                              className="bg-white border border-slate-300 text-slate-800 rounded p-2 text-sm focus:ring-2 focus:ring-gold/30 focus:border-gold w-full md:w-1/2"
                            >
                              <option value="" disabled>Select disposition...</option>
                              <option value="Acknowledged — No Separate Action">Acknowledged — No Separate Action</option>
                              <option value="Follow-Up Task Required">Follow-Up Task Required</option>
                              <option value="Support Ticket Required">Support Ticket Required</option>
                              <option value="Clarification Required">Clarification Required</option>
                              <option value="Process Improvement">Process Improvement</option>
                              <option value="Monitor Next Week">Monitor Next Week</option>
                            </select>
                          </div>
                        )}
                        {!isAdmin && item.disposition && (
                          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm text-slate-500">Embark Action: <span className="text-slate-700 font-medium">{item.disposition}</span></span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && selectedReview.review_status === 'Submitted' && (
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                  <button
                    onClick={handleMarkReviewed}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md shadow-emerald-600/20 transition-all"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark as Reviewed
                  </button>
                </div>
              )}
              {/* Honest lifecycle-lock explanation: marking a review as
                  Reviewed is a server-protected admin disposition — the
                  no-session operator is told why and what to do, instead of
                  the action silently not existing. */}
              {!isAdmin && isInternalOperator && selectedReview.review_status === 'Submitted' && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                  {SECURE_SIGN_IN_ENABLED
                    ? <>🔒 Marking this review as Reviewed is an admin disposition — use <span className="font-bold">Secure Sign In</span> as admin to close it out.</>
                    : <>🔒 Marking this review as Reviewed is an admin sign-in disposition, and sign-ins are switched off for now — the review stays Submitted, which is fine for the weekly cycle.</>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const currentWeek = getCurrentWeekRange();
  // Archived reviews leave every operating lens (week status, pending list,
  // default register) — recoverable via the internal Show-archived toggle.
  const activeReviews = reviews.filter(r => !r.archived_at);
  const archivedReviewCount = reviews.length - activeReviews.length;
  const visibleReviews = showArchivedReviews ? reviews : activeReviews;
  const weekStatus = REVIEW_ENTITY_OPTIONS.map(entity => {
    const review = activeReviews.find(r => r.entity === entity && r.review_period_start <= currentWeek.end && r.review_period_end >= currentWeek.start);
    return { entity, status: review ? review.review_status : 'Not Opened' };
  });

  const myPendingReviews = isClient && !isAdmin
    ? activeReviews.filter(r => (r.assigned_contributor_user_id === profile?.user_id || !r.assigned_contributor_user_id) && r.review_status === 'Awaiting Client Review')
    : [];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Weekly Delivery Review</h1>
          <p className="text-slate-500">Evaluate delivery speed, communication, and requirement understanding.</p>
        </div>
        {isInternalOperator && (
          <button
            onClick={openOpenModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Open Weekly Review
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={loadReviews} className="text-xs font-bold underline">Retry</button>
        </div>
      )}
      {needsAuthorSelection && !loadError && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Select an Active Editor in the sidebar to load the weekly review register.
        </div>
      )}

      {isInternalOperator && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {weekStatus.map(({ entity, status }) => (
            <div key={entity} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{entity} — This Week</p>
                <p className="text-sm font-bold text-navy mt-0.5">{currentWeek.start} to {currentWeek.end}</p>
              </div>
              <span className={cx("px-2.5 py-1 rounded-full text-xs font-bold border", STATUS_BADGE[status])}>{status}</span>
            </div>
          ))}
        </div>
      )}

      {myPendingReviews.length > 0 && (
        <div className="mb-6 space-y-3">
          {myPendingReviews.map(rev => (
            <div key={rev.id} onClick={() => handleSelectReview(rev)} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 cursor-pointer hover:border-amber-300 transition-colors">
              <div>
                <p className="text-sm font-bold text-amber-800">Weekly review requested — {rev.entity}</p>
                <p className="text-xs text-amber-700 mt-0.5">{rev.review_period_start} to {rev.review_period_end}</p>
              </div>
              <span className="text-sm font-bold text-amber-800 flex items-center gap-1">Complete Now <ChevronRight className="w-4 h-4" /></span>
            </div>
          ))}
        </div>
      )}

      {!isClient && archivedReviewCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowArchivedReviews(v => !v)}
            className="text-xs font-bold text-slate-500 underline hover:text-navy"
          >
            {showArchivedReviews ? 'Hide archived' : `Show archived (${archivedReviewCount})`}
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {visibleReviews.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
            <Rocket className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-navy">
              {isInternalOperator ? 'No weekly review opened for this period.' : 'No reviews submitted'}
            </h3>
            <p className="text-slate-500 mt-2">
              {isInternalOperator
                ? 'Open a review to collect structured client delivery feedback.'
                : 'Weekly delivery reviews will appear here once assigned or submitted.'}
            </p>
            {isInternalOperator && (
              <button
                onClick={openOpenModal}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Open Weekly Review
              </button>
            )}
          </div>
        ) : (
          visibleReviews.map(rev => (
            <div
              key={rev.id}
              onClick={() => handleSelectReview(rev)}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-gold/50 hover:shadow-md cursor-pointer transition-all group flex items-center justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg flex-shrink-0 mt-1 bg-blue-50 text-blue-600">
                  <Rocket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy">
                    Week of {fmtDay(rev.review_period_start)}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                    <span>{rev.entity}</span>
                    <span>•</span>
                    <ResponsibilityBadge value={reviewResponsibility(rev)} />
                    {rev.archived_at && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-500 border-slate-200">Archived</span>
                    )}
                    <span className={cx("px-2 py-0.5 rounded-full text-xs font-bold border", STATUS_BADGE[rev.review_status] || STATUS_BADGE['Not Opened'])}>{rev.review_status}</span>
                    {isInternalOperator && rev.assigned_contributor_user_id ? (
                      <>
                        <span>•</span>
                        <span>Assigned: {rev.assigned_contributor_name || contributorMap[rev.assigned_contributor_user_id] || 'Contributor'}</span>
                      </>
                    ) : isInternalOperator && (
                      <>
                        <span>•</span>
                        <span>Unassigned</span>
                      </>
                    )}
                    {rev.overall_delivery && (
                      <>
                        <span>•</span>
                        <span>Overall: <span className="font-bold text-navy">{rev.overall_delivery}</span></span>
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

      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-navy">Open Weekly Review</h2>
              <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleOpenReview} className="p-6 space-y-5">
              {openError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{openError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Entity</label>
                <select
                  value={openForm.entity}
                  onChange={(e) => setOpenForm(prev => ({ ...prev, entity: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                >
                  {REVIEW_ENTITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Period Start</label>
                  <input
                    type="date"
                    value={openForm.periodStart}
                    onChange={(e) => setOpenForm(prev => ({ ...prev, periodStart: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Period End</label>
                  <input
                    type="date"
                    value={openForm.periodEnd}
                    onChange={(e) => setOpenForm(prev => ({ ...prev, periodEnd: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                </div>
              </div>

              {/* Contributor assignment targets client SIGN-IN accounts —
                  parked with SECURE_SIGN_IN_ENABLED; reviews open unassigned. */}
              {SECURE_SIGN_IN_ENABLED && <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Assigned Contributor</label>
                <select
                  value={openForm.contributorUserId}
                  onChange={(e) => setOpenForm(prev => ({ ...prev, contributorUserId: e.target.value }))}
                  disabled={loadingContributors || contributors.length === 0}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
                >
                  <option value="">Unassigned (Optional)</option>
                  {contributors.map(c => (
                    <option key={c.user_id} value={c.user_id}>{c.display_name || c.user_id} ({c.entity_scope})</option>
                  ))}
                </select>
                {!loadingContributors && contributors.length === 0 && (
                  !isAdmin && !selectedAuthorId ? (
                    <p className="text-sm text-red-600 mt-1.5">Select an Active Editor first.</p>
                  ) : contributorsLoadError ? (
                    <p className="text-sm text-red-600 mt-1.5">Unable to load contributors. Please try again.</p>
                  ) : (
                    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                      <p className="font-bold">No client reviewer accounts are active yet.</p>
                      <p className="mt-0.5">
                        Reviewers are secure client sign-ins — not Active Editors. Provision them under
                        <span className="font-bold"> Admin &amp; Settings → Client Access</span>. You can still open this
                        review unassigned: the first eligible client to complete it claims it.
                      </p>
                    </div>
                  )
                )}
              </div>}

              {workPreview.length > 0 && (
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Work Preview (Auto-Linked)</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {workPreview.map(item => (
                      <div key={item.id} className="text-sm text-slate-700 flex items-center gap-2">
                         <Link2 className="w-3.5 h-3.5 text-emerald-600" /> {item.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={opening || loadingContributors}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {opening ? 'Opening...' : 'Open Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
