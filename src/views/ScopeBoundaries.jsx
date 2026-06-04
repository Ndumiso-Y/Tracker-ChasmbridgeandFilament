import { scopeItems as staticScopeItems } from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { Badge } from "../components/Badge";
import { ItemGroup } from "../components/ItemGroup";
import { cx } from "../utils/cx";

export function ScopeBoundaries({ scopeItems = staticScopeItems }) {
  const boundaryMessages = [
    {
      label: "Phase 1 included",
      copy: "This is active setup work inside the agreed foundation launch.",
      tone: "included",
    },
    {
      label: "Retainer item",
      copy: "This is keep-it-running support after the launch foundation is in place.",
      tone: "retainer",
    },
    {
      label: "Parked for later phase",
      copy: "This is valuable growth work, held for a future phase so Phase 1 stays clean.",
      tone: "future",
    },
    {
      label: "Out of Current Scope",
      copy: "This is acknowledged, but it is not part of the current setup engagement.",
      tone: "separate",
    },
    {
      label: "Separate Quote Required",
      copy: "This needs its own brief, timeline, and commercial approval before it starts.",
      tone: "separate",
    },
  ];

  return (
    <>
      <SectionHeader
        eyebrow="Scope Protection"
        title="Client-Friendly Boundaries"
        copy="The tracker keeps Phase 1 focused on setup while still giving future opportunities a clear and respectful place to live."
      />
      <div className="mb-5 panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-navy p-6 text-white">
            <p className="eyebrow text-gold">Working Agreement</p>
            <h3 className="mt-2 text-2xl font-black">Foundation first, systems later.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Phase 1 is intentionally narrow: setup, presentation, and handover readiness. That clarity protects delivery quality and makes future phases easier to price and plan.
            </p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {boundaryMessages.map((message) => (
              <div key={message.label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <Badge className={cx("border-transparent", message.tone === "included" ? "bg-gold/10 text-[#795000]" : message.tone === "retainer" ? "bg-blue-50 text-blue-700" : message.tone === "future" ? "bg-olive/10 text-[#4c5616]" : "bg-zinc-100 text-zinc-700")}>{message.label}</Badge>
                <p className="mt-3 text-sm leading-6 text-slate-600">{message.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {scopeItems.map((group) => (
          <ItemGroup key={group.label} title={group.label} items={group.items} tone={group.tone} />
        ))}
      </div>
    </>
  );
}

export default ScopeBoundaries;
