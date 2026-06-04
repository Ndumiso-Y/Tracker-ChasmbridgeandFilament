import {
  retainerItems as staticRetainerItems,
  futurePhaseItems as staticFuturePhaseItems,
  retainerTiers as staticRetainerTiers
} from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { ItemGroup } from "../components/ItemGroup";
import { cx } from "../utils/cx";

export function LaterPhases({
  retainerItems = staticRetainerItems,
  futurePhaseItems = staticFuturePhaseItems,
  retainerTiers = staticRetainerTiers
}) {
  return (
    <>
      <SectionHeader
        eyebrow="Separated Work"
        title="Retainer: Keep It Running"
        copy="These items are visible for planning, but they are not included in the Phase 1 setup fee."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {retainerTiers.map((tier) => (
          <div key={tier.name} className={cx("panel p-5 relative border-t-4", tier.recommended ? "border-t-gold border-gold/50" : "border-t-slate-300")}>
            {tier.recommended && (
              <span className="absolute top-2 right-2 rounded bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-[#795000]">
                RECOMMENDED
              </span>
            )}
            <h4 className="text-sm font-black text-navy">{tier.name}</h4>
            <p className="mt-2 text-2xl font-black text-navy">{tier.price}</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{tier.description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ItemGroup title="Retainer: Keep It Running" items={retainerItems} tone="retainer" />
        {Object.entries(futurePhaseItems).map(([title, items]) => (
          <ItemGroup key={title} title={title} items={items} tone={title.includes("Out") ? "separate" : "future"} />
        ))}
      </div>
    </>
  );
}

export default LaterPhases;
