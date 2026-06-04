import { cx } from "../utils/cx";

export function ProgressBar({ value, label, dark = false }) {
  return (
    <div>
      <div className={cx("mb-2 flex items-center justify-between text-xs font-bold", dark ? "text-slate-200" : "text-slate-600")}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div
        className={cx("h-2.5 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-slate-100")}
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-olive to-gold" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
export default ProgressBar;
