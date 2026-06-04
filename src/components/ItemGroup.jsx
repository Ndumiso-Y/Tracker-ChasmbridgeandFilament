import { cx } from "../utils/cx";
import { Badge } from "./Badge";

export function ItemGroup({ title, items, tone }) {
  const toneClass = tone === "retainer" ? "bg-blue-50 text-blue-700" : tone === "separate" ? "bg-zinc-100 text-zinc-700" : tone === "included" ? "bg-gold/10 text-[#795000]" : "bg-olive/10 text-[#4c5616]";
  const borderClass = tone === "retainer" ? "border-l-blue-500" : tone === "separate" ? "border-l-zinc-400" : tone === "included" ? "border-l-gold" : "border-l-olive";
  return (
    <div className={cx("panel border-l-4 p-5", borderClass)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-navy">{title}</h3>
        <Badge className={cx("border-transparent", toneClass)}>
          {tone === "included" ? "Included" : tone === "retainer" ? "Retainer item" : tone === "separate" ? "Separate Quote Required" : "Parked for Later"}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">{item}</div>
        ))}
      </div>
    </div>
  );
}
export default ItemGroup;
