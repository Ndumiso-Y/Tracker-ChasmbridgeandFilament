/**
 * Calculates calendar days overdue safely without millisecond timezone bleeding.
 * @param {string} dueDateStr - YYYY-MM-DD
 * @param {Date} today - current date object
 * @returns {number} days overdue (positive if overdue, negative/0 if future/today)
 */
export function getDaysOverdue(dueDateStr, today) {
  if (!dueDateStr) return 0;
  const [y, m, d] = dueDateStr.split('-').map(Number);

  // Create purely local midnight dates for safe difference
  const due = new Date(y, m - 1, d, 0, 0, 0);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);

  const diffTime = now.getTime() - due.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Deterministic calculation for Phase 3 Health according to approved V3 precedence.
 * Precedence: Behind -> At Risk -> Awaiting Inputs -> On Track -> Not Yet Assessed
 */
export function calculatePhase3DeliveryHealth(tasks, today) {
  // 1. ACTIVE PHASE 3 RECORDS
  const activeP3 = tasks.filter(t =>
    t.phase === "Phase 3" &&
    !["Done", "Deferred", "Separate Scope"].includes(t.status)
  );

  // 2. ASSESSED RECURRING ACTIVITIES
  const validCadenceStatuses = ["On Track", "At Risk", "Behind", "Awaiting Inputs"];
  const assessedRecurring = activeP3.filter(t =>
    t.recordType === "Recurring Activity" &&
    validCadenceStatuses.includes(t.cadenceStatus)
  );

  const activeCount = activeP3.length;
  const assessedCount = assessedRecurring.length;

  if (activeCount === 0) {
    return "Not Yet Assessed";
  }

  // Helper counts
  const behindRecCount = assessedRecurring.filter(t => t.cadenceStatus === "Behind").length;
  const atRiskRecCount = assessedRecurring.filter(t => t.cadenceStatus === "At Risk").length;
  const onTrackRecCount = assessedRecurring.filter(t => t.cadenceStatus === "On Track").length;

  const blockedCount = activeP3.filter(t => t.status === "Blocked" || t.deliveryLane === "Blocked").length;

  const constrainedCount = activeP3.filter(t =>
    t.status === "Waiting on Client" ||
    t.approvalStatus === "Awaiting Approval" ||
    t.cadenceStatus === "Awaiting Inputs"
  ).length;

  // --- BEHIND ---
  // 1. Any active high-priority Phase 3 item is overdue by more than 3 calendar days
  const hasHighPriorityOverdue3Days = activeP3.some(t =>
    t.priority === "High" &&
    t.dueDate &&
    getDaysOverdue(t.dueDate, today) > 3
  );

  // 2. Assessed recurring activities exist and Behind recurring count / assessed recurring count >= 0.40
  const isRecBehindThreshold = assessedCount > 0 && (behindRecCount / assessedCount) >= 0.40;

  if (hasHighPriorityOverdue3Days || isRecBehindThreshold) {
    return "Behind";
  }

  // --- AT RISK ---
  // 1. At least one assessed active recurring Phase 3 activity has cadence_status = 'At Risk'
  const hasRecAtRisk = atRiskRecCount > 0;

  // 2. Any active Phase 3 item is overdue (overdue > 0 days)
  const hasAnyOverdue = activeP3.some(t => t.dueDate && getDaysOverdue(t.dueDate, today) > 0);

  // 3. Blocked active Phase 3 count / active Phase 3 record count >= 0.25
  const isBlockedThreshold = (blockedCount / activeCount) >= 0.25;

  if (hasRecAtRisk || hasAnyOverdue || isBlockedThreshold) {
    return "At Risk";
  }

  // --- AWAITING INPUTS ---
  // Return "Awaiting Inputs" only when constrained records represent the majority (> 50%)
  if ((constrainedCount / activeCount) > 0.50) {
    return "Awaiting Inputs";
  }

  // --- ON TRACK ---
  // active Phase 3 records exist (checked above), assessed recurring activities exist,
  // and the majority (> 50%) of assessed recurring activities have cadence_status = 'On Track'
  if (assessedCount > 0 && (onTrackRecCount / assessedCount) > 0.50) {
    return "On Track";
  }

// --- NOT YET ASSESSED ---
  return "Not Yet Assessed";
}

/**
 * Calculates Phase 2 Progress Percentage based on specific record types.
 * Excludes: Risk, Decision, Context, Recurring Activity, Deferred, Separate Scope
 * Includes: Task, Deliverable, Approval Gate, Milestone
 */
export function calculatePhase2Progress(tasks) {
  const validTypes = ["Task", "Deliverable", "Approval Gate", "Milestone"];
  const p2Items = tasks.filter(t =>
    t.phase === "Phase 2" &&
    validTypes.includes(t.recordType) &&
    t.status !== "Deferred" &&
    t.status !== "Separate Scope"
  );

  if (p2Items.length === 0) return 0;

  const p2Done = p2Items.filter(t => t.status === "Done").length;
  return Math.round((p2Done / p2Items.length) * 100);
}
