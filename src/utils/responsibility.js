// Responsibility interpretation layer (V4A.12).
// The database keeps lifecycle statuses and request origins; the interface
// answers the only question an operator actually asks: WHO NEEDS TO ACT?
// These helpers derive that answer from existing canonical fields — they
// never write anything and never replace the underlying lifecycle truth.

export const RESPONSIBILITY = {
  EMBARK: 'Needs Embark',
  CLIENT: 'Needs Client',
  // Status-context value, not a competing "who acts?" answer: a Resolved
  // ticket is the CLIENT's to act on (confirm or reject), so its
  // responsibility badge reads Needs Client while the status line reads
  // "Resolved — Awaiting Client Confirmation". One badge system, one grammar.
  CONFIRM: 'Awaiting Client Confirmation',
  BLOCKED: 'Blocked',
  DONE: 'Completed',
  DRAFT: 'Draft',
};

// support_tickets: New/Open/investigating states are Embark's to act on;
// Resolved means Embark has proposed resolution and only the client may
// confirm or reject it — that is a client action, so responsibility is
// Needs Client (the Awaiting-Confirmation nuance lives in the status text);
// Closed is finished. Silence never closes a ticket.
export function ticketResponsibility(ticket) {
  if (!ticket) return RESPONSIBILITY.EMBARK;
  if (ticket.status === 'Closed') return RESPONSIBILITY.DONE;
  if (ticket.status === 'Resolved') return RESPONSIBILITY.CLIENT;
  if (['Waiting on Client', 'Awaiting Client Confirmation'].includes(ticket.status)) return RESPONSIBILITY.CLIENT;
  return RESPONSIBILITY.EMBARK;
}

// client_input_requests lifecycle → acting side. 'Clarification Required'
// and 'Client Review' are client-side waits; 'Changes Requested' means the
// client sent work back to Embark.
export function requestResponsibility(req) {
  if (!req) return RESPONSIBILITY.EMBARK;
  const s = req.status;
  if (['Approved', 'Delivered'].includes(s)) return RESPONSIBILITY.DONE;
  if (s === 'Draft') return RESPONSIBILITY.DRAFT;
  if (['Client Input Required', 'Client Input In Progress', 'Clarification Required', 'Client Review'].includes(s)) return RESPONSIBILITY.CLIENT;
  return RESPONSIBILITY.EMBARK; // Ready for Embark Review, Requirements Confirmed, In Production, Changes Requested
}

export function reviewResponsibility(review) {
  if (!review) return RESPONSIBILITY.EMBARK;
  if (review.review_status === 'Awaiting Client Review') return RESPONSIBILITY.CLIENT;
  if (review.review_status === 'Submitted') return RESPONSIBILITY.EMBARK;
  return RESPONSIBILITY.DONE; // Reviewed
}

// Consistent visual language: colour supports the label, never replaces it.
export const RESPONSIBILITY_STYLES = {
  [RESPONSIBILITY.EMBARK]: 'border-navy/25 bg-navy/[0.06] text-navy',
  [RESPONSIBILITY.CLIENT]: 'border-amber-300 bg-amber-50 text-amber-800',
  [RESPONSIBILITY.CONFIRM]: 'border-blue-200 bg-blue-50 text-blue-700',
  [RESPONSIBILITY.BLOCKED]: 'border-red-200 bg-red-50 text-red-700',
  [RESPONSIBILITY.DONE]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [RESPONSIBILITY.DRAFT]: 'border-slate-200 bg-slate-100 text-slate-500',
};
