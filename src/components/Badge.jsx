import { cx } from "../utils/cx";
import { RESPONSIBILITY_STYLES } from "../utils/responsibility";

// THE central task-status presentation map (V4A.16): every canonical
// tracker_items status (src/data/trackerData.js) has exactly one colour
// treatment, used identically in the Task Command Center, Delivery Board,
// Dashboard and every status chip. Colour never stands alone — the badge
// always carries the status text, and the StatusLegend below makes the key
// visible in the delivery views. This maps TASK STATUS only; Phase 3
// delivery HEALTH (On Track / At Risk / Behind) and delivery lanes remain
// their own separate vocabularies and are deliberately not merged in.
export const statusStyles = {
  "Not Started": "border-slate-300 bg-slate-100 text-slate-600",
  "In Progress": "border-gold/40 bg-gold/10 text-[#795000]",
  "Waiting on Client": "border-olive/40 bg-olive/10 text-[#4c5616]",
  Blocked: "border-red-200 bg-red-50 text-red-700",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Recurring — Active": "border-sky-200 bg-sky-50 text-sky-700",
  Deferred: "border-purple-200 bg-purple-50 text-purple-700",
  "Moved to Retainer": "border-blue-200 bg-blue-50 text-blue-700",
  "Moved to Phase 2": "border-violet-200 bg-violet-50 text-violet-700",
  "Moved to Phase 3": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Out of Scope": "border-zinc-300 bg-zinc-100 text-zinc-500",
  "Separate Scope": "border-zinc-300 bg-zinc-100 text-zinc-500",
};

// Plain-language meaning for every canonical task status — rendered by the
// StatusLegend so no colour has to be memorised.
export const TASK_STATUS_LEGEND = {
  "Not Started": "Work not yet begun",
  "In Progress": "Actively being delivered",
  "Waiting on Client": "Needs client input to continue",
  Blocked: "Cannot proceed — needs intervention",
  Done: "Delivered / achieved",
  "Recurring — Active": "Ongoing cadence work",
  Deferred: "Postponed by agreement",
  "Moved to Retainer": "Rescoped to the retainer",
  "Moved to Phase 2": "Rescoped to Phase 2",
  "Moved to Phase 3": "Rescoped to Phase 3",
  "Out of Scope": "Not part of current delivery",
  "Separate Scope": "Handled as separate scope",
};

export const priorityStyles = {
  High: "border-red-200 bg-red-50 text-red-700",
  Medium: "border-gold/40 bg-gold/10 text-[#795000]",
  Low: "border-slate-200 bg-slate-50 text-slate-600",
};

export const phaseStyles = {
  "Phase 1": "border-gold/40 bg-gold/10 text-[#795000]",
  "Phase 2": "border-olive/40 bg-olive/10 text-[#4c5616]",
  "Phase 3": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Separate Scope": "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export function Badge({ children, className = "" }) {
  return <span className={cx("pill", className)}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge className={statusStyles[status] ?? statusStyles["Not Started"]}>{status}</Badge>;
}

export function PhaseBadge({ phase }) {
  return <Badge className={phaseStyles[phase] ?? phaseStyles["Separate Scope"]}>{labelPhase(phase)}</Badge>;
}

// Compact dot-and-label phase indicator for narrow table cells, where the
// full descriptive PhaseBadge label does not fit without wrapping/overflow.
const phaseDotColors = {
  "Phase 1": "bg-gold",
  "Phase 2": "bg-olive",
  "Phase 3": "bg-cyan-500",
  "Separate Scope": "bg-zinc-400",
};

export function PhaseIndicator({ phase, className = "" }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span className={cx("h-2 w-2 rounded-full flex-shrink-0", phaseDotColors[phase] ?? phaseDotColors["Separate Scope"])} />
      <span className="text-xs font-bold text-slate-700 truncate">{phase}</span>
    </span>
  );
}

// Who-needs-to-act badge (V4A.12) — the one label every register card and
// detail header leads with, so no user has to infer responsibility from
// lifecycle vocabulary.
export function ResponsibilityBadge({ value, className = "" }) {
  if (!value) return null;
  return (
    <Badge className={cx("font-bold", RESPONSIBILITY_STYLES[value] || RESPONSIBILITY_STYLES.Draft, className)}>
      {value}
    </Badge>
  );
}

// Visible status key (V4A.16): a collapsible legend for the delivery views
// so every status colour has a stated meaning. One component, rendered in
// both the Task Command Center and the Delivery Board — never two keys.
export function StatusLegend({ className = "" }) {
  return (
    <details className={cx("rounded-lg border border-slate-200 bg-white", className)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 hover:text-navy">
        Status Key
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
        {Object.entries(TASK_STATUS_LEGEND).map(([status, meaning]) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
            <Badge className={statusStyles[status]}>{status}</Badge>
            {meaning}
          </span>
        ))}
      </div>
    </details>
  );
}

export function labelPhase(phase) {
  if (phase === "Phase 1") return "Phase 1: Digital Foundation";
  if (phase === "Phase 2") return "Phase 2: Operating Foundations";
  if (phase === "Phase 3") return "Phase 3: Active Growth & Management";
  if (phase === "Separate Scope") return "Separate Scope: Future Systems";
  return phase;
}
