import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { collaborationService } from '../services/collaborationService';
import { cx } from '../utils/cx';
import {
  deriveConflict, entryDecision, isDiscussEntry,
  CONFLICT_STATUS, CONFLICT_PRESENTATION, DISCUSS_MARKER,
} from '../utils/reviewConflicts';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';

// Compare Feedback (V4A.23): every reviewer pass of one review round, joined
// by review_item_key — never by array order. Desktop reads as a row per
// review item with one column per reviewer; on small screens the reviewer
// responses stack as cards inside each item row (no compressed columns, no
// horizontal page overflow). Text labels always accompany colour and icons.
//
// Consolidation: Embark records the one Final Agreed Instruction for the
// round. It is stored beside the reviewer feedback (separate record) — the
// original responses are read-only here and are never rewritten.

const DECISION_LABEL = {
  approved: 'Approved',
  changes: 'Changes Required',
  discuss: 'Discuss in Meeting',
};

const DECISION_TONE = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  changes: 'bg-gold/10 text-[#795000] border-gold/40',
  discuss: 'bg-slate-800 text-white border-slate-800',
};

function EntryCell({ entry }) {
  if (!entry || entry.review_status === 'Not Reviewed') {
    return <p className="text-xs text-slate-400">Awaiting Reviewer</p>;
  }
  const decision = entryDecision(entry);
  const discuss = isDiscussEntry(entry);
  return (
    <div>
      <span className={cx('inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold', DECISION_TONE[decision])}>
        {DECISION_LABEL[decision]}
      </span>
      <div className="mt-1.5 space-y-1 text-xs text-slate-700">
        {entry.current_concern && <p>{entry.current_concern}</p>}
        {entry.remove_this && <p><span className="font-bold text-slate-500">Remove:</span> {entry.remove_this}</p>}
        {entry.replacement_copy && <p><span className="font-bold text-slate-500">Replace with:</span> {entry.replacement_copy}</p>}
        {entry.copy_treatment && <p><span className="font-bold text-slate-500">Copy treatment:</span> {entry.copy_treatment}</p>}
        {entry.visual_direction && <p><span className="font-bold text-slate-500">Visual:</span> {entry.visual_direction}</p>}
        {entry.structure_changes && <p><span className="font-bold text-slate-500">Structure:</span> {entry.structure_changes}</p>}
        {entry.additional_comments && (
          <p>{discuss ? entry.additional_comments.replace(DISCUSS_MARKER, '').trim() : entry.additional_comments}</p>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Saved {new Date(entry.updated_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

export default function ReviewComparisonPanel({ prog, round, selectedAuthorId, isEmbarkEditor, onClose }) {
  const passes = round.passes;
  const config = GUIDED_REVIEW_CONFIGS[passes[0]?.template_id] || GUIDED_REVIEW_CONFIGS[prog.createTemplateId];
  const items = config?.items || [];

  const [entriesByPass, setEntriesByPass] = useState(null); // { [passId]: { [itemKey]: entry } }
  const [loadError, setLoadError] = useState(null);
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Consolidation
  const [consolidation, setConsolidation] = useState(null);
  const [finalInstruction, setFinalInstruction] = useState('');
  const [drivingRequestId, setDrivingRequestId] = useState('');
  const [savingConsolidation, setSavingConsolidation] = useState(false);
  const [consolidationError, setConsolidationError] = useState(null);
  const [consolidationSaved, setConsolidationSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const byPass = {};
        for (const pass of passes) {
          const rows = await collaborationService.getInternalReviewEntries(selectedAuthorId, pass.id);
          const map = {};
          (rows || []).forEach(r => { map[r.review_item_key] = r; });
          byPass[pass.id] = map;
        }
        if (!mounted) return;
        setEntriesByPass(byPass);
        try {
          const c = await collaborationService.getInternalReviewConsolidation(selectedAuthorId, round.groupId);
          if (!mounted) return;
          setConsolidation(c);
          if (c) {
            setFinalInstruction(c.final_instruction || '');
            setDrivingRequestId(c.driving_request_id || '');
          }
        } catch (err) {
          console.error(err);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setLoadError('The reviewer feedback could not be loaded for comparison. Please try again.');
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.groupId, selectedAuthorId]);

  const savedEntriesFor = (itemKey) =>
    passes.map(p => entriesByPass?.[p.id]?.[itemKey]).filter(e => e && e.review_status !== 'Not Reviewed');

  const statusFor = (itemKey) => deriveConflict(savedEntriesFor(itemKey), passes.length);

  const needsAttention = (status) => [
    CONFLICT_STATUS.APPROVAL_CONFLICT,
    CONFLICT_STATUS.DIFFERENT_FEEDBACK,
    CONFLICT_STATUS.DISCUSS_IN_MEETING,
  ].includes(status);

  const statusCounts = items.reduce((acc, it) => {
    const s = entriesByPass ? statusFor(it.key) : null;
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const visibleItems = attentionOnly && entriesByPass
    ? items.filter(it => needsAttention(statusFor(it.key)))
    : items;

  const handleSaveConsolidation = async () => {
    setSavingConsolidation(true);
    setConsolidationError(null);
    setConsolidationSaved(false);
    try {
      const saved = await collaborationService.saveInternalReviewConsolidation({
        authorId: selectedAuthorId,
        reviewGroupId: round.groupId,
        finalInstruction: finalInstruction.trim(),
        drivingRequestId: drivingRequestId || null,
      });
      setConsolidation(saved);
      setConsolidationSaved(true);
    } catch (err) {
      console.error(err);
      setConsolidationError(err.message || 'The final agreed instruction could not be saved. Please try again.');
    } finally {
      setSavingConsolidation(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Compare reviewer feedback">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl my-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 sticky top-0 bg-white rounded-t-xl z-10">
          <div className="min-w-0">
            <h3 className="text-xl font-black text-navy">Compare Feedback — {prog.title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {passes.map(p => p.reviewer_display_name || 'Reviewer').join(' · ')} — responses matched {config?.itemNoun ? `per ${config.itemNoun.toLowerCase()}` : 'per review item'}. Reviewer feedback here is read-only.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close comparison" className="rounded p-1.5 text-slate-400 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {loadError && (
            <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
            </p>
          )}
          {!entriesByPass && !loadError && <p className="text-slate-500">Loading reviewer feedback…</p>}

          {entriesByPass && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {Object.entries(statusCounts).map(([status, count]) => {
                  const pres = CONFLICT_PRESENTATION[status] || {};
                  return (
                    <span key={status} className={cx('rounded-full border px-2.5 py-1 text-[11px] font-bold', pres.tone)}>
                      <span aria-hidden="true">{pres.icon}</span> {status}: {count}
                    </span>
                  );
                })}
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={attentionOnly}
                    onChange={() => setAttentionOnly(v => !v)}
                    className="h-4 w-4 rounded border-slate-300 text-gold focus:ring-gold"
                  />
                  Show only items needing attention
                </label>
              </div>

              <div className="space-y-3">
                {visibleItems.length === 0 && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    Nothing needs attention — every compared {config?.itemNoun?.toLowerCase() || 'item'} is aligned or awaiting a reviewer.
                  </p>
                )}
                {visibleItems.map(it => {
                  const status = statusFor(it.key);
                  const pres = CONFLICT_PRESENTATION[status] || {};
                  return (
                    <div key={it.key} className="rounded-lg border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                        <p className="min-w-0 text-sm font-bold text-navy">
                          {config?.itemNoun || 'Item'} {it.number} — {it.title}
                        </p>
                        <span className={cx('shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', pres.tone)}>
                          <span aria-hidden="true">{pres.icon}</span> {status}
                        </span>
                      </div>
                      {/* Stacked on mobile; one column per reviewer from md up. */}
                      <div className={cx('grid gap-3 p-3', passes.length === 2 ? 'md:grid-cols-2' : passes.length >= 3 ? 'md:grid-cols-3' : '')}>
                        {passes.map(pass => (
                          <div key={pass.id} className="min-w-0 rounded-lg border border-slate-100 bg-white p-2.5">
                            <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-400">
                              {pass.reviewer_display_name || 'Reviewer'}
                            </p>
                            <EntryCell entry={entriesByPass[pass.id]?.[it.key]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Consolidation — Embark's one final agreed instruction for this
                  round, stored beside (never over) the reviewer feedback. */}
              {!round.isLegacy && (
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-black uppercase tracking-wide text-navy">Consolidate Reviewer Feedback</h4>
                  {consolidation && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle className="h-3.5 w-3.5" /> Final agreed instruction recorded by {consolidation.decided_by_label}
                      {consolidation.updated_at ? ` — ${new Date(consolidation.updated_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.
                    </p>
                  )}
                  {isEmbarkEditor ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-navy mb-1" htmlFor="final-agreed-instruction">Final Agreed Instruction</label>
                        <textarea
                          id="final-agreed-instruction"
                          value={finalInstruction}
                          onChange={e => setFinalInstruction(e.target.value)}
                          rows={4}
                          placeholder="The single consolidated instruction that will drive production — resolved conflicts, meeting outcomes and the agreed direction."
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 focus:border-gold focus:ring-2 focus:ring-gold/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-navy mb-1" htmlFor="driving-review-select">Which review drives production? <span className="font-normal text-slate-400">(optional)</span></label>
                        <select
                          id="driving-review-select"
                          value={drivingRequestId}
                          onChange={e => setDrivingRequestId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 focus:border-gold focus:ring-2 focus:ring-gold/30"
                        >
                          <option value="">The final agreed instruction stands on its own</option>
                          {passes.map(p => (
                            <option key={p.id} value={p.id}>{p.reviewer_display_name || p.title}'s review</option>
                          ))}
                        </select>
                      </div>
                      {consolidationError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{consolidationError}</p>
                      )}
                      {consolidationSaved && (
                        <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" /> Final agreed instruction saved. Reviewer feedback above remains unchanged.
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveConsolidation}
                          disabled={savingConsolidation || !finalInstruction.trim()}
                          className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 disabled:opacity-50"
                        >
                          {savingConsolidation ? 'Saving…' : consolidation ? 'Update Final Agreed Instruction' : 'Save Final Agreed Instruction'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      {consolidation ? (
                        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{consolidation.final_instruction}</p>
                      ) : (
                        <p className="text-xs text-slate-500">🔒 Consolidating reviewer feedback is an Embark Digitals decision — switch the Active Editor to an Embark member to record the final agreed instruction.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
