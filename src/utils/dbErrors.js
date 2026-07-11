// Product-safe error language for database-dependent actions.
// PostgREST can answer with schema-cache/function details that are useful to
// engineers but unhelpful to programme users. Map those contract mismatches to
// a supportable message while preserving ordinary validation/permission errors.
export function explainDbError(err, contractLabel = 'this workflow') {
  const msg = err?.message || 'The action could not be completed.';
  if (/could not find the function|schema cache/i.test(msg)) {
    return `This action is not available because the live ${contractLabel} contract could not be confirmed. Please ask Embark Digitals to verify the production setup.`;
  }
  // 42702: ambiguous column reference in a live function.
  if (/is ambiguous/i.test(msg)) {
    return `This action is blocked by a live ${contractLabel} contract mismatch. Please ask Embark Digitals to verify the production setup.`;
  }
  return msg;
}
