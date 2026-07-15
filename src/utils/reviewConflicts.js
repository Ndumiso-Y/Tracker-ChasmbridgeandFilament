// Multi-reviewer conflict derivation (V4A.23).
//
// Deterministic and explainable — never semantic/AI comparison. Two change
// requests are "equivalent" only when their meaningful feedback matches after
// safe normalisation (whitespace collapsed, case-insensitive, empty optional
// fields ignored, structured decision values compared exactly). Anything
// else is flagged for human judgement as Different Feedback — the system
// never pretends two different instructions agree.

// The Discuss-in-Meeting marker used by the social strategy review (stored
// inside additional_comments on a 'Changes Added' entry). Single source of
// truth — GuidedReviewForm imports this constant.
export const DISCUSS_MARKER = 'DISCUSS IN MEETING:';

export const CONFLICT_STATUS = {
  ALIGNED_APPROVED: 'Aligned — Approved',
  ALIGNED_CHANGES: 'Aligned — Changes Requested',
  DIFFERENT_FEEDBACK: 'Different Feedback',
  APPROVAL_CONFLICT: 'Approval Conflict',
  DISCUSS_IN_MEETING: 'Discuss in Meeting',
  AWAITING_REVIEWER: 'Awaiting Reviewer',
  PARTIALLY_REVIEWED: 'Partially Reviewed',
};

export function isDiscussEntry(entry) {
  return !!entry
    && entry.review_status === 'Changes Added'
    && (entry.additional_comments || '').startsWith(DISCUSS_MARKER);
}

// 'approved' | 'changes' | 'discuss' for a SAVED entry.
export function entryDecision(entry) {
  if (!entry || entry.review_status === 'Not Reviewed') return null;
  if (entry.review_status === 'No Changes Required') return 'approved';
  if (isDiscussEntry(entry)) return 'discuss';
  return 'changes';
}

const normalise = (v) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();

// The meaningful requested content of a change entry, normalised for the
// deterministic equivalence check. Field order is fixed so the comparison
// is stable; empty optional fields contribute nothing.
export function meaningfulFeedback(entry) {
  if (!entry) return '';
  return [
    entry.current_concern, entry.remove_this, entry.replacement_copy,
    entry.copy_treatment, entry.visual_direction, entry.structure_changes,
    entry.additional_comments,
  ].map(normalise).filter(Boolean).join(' | ');
}

// Derive the combined status for ONE review item across a round's passes.
// savedEntries: the saved (review_status <> 'Not Reviewed') entries for this
// item, one per pass that has responded. totalPasses: how many reviewer
// passes exist in the round.
export function deriveConflict(savedEntries, totalPasses) {
  const saved = (savedEntries || []).filter(e => e && e.review_status !== 'Not Reviewed');
  if (saved.length === 0) return CONFLICT_STATUS.AWAITING_REVIEWER;
  if (saved.length < totalPasses) return CONFLICT_STATUS.PARTIALLY_REVIEWED;

  const decisions = saved.map(entryDecision);
  if (decisions.some(d => d === 'discuss')) return CONFLICT_STATUS.DISCUSS_IN_MEETING;

  const approvals = decisions.filter(d => d === 'approved').length;
  const changes = decisions.filter(d => d === 'changes').length;
  if (approvals > 0 && changes > 0) return CONFLICT_STATUS.APPROVAL_CONFLICT;
  if (changes === 0) return CONFLICT_STATUS.ALIGNED_APPROVED;

  const texts = new Set(saved.map(meaningfulFeedback));
  return texts.size === 1
    ? CONFLICT_STATUS.ALIGNED_CHANGES
    : CONFLICT_STATUS.DIFFERENT_FEEDBACK;
}

// Text-first presentation (colour is never the only signal).
export const CONFLICT_PRESENTATION = {
  [CONFLICT_STATUS.ALIGNED_APPROVED]: { icon: '✓', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  [CONFLICT_STATUS.ALIGNED_CHANGES]: { icon: '✎', tone: 'bg-gold/10 text-[#795000] border-gold/40' },
  [CONFLICT_STATUS.DIFFERENT_FEEDBACK]: { icon: '⇄', tone: 'bg-amber-50 text-amber-800 border-amber-300' },
  [CONFLICT_STATUS.APPROVAL_CONFLICT]: { icon: '!', tone: 'bg-red-50 text-red-700 border-red-200' },
  [CONFLICT_STATUS.DISCUSS_IN_MEETING]: { icon: '💬', tone: 'bg-slate-800 text-white border-slate-800' },
  [CONFLICT_STATUS.AWAITING_REVIEWER]: { icon: '…', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
  [CONFLICT_STATUS.PARTIALLY_REVIEWED]: { icon: '◐', tone: 'bg-slate-50 text-slate-600 border-slate-300' },
};
