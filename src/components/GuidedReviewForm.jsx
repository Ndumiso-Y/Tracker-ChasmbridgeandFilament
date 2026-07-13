import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Send, AlertCircle, ExternalLink } from 'lucide-react';
import { collaborationService } from '../services/collaborationService';
import { cx } from '../utils/cx';

// Guided all-pages / all-slides review (V4A.10). One client_input_request,
// many client_input_review_entries — every "N/A — No Changes Required" and
// every "Save & Next" persists to Supabase immediately, so the reviewer can
// stop at any item, navigate away, and resume exactly where they left off.
// Nothing lives only in React state.

const EDITABLE_STATUSES = ['Draft', 'Client Input Required', 'Client Input In Progress', 'Clarification Required'];
const COPY_TREATMENT_OPTIONS = [
  'Use Exact Copy as Supplied',
  'Embark May Refine Grammar Only',
  'Embark May Professionally Rewrite for Approval',
  'Requires Discussion',
];

const EMPTY_FIELDS = {
  current_concern: '', remove_this: '', replacement_copy: '', copy_treatment: '',
  visual_direction: '', structure_changes: '', additional_comments: '',
};

const STATUS_DOT = {
  'Not Reviewed': 'bg-slate-200 text-slate-500 border-slate-300',
  'Changes Added': 'bg-gold text-navy border-gold',
  'No Changes Required': 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

const DISCUSS_MARKER = 'DISCUSS IN MEETING:';

const WEBSITE_FIELD_LABELS = {
  current_concern: 'Corrected Wording',
  remove_this: 'Information to Remove',
  replacement_copy: 'Information to Add',
  visual_direction: 'Image or Photograph Change',
  structure_changes: 'Layout or Section Order Change',
  additional_comments: 'Additional Comments',
};

const WEBSITE_EMPHASIS_FIELDS = {
  people: [
    ['current_concern', 'Name or Position Change'],
    ['replacement_copy', 'Biography or Profile Change'],
    ['visual_direction', 'Photograph Change'],
    ['structure_changes', 'Person to Add or Remove'],
    ['additional_comments', 'Additional Comments'],
  ],
  facts: [
    ['current_concern', 'Fact or Figure Correction'],
    ['replacement_copy', 'Claim Requiring Qualification'],
    ['remove_this', 'Reference to Add or Remove'],
    ['additional_comments', 'Additional Comments'],
  ],
  header: [
    ['current_concern', 'Logo or Branding Change'],
    ['replacement_copy', 'Navigation or Link Change'],
    ['remove_this', 'Contact Detail Change'],
    ['visual_direction', 'Social Media Link Change'],
    ['additional_comments', 'Additional Comments'],
  ],
  visual: [
    ['visual_direction', 'Image or Visual Change'],
    ['current_concern', 'Diagram Change'],
    ['structure_changes', 'Colour or Visual Change'],
    ['additional_comments', 'Additional Comments'],
  ],
  programme: [
    ['current_concern', 'Programme Detail Correction'],
    ['replacement_copy', 'Eligibility or Qualification Change'],
    ['remove_this', 'Application Process Change'],
    ['structure_changes', 'Date or Deadline Change'],
    ['additional_comments', 'Additional Comments'],
  ],
  forms: [
    ['current_concern', 'Form Field Change'],
    ['replacement_copy', 'Enquiry Process Change'],
    ['remove_this', 'Application Requirement Change'],
    ['additional_comments', 'Confirmation Message Change'],
  ],
};

export default function GuidedReviewForm({ request, config, isInternal, selectedAuthorId, onSubmitted }) {
  const items = config.items;
  const isWebsiteReview = config.reviewKind === 'website';
  const isStrategyReview = config.reviewKind === 'social-strategy';
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [index, setIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [changesChoice, setChangesChoice] = useState(null); // 'yes' | 'na' | 'discuss' | null
  const [saveState, setSaveState] = useState(null); // 'saving' | 'saved' | 'failed'
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const isSubmittedState = !EDITABLE_STATUSES.includes(request.status);
  const canEdit = !isSubmittedState && (!isInternal || !!selectedAuthorId);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const rows = isInternal
          ? await collaborationService.getInternalReviewEntries(selectedAuthorId, request.id)
          : await collaborationService.getReviewEntries(request.id);
        if (!mounted) return;
        const map = {};
        (rows || []).forEach(r => { map[r.review_item_key] = r; });
        setEntries(map);
        // Resume at the first item not yet reviewed; all-done goes straight
        // to the summary.
        const firstPending = items.findIndex(it => !map[it.key] || map[it.key].review_status === 'Not Reviewed');
        if (firstPending === -1) {
          setShowSummary(true);
        } else {
          setIndex(firstPending);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setLoadError('Unable to load review progress. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const currentItem = items[index];

  // Rehydrate the form whenever the reviewer lands on an item.
  useEffect(() => {
    if (!currentItem) return;
    const entry = entries[currentItem.key];
    if (entry) {
      const isDiscussEntry = isStrategyReview
        && entry.review_status === 'Changes Added'
        && (entry.additional_comments || '').startsWith(DISCUSS_MARKER);
      setFields({
        current_concern: entry.current_concern || '',
        remove_this: entry.remove_this || '',
        replacement_copy: entry.replacement_copy || '',
        copy_treatment: entry.copy_treatment || '',
        visual_direction: entry.visual_direction || '',
        structure_changes: entry.structure_changes || '',
        additional_comments: isDiscussEntry
          ? (entry.additional_comments || '').replace(DISCUSS_MARKER, '').trim()
          : entry.additional_comments || '',
      });
      setChangesChoice(isDiscussEntry ? 'discuss' : entry.review_status === 'Changes Added' ? 'yes' : entry.review_status === 'No Changes Required' ? 'na' : null);
    } else {
      setFields(EMPTY_FIELDS);
      setChangesChoice(null);
    }
    setSaveState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, loading]);

  const counts = (() => {
    let changesAdded = 0, noChanges = 0;
    items.forEach(it => {
      const s = entries[it.key]?.review_status;
      if (s === 'Changes Added') changesAdded += 1;
      else if (s === 'No Changes Required') noChanges += 1;
    });
    return { total: items.length, changesAdded, noChanges, notReviewed: items.length - changesAdded - noChanges };
  })();

  const prepareFieldsForPersist = (reviewStatus, f, choice = changesChoice) => {
    if (!isStrategyReview) return f;
    const next = { ...EMPTY_FIELDS, ...f };
    if (reviewStatus === 'No Changes Required') return EMPTY_FIELDS;
    if (choice === 'discuss') {
      const discussion = (next.additional_comments || '').replace(DISCUSS_MARKER, '').trim();
      return {
        ...EMPTY_FIELDS,
        additional_comments: discussion ? `${DISCUSS_MARKER} ${discussion}` : DISCUSS_MARKER,
      };
    }
    return next;
  };

  const persistEntry = async (item, reviewStatus, f, choice = changesChoice) => {
    setSaveState('saving');
    const preparedFields = prepareFieldsForPersist(reviewStatus, f, choice);
    try {
      let row;
      if (isInternal) {
        row = await collaborationService.upsertInternalReviewEntry({
          authorId: selectedAuthorId,
          requestId: request.id,
          reviewItemKey: item.key,
          reviewItemType: config.reviewItemType,
          reviewItemNumber: item.number,
          reviewItemTitle: item.title,
          reviewGroup: item.group,
          reviewStatus,
          currentConcern: preparedFields.current_concern,
          removeThis: preparedFields.remove_this,
          replacementCopy: preparedFields.replacement_copy,
          copyTreatment: preparedFields.copy_treatment,
          visualDirection: preparedFields.visual_direction,
          structureChanges: preparedFields.structure_changes,
          additionalComments: preparedFields.additional_comments,
        });
      } else {
        row = await collaborationService.upsertReviewEntry({
          request_id: request.id,
          review_item_key: item.key,
          review_item_type: config.reviewItemType,
          review_item_number: item.number,
          review_item_title: item.title,
          review_group: item.group,
          review_status: reviewStatus,
          current_concern: preparedFields.current_concern || null,
          remove_this: preparedFields.remove_this || null,
          replacement_copy: preparedFields.replacement_copy || null,
          copy_treatment: preparedFields.copy_treatment || null,
          visual_direction: preparedFields.visual_direction || null,
          structure_changes: preparedFields.structure_changes || null,
          additional_comments: preparedFields.additional_comments || null,
        });
      }
      setEntries(prev => ({ ...prev, [item.key]: row }));
      setSaveState('saved');
      return true;
    } catch (err) {
      console.error(err);
      setSaveState('failed');
      return false;
    }
  };

  const advance = () => {
    if (index < items.length - 1) setIndex(index + 1);
    else setShowSummary(true);
  };

  const handleNoChanges = async () => {
    const ok = await persistEntry(currentItem, 'No Changes Required', EMPTY_FIELDS, 'na');
    if (ok) advance();
  };

  const handleSaveAndNext = async () => {
    const ok = await persistEntry(currentItem, 'Changes Added', fields, changesChoice);
    if (ok) advance();
  };

  // Data-loss guard (V4A.16): typed feedback on the CURRENT item must never
  // be silently discarded by navigation. Anything meaningful that differs
  // from the saved entry is auto-saved before moving; a failed auto-save
  // blocks the move and shows the failure instead of losing text.
  const fieldsOfEntry = (entry) => ({
    current_concern: entry?.current_concern || '',
    remove_this: entry?.remove_this || '',
    replacement_copy: entry?.replacement_copy || '',
    copy_treatment: entry?.copy_treatment || '',
    visual_direction: entry?.visual_direction || '',
    structure_changes: entry?.structure_changes || '',
    additional_comments: entry?.additional_comments || '',
  });

  const hasUnsavedTyping = () => {
    if (!canEdit || showSummary || !currentItem) return false;
    const saved = fieldsOfEntry(entries[currentItem.key]);
    const differs = JSON.stringify(saved) !== JSON.stringify(fields);
    return differs && (changesChoice === 'yes' || changesChoice === 'discuss' || Object.values(fields).some(v => (v || '').trim() !== ''));
  };

  const saveIfDirty = async () => {
    if (!hasUnsavedTyping()) return true;
    return await persistEntry(currentItem, 'Changes Added', fields, changesChoice);
  };

  const navigateTo = async (i) => {
    const ok = await saveIfDirty();
    if (!ok) return; // failure is visible; the reviewer stays on the item
    setShowSummary(false);
    setIndex(i);
  };

  // Browser-level guard: refreshing or closing the tab with unsaved typing
  // on the current item asks for confirmation first.
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedTyping()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, changesChoice, entries, index, showSummary, canEdit]);

  const handleSubmitAll = async () => {
    if (counts.notReviewed > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let updated;
      if (isInternal) {
        updated = await collaborationService.submitInternalClientInputReview(selectedAuthorId, request.id);
      } else {
        updated = await collaborationService.updateRequest(request.id, {
          status: 'Ready for Embark Review',
          submitted_at: new Date().toISOString(),
        });
      }
      onSubmitted?.(updated);
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || 'Submission failed. Your review progress is saved — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const websiteFieldRows = isWebsiteReview
    ? (WEBSITE_EMPHASIS_FIELDS[currentItem?.emphasis] || [
      ['current_concern', WEBSITE_FIELD_LABELS.current_concern],
      ['replacement_copy', WEBSITE_FIELD_LABELS.replacement_copy],
      ['remove_this', WEBSITE_FIELD_LABELS.remove_this],
      ['visual_direction', WEBSITE_FIELD_LABELS.visual_direction],
      ['structure_changes', WEBSITE_FIELD_LABELS.structure_changes],
      ['additional_comments', WEBSITE_FIELD_LABELS.additional_comments],
    ])
    : [];

  if (loading) return <div className="p-6 text-slate-500">Loading review progress...</div>;
  if (loadError) return <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{loadError}</div>;
  if (isInternal && !selectedAuthorId && !isSubmittedState) {
    return <div className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">Select an Active Editor in the sidebar to work on this review.</div>;
  }

  // Navigator grouped by presentation section (43 slides read far better as
  // seven labelled rows than one flat strip; the 16 profile pages have no
  // groups and stay as a single row). Each group shows its own reviewed
  // count so long reviews communicate section-level progress at a glance.
  const navigatorGroups = (() => {
    const groups = [];
    items.forEach((it, i) => {
      const label = it.group || null;
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, entries: [] });
      groups[groups.length - 1].entries.push({ item: it, index: i });
    });
    return groups;
  })();

  const navigator = (
    <div className="px-6 pt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300" /> Not Reviewed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gold border border-gold" /> Changes Added</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" /> No Changes Required</span>
      </div>
      {navigatorGroups.map((g, gi) => {
        const reviewedInGroup = g.entries.filter(({ item }) => (entries[item.key]?.review_status || 'Not Reviewed') !== 'Not Reviewed').length;
        return (
          <div key={g.label || gi}>
            {g.label && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                {g.label.replace(/^Section \d+ — /, '')} <span className="text-slate-300">· {reviewedInGroup}/{g.entries.length}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {g.entries.map(({ item: it, index: i }) => {
                const status = entries[it.key]?.review_status || 'Not Reviewed';
                return (
                  <button
                    key={it.key}
                    type="button"
                    title={`${config.itemNoun} ${it.number}: ${it.title} — ${status}`}
                    onClick={() => navigateTo(i)}
                    className={cx(
                      "w-8 h-8 rounded-md border text-xs font-black transition",
                      STATUS_DOT[status],
                      !showSummary && i === index && "ring-2 ring-navy ring-offset-1"
                    )}
                  >
                    {it.number}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (showSummary || isSubmittedState) {
    return (
      <div>
        {!isSubmittedState && navigator}
        <div className="p-6">
          <h3 className="text-lg font-bold text-navy mb-1">Review Summary</h3>
          {isSubmittedState && (
            <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              <CheckCircle className="w-4 h-4" /> Submitted to Embark successfully{request.submitted_at ? ` on ${new Date(request.submitted_at).toLocaleDateString('en-ZA')}` : ''} — everything requested is recorded below.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-black text-navy">{counts.total}</p>
              <p className="text-xs font-bold text-slate-500">{config.itemNoun}s</p>
            </div>
            <div className="bg-gold/10 border border-gold/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-black text-navy">{counts.changesAdded}</p>
              <p className="text-xs font-bold text-slate-500">Changes Added</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-black text-emerald-700">{counts.noChanges}</p>
              <p className="text-xs font-bold text-slate-500">No Changes Required</p>
            </div>
            <div className={cx("border rounded-lg p-3 text-center", counts.notReviewed > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
              <p className={cx("text-2xl font-black", counts.notReviewed > 0 ? "text-amber-700" : "text-slate-400")}>{counts.notReviewed}</p>
              <p className="text-xs font-bold text-slate-500">Not Reviewed</p>
            </div>
          </div>

          {counts.changesAdded > 0 && (
            <div className="space-y-3 mb-6">
              <h4 className="text-sm font-bold text-navy uppercase tracking-wider">Changes Requested</h4>
              {items.filter(it => entries[it.key]?.review_status === 'Changes Added').map(it => {
                const e = entries[it.key];
                return (
                  <div key={it.key} className="bg-white border border-slate-200 rounded-lg p-4">
                    <p className="font-bold text-navy text-sm">{config.itemNoun} {it.number} — {it.title}</p>
                    {it.group && <p className="text-xs text-slate-400 mt-0.5">{it.group}</p>}
                    <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                      {e.current_concern && <p><span className="font-bold text-slate-500">Concern:</span> {e.current_concern}</p>}
                      {e.remove_this && <p><span className="font-bold text-slate-500">Remove:</span> {e.remove_this}</p>}
                      {e.replacement_copy && <p><span className="font-bold text-slate-500">Replace with:</span> {e.replacement_copy}</p>}
                      {e.copy_treatment && <p><span className="font-bold text-slate-500">Copy treatment:</span> {e.copy_treatment}</p>}
                      {e.visual_direction && <p><span className="font-bold text-slate-500">Visual direction:</span> {e.visual_direction}</p>}
                      {e.structure_changes && <p><span className="font-bold text-slate-500">Order / structure:</span> {e.structure_changes}</p>}
                      {e.additional_comments && <p><span className="font-bold text-slate-500">Comments:</span> {e.additional_comments}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isSubmittedState && (
            <>
              {counts.notReviewed > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {counts.notReviewed} {config.itemNoun.toLowerCase()}{counts.notReviewed === 1 ? '' : 's'} still need{counts.notReviewed === 1 ? 's' : ''} review before you can submit. Use the numbered navigator above to jump to them.
                </p>
              )}
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{submitError}</div>
              )}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  disabled={counts.notReviewed > 0 || submitting || !canEdit}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : (config.submitLabel || 'Submit All Feedback to Embark')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const entryStatus = entries[currentItem.key]?.review_status || 'Not Reviewed';

  return (
    <div>
      {navigator}
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-gold">
            {isStrategyReview ? '3-MONTH SOCIAL MEDIA STRATEGY REVIEW' : `${config.itemNoun} ${currentItem.number} of ${items.length}`}
          </p>
          <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full border", STATUS_DOT[entryStatus])}>{entryStatus}</span>
        </div>
        {isStrategyReview && (
          <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-400">
            {config.itemNoun} {currentItem.number} of {items.length}
          </p>
        )}
        {currentItem.group && <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{currentItem.group.replace(/^Section \d+ — /, '')}</p>}
        <h3 className="text-xl font-bold text-navy mb-4">{currentItem.title}</h3>

        {isWebsiteReview && (
          <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Page</p>
                <p className="text-sm font-bold text-navy">{currentItem.page}</p>
              </div>
              <a
                href={currentItem.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-navy hover:border-gold hover:bg-gold/10"
              >
                Open Live Page <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {currentItem.approvalRequired && (
              <p className="mt-3 inline-flex rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#795000]">
                Facts and details require approval
              </p>
            )}
            {currentItem.contentStatus && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Content Status</p>
                <p className="mt-0.5 text-sm font-bold text-navy">{currentItem.contentStatus}</p>
              </div>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Current Website Content</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{currentItem.contentSummary}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Visible Elements</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {(currentItem.visibleElements || []).map(element => <li key={element}>- {element}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">What to Review</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {(currentItem.reviewFocus || []).map(focus => <li key={focus}>- {focus}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {isStrategyReview && (
          <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Organisation</p>
                <p className="text-sm font-bold text-navy">{currentItem.organisation}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Strategy Period</p>
                <p className="text-sm font-bold text-navy">{currentItem.strategyPeriod}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Section</p>
                <p className="text-sm font-bold text-navy">Section {currentItem.number} of {items.length}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Current Strategy Summary</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{currentItem.currentStrategy}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Key Decisions</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {(currentItem.keyDecisions || []).map(decision => <li key={decision}>- {decision}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Review Questions</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {(currentItem.reviewQuestions || []).map(question => <li key={question}>- {question}</li>)}
                </ul>
              </div>
            </div>

            {currentItem.approvalFlags?.length > 0 && (
              <div className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-[#795000]">Items Requiring Confirmation</p>
                <ul className="mt-1 space-y-1 text-sm text-[#5f4300]">
                  {currentItem.approvalFlags.map(flag => <li key={flag}>- {flag}</li>)}
                </ul>
              </div>
            )}

            {currentItem.calendarRows?.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2 font-black uppercase tracking-wide">Date</th>
                      <th className="p-2 font-black uppercase tracking-wide">Pillar</th>
                      <th className="p-2 font-black uppercase tracking-wide">Topic</th>
                      <th className="p-2 font-black uppercase tracking-wide">Format</th>
                      <th className="p-2 font-black uppercase tracking-wide">Strategic Purpose</th>
                      <th className="p-2 font-black uppercase tracking-wide">Audience</th>
                      <th className="p-2 font-black uppercase tracking-wide">CTA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentItem.calendarRows.map((row, rowIndex) => (
                      <tr key={`${currentItem.key}-calendar-${rowIndex}`} className="align-top">
                        <td className="p-2 font-bold text-navy">{row.date}</td>
                        <td className="p-2 text-slate-700">{row.pillar}</td>
                        <td className="p-2 text-slate-700">{row.topic}</td>
                        <td className="p-2 text-slate-700">{row.format}</td>
                        <td className="p-2 text-slate-700">{row.strategicPurpose}</td>
                        <td className="p-2 text-slate-700">{row.primaryAudience}</td>
                        <td className="p-2 text-slate-700">{row.cta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mb-5">
          <p className="text-sm font-bold text-navy mb-2">Review Status</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setChangesChoice('yes')}
              className={cx(
                "px-4 py-2 rounded-lg border text-sm font-bold transition disabled:opacity-60",
                changesChoice === 'yes' ? "bg-gold border-gold text-navy" : "bg-white border-slate-200 text-slate-600 hover:border-gold"
              )}
            >
              Changes Required
            </button>
            {isStrategyReview && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setChangesChoice('discuss')}
                className={cx(
                  "px-4 py-2 rounded-lg border text-sm font-bold transition disabled:opacity-60",
                  changesChoice === 'discuss' ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-500"
                )}
              >
                Discuss in Meeting
              </button>
            )}
            <button
              type="button"
              disabled={!canEdit || saveState === 'saving'}
              onClick={handleNoChanges}
              className={cx(
                "px-4 py-2 rounded-lg border text-sm font-bold transition disabled:opacity-60",
                changesChoice === 'na' ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"
              )}
            >
              {isStrategyReview ? 'Approve This Section' : 'No Changes Required'}
            </button>
          </div>
        </div>

        {(changesChoice === 'yes' || changesChoice === 'discuss') && (
          <div className="space-y-4 mb-5">
            {isStrategyReview && changesChoice === 'yes' && (
              <>
                <GuidedField label="What should be changed?" value={fields.current_concern} onChange={(v) => setFields(p => ({ ...p, current_concern: v }))} disabled={!canEdit} rows={4} />
                <GuidedField label={currentItem.changeHint || 'Optional: specific wording, date, audience or calendar change'} value={fields.replacement_copy} onChange={(v) => setFields(p => ({ ...p, replacement_copy: v }))} disabled={!canEdit} rows={3} />
              </>
            )}
            {isStrategyReview && changesChoice === 'discuss' && (
              <GuidedField label="What should we discuss?" value={fields.additional_comments} onChange={(v) => setFields(p => ({ ...p, additional_comments: v }))} disabled={!canEdit} rows={4} />
            )}
            {isWebsiteReview && (
              <>
                {websiteFieldRows.map(([key, label]) => (
                  <GuidedField
                    key={`${currentItem.key}-${key}-${label}`}
                    label={label}
                    value={fields[key]}
                    onChange={(v) => setFields(p => ({ ...p, [key]: v }))}
                    disabled={!canEdit}
                    rows={key === 'replacement_copy' || key === 'additional_comments' ? 4 : 2}
                  />
                ))}
                {!websiteFieldRows.some(([key]) => key === 'copy_treatment') && (
                  <GuidedField label="Logo or Branding Change" value={fields.copy_treatment} onChange={(v) => setFields(p => ({ ...p, copy_treatment: v }))} disabled={!canEdit} />
                )}
                {!websiteFieldRows.some(([key]) => key === 'additional_comments') && (
                  <GuidedField label="Button, Link or Contact Detail Change" value={fields.additional_comments} onChange={(v) => setFields(p => ({ ...p, additional_comments: v }))} disabled={!canEdit} />
                )}
              </>
            )}
            {!isWebsiteReview && !isStrategyReview && (
              <>
            <GuidedField label="Current Concern" value={fields.current_concern} onChange={(v) => setFields(p => ({ ...p, current_concern: v }))} disabled={!canEdit} />
            <GuidedField label="Remove This" value={fields.remove_this} onChange={(v) => setFields(p => ({ ...p, remove_this: v }))} disabled={!canEdit} />
            <GuidedField label="Replace with This Exact Wording" value={fields.replacement_copy} onChange={(v) => setFields(p => ({ ...p, replacement_copy: v }))} disabled={!canEdit} rows={4} />
            <div>
              <label className="block text-sm font-bold text-navy mb-1.5">Copy Treatment</label>
              <p className="text-xs text-slate-400 mb-1.5">Tell Embark how strictly to treat your wording — use it exactly as supplied, tidy the grammar only, or professionally rewrite it for your approval.</p>
              <select
                value={fields.copy_treatment}
                onChange={(e) => setFields(p => ({ ...p, copy_treatment: e.target.value }))}
                disabled={!canEdit}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
              >
                <option value="">Select copy treatment...</option>
                {COPY_TREATMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <GuidedField label="Image / Visual Direction" value={fields.visual_direction} onChange={(v) => setFields(p => ({ ...p, visual_direction: v }))} disabled={!canEdit} />
            <GuidedField label="Order / Structure Changes" value={fields.structure_changes} onChange={(v) => setFields(p => ({ ...p, structure_changes: v }))} disabled={!canEdit} />
            <GuidedField label="Additional Comments" value={fields.additional_comments} onChange={(v) => setFields(p => ({ ...p, additional_comments: v }))} disabled={!canEdit} />
              </>
            )}
          </div>
        )}

        {saveState === 'saved' && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            <CheckCircle className="w-3.5 h-3.5" /> {config.itemNoun} {currentItem.number} saved successfully.
          </p>
        )}
        {saveState === 'failed' && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            <AlertCircle className="w-3.5 h-3.5" /> Save failed — your typing is still on screen and was NOT stored. Please try again.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => (index > 0 ? navigateTo(index - 1) : null)}
            disabled={index === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => { if (await saveIfDirty()) setShowSummary(true); }}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Review Summary
            </button>
            {changesChoice === 'yes' || changesChoice === 'discuss' ? (
              <button
                type="button"
                onClick={handleSaveAndNext}
                disabled={!canEdit || saveState === 'saving'}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Saving...' : (isWebsiteReview || isStrategyReview ? 'Save & Continue' : 'Save & Next')} <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={advance}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:border-gold rounded-lg transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {canEdit && (
          <p className="mt-3 text-xs text-slate-400">
            Every {config.itemNoun.toLowerCase()} saves as you go — you can leave and resume anytime without losing feedback.
            Nothing is sent to Embark until you review everything on the summary and submit.
          </p>
        )}
      </div>
    </div>
  );
}

function GuidedField({ label, value, onChange, disabled, rows = 2 }) {
  return (
    <div>
      <label className="block text-sm font-bold text-navy mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold disabled:bg-slate-50"
      />
    </div>
  );
}
