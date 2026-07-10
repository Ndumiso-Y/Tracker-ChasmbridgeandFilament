// Honest error language for database-dependent actions (V4A.17).
// When a narrow RPC does not exist yet because its migration is pending,
// PostgREST answers "Could not find the function ... in the schema cache" —
// developer language that reads as a product bug. This maps that one
// specific condition to the truthful product statement; every other error
// passes through unchanged.
export function explainDbError(err, pendingMigrationFile) {
  const msg = err?.message || 'The action could not be completed.';
  if (/could not find the function|schema cache/i.test(msg)) {
    return `This action needs a pending database migration to be run first: ${pendingMigrationFile} (Supabase SQL Editor).`;
  }
  // 42702: a live function was created with an ambiguous column reference —
  // the corrected definition ships as a migration, so point at it too.
  if (/is ambiguous/i.test(msg)) {
    return `A database function needs its corrected migration to be run: ${pendingMigrationFile} (Supabase SQL Editor).`;
  }
  return msg;
}
