import { cx } from "../utils/cx";

export function EmptyState({ icon: Icon, title, copy, compact = false }) {
  return (
    <div className={cx("rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center", compact ? "p-5" : "p-8")}>
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-gold shadow-lift">
        <Icon size={20} />
      </span>
      <p className="mt-3 font-black text-navy">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p>
    </div>
  );
}
export default EmptyState;
