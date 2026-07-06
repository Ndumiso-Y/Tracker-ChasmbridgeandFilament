import { cx } from "../utils/cx";

export const statusStyles = {
  "Not Started": "border-slate-200 bg-slate-50 text-slate-700",
  "In Progress": "border-gold/40 bg-gold/10 text-[#795000]",
  "Waiting on Client": "border-olive/40 bg-olive/10 text-[#4c5616]",
  Blocked: "border-red-200 bg-red-50 text-red-700",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Moved to Retainer": "border-blue-200 bg-blue-50 text-blue-700",
  "Moved to Phase 2": "border-violet-200 bg-violet-50 text-violet-700",
  "Moved to Phase 3": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Out of Scope": "border-zinc-300 bg-zinc-100 text-zinc-700",
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

export function labelPhase(phase) {
  if (phase === "Phase 1") return "Phase 1: Digital Foundation";
  if (phase === "Phase 2") return "Phase 2: Operating Foundations";
  if (phase === "Phase 3") return "Phase 3: Active Growth & Management";
  if (phase === "Separate Scope") return "Separate Scope: Future Systems";
  return phase;
}
