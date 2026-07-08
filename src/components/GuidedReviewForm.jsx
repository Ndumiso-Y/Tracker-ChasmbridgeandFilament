import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Send, AlertCircle } from 'lucide-react';
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

export default function GuidedReviewForm({ request, config, isInternal, selectedAuthorId, onSubmitted }) {
  const items = config.items;
  const [entries, setEntries] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [index, setIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [changesChoice, setChangesChoice] = useState(null); // 'yes' | 'na' | null
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
      setFields({
        current_concern: entry.current_concern || '',
        remove_this: entry.remove_this || '',
        replacement_copy: entry.replacement_copy || '',
        copy_treatment: entry.copy_treatment || '',
        visual_direction: entry.visual_direction || '',
        structure_changes: entry.structure_changes || '',
        additional_comments: entry.additional_comments || '',
      });
      setChangesChoice(entry.review_status === 'Changes Added' ? 'yes' : entry.review_status === 'No Changes Required' ? 'na' : null);
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

  const persistEntry = async (item, reviewStatus, f) => {
    setSaveState('saving');
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
          currentConcern: f.current_concern,
          removeThis: f.remove_this,
          replacementCopy: f.replacement_copy,
          copyTreatment: f.copy_treatment,
          visualDirection: f.visual_direction,
          structureChanges: f.structure_changes,
          additionalComments: f.additional_comments,
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
          current_concern: f.current_concern || null,
          remove_this: f.remove_this || null,
          replacement_copy: f.replacement_copy || null,
          copy_treatment: f.copy_treatment || null,
          visual_direction: f.visual_direction || null,
          structure_changes: f.structure_changes || null,
          additional_comments: f.additional_comments || null,
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
    const ok = await persistEntry(currentItem, 'No Changes Required', EMPTY_FIELDS);
    if (ok) advance();
  };

  const handleSaveAndNext = async () => {
    const ok = await persistEntry(currentItem, 'Changes Added', fields);
    if (ok) advance();
  };

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

  if (loading) return <div className="p-6 text-slate-500">Loading review progress...</div>;
  if (loadError) return <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{loadError}</div>;
  if (isInternal && !selectedAuthorId && !isSubmittedState) {
    return <div className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">Select an Active Editor in the sidebar to work on this review.</div>;
  }

  const navigator = (
    <div className="px-6 pt-4 flex flex-wrap gap-1.5">
      {items.map((it, i) => {
        const status = entries[it.key]?.review_status || 'Not Reviewed';
        return (
          <button
            key={it.key}
            type="button"
            title={`${config.itemNoun} ${it.number}: ${it.title} — ${status}`}
            onClick={() => { setShowSummary(false); setIndex(i); }}
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
  );

  if (showSummary || isSubmittedState) {
    return (
      <div>
        {!isSubmittedState && navigator}
        <div className="p-6">
          <h3 className="text-lg font-bold text-navy mb-1">Review Summary</h3>
          {isSubmittedState && (
            <p className="text-sm text-emerald-700 font-bold mb-3 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Submitted{request.submitted_at ? ` — ${new Date(request.submitted_at).toLocaleDateString('en-ZA')}` : ''}</p>
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
                  <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit All Feedback to Embark'}
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
            {config.itemNoun} {currentItem.number} of {items.length}
          </p>
          <span className={cx("text-[10px] font-bold px-2 py-0.5 rounded-full border", STATUS_DOT[entryStatus])}>{entryStatus}</span>
        </div>
        {currentItem.group && <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{currentItem.group.replace(/^Section \d+ — /, '')}</p>}
        <h3 className="text-xl font-bold text-navy mb-4">{currentItem.title}</h3>

        <div className="mb-5">
          <p className="text-sm font-bold text-navy mb-2">Are changes required?</p>
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
              Yes — Changes Required
            </button>
            <button
              type="button"
              disabled={!canEdit || saveState === 'saving'}
              onClick={handleNoChanges}
              className={cx(
                "px-4 py-2 rounded-lg border text-sm font-bold transition disabled:opacity-60",
                changesChoice === 'na' ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"
              )}
            >
              N/A — No Changes Required
            </button>
          </div>
        </div>

        {changesChoice === 'yes' && (
          <div className="space-y-4 mb-5">
            <GuidedField label="Current Concern" value={fields.current_concern} onChange={(v) => setFields(p => ({ ...p, current_concern: v }))} disabled={!canEdit} />
            <GuidedField label="Remove This" value={fields.remove_this} onChange={(v) => setFields(p => ({ ...p, remove_this: v }))} disabled={!canEdit} />
            <GuidedField label="Replace with This Exact Wording" value={fields.replacement_copy} onChange={(v) => setFields(p => ({ ...p, replacement_copy: v }))} disabled={!canEdit} rows={4} />
            <div>
              <label className="block text-sm font-bold text-navy mb-1.5">Copy Treatment</label>
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
          </div>
        )}

        {saveState === 'saved' && <p className="text-xs font-bold text-emerald-600 mb-3">Draft saved</p>}
        {saveState === 'failed' && <p className="text-xs font-bold text-red-600 mb-3">Draft save failed — your last change was not stored. Please try again.</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => (index > 0 ? setIndex(index - 1) : null)}
            disabled={index === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Review Summary
            </button>
            {changesChoice === 'yes' ? (
              <button
                type="button"
                onClick={handleSaveAndNext}
                disabled={!canEdit || saveState === 'saving'}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Saving...' : 'Save & Next'} <ChevronRight className="w-4 h-4" />
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
