// Persona status language (V4A.15).
// Physical lifecycle statuses stay untouched in the database — this is a
// display-only interpretation layer, the same contract as the ticket
// TICKET_STATUS_DISPLAY map. Internal users read operational language;
// clients read their own language. One mapper, used everywhere a request
// status is shown — never ad-hoc string replacement.

const INTERNAL_REQUEST_STATUS = {
  'Draft': 'Draft',
  'Client Input Required': 'Waiting on Client',
  'Client Input In Progress': 'Client Busy Responding',
  'Clarification Required': 'Clarification Requested from Client',
  'Client Review': 'With Client for Review',
  'Ready for Embark Review': 'Submitted by Client — Review',
  'Changes Requested': 'Client Requested Changes',
  'Requirements Confirmed': 'Requirements Confirmed',
  'In Production': 'In Production',
  'Approved': 'Approved',
  'Delivered': 'Delivered',
};

const CLIENT_REQUEST_STATUS = {
  'Draft': 'Draft',
  'Client Input Required': 'We need your input',
  'Client Input In Progress': 'In progress — continue when ready',
  'Clarification Required': 'We need one clarification from you',
  'Client Review': 'Ready for your review',
  'Ready for Embark Review': 'With Embark',
  'Changes Requested': 'Your changes are with Embark',
  'Requirements Confirmed': 'Confirmed — Embark is working on it',
  'In Production': 'In production with Embark',
  'Approved': 'Approved',
  'Delivered': 'Delivered',
};

export function displayRequestStatus(status, isClient = false) {
  const map = isClient ? CLIENT_REQUEST_STATUS : INTERNAL_REQUEST_STATUS;
  return map[status] || status;
}

// Short provenance captions — request_origin stays stored and shown, but as
// a small human caption, never a raw enum badge in primary card language.
export const REQUEST_ORIGIN_SHORT = {
  'Client-Originated Requirement': 'Client request',
  'Internally Logged Client Requirement': 'Logged for client',
  'Internal Requested Input': 'Embark request',
};
