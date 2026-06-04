import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { phaseDeliverables as staticPhaseDeliverables, statuses } from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge, statusStyles } from "../components/Badge";
import { Info } from "../components/Info";
import { cx } from "../utils/cx";
import { TaskNotesModal, EditableText } from "./TaskCommandCenter";

export function PhaseScope({
  phaseDeliverables = staticPhaseDeliverables,
  notes = [],
  userRole = null,
  onUpdateDeliverable = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null
}) {
  const [activeNotesTaskId, setActiveNotesTaskId] = useState(null);
  const isAdmin = userRole === "admin";

  const handleStatusChange = async (item, val, e) => {
    const success = await onUpdateDeliverable(item.id, { status: val });
    if (!success && e) {
      e.target.value = item.status;
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Locked Scope"
        title="Phase 1: Setup Only"
        copy="Only the five deliverables below belong to Phase 1. Dynamic systems, web forms, WhatsApp, AI, databases, dashboards, applicant tracking, and ongoing management are parked separately."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {phaseDeliverables.map((item) => (
          <div key={item.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-xl font-black text-navy">{item.title}</h3>
              {isAdmin && onUpdateDeliverable ? (
                <select
                  value={item.status}
                  onChange={(e) => handleStatusChange(item, e.target.value, e)}
                  className={cx(
                    "pill cursor-pointer border outline-none font-bold text-xs rounded-full px-2.5 py-1 appearance-none text-center",
                    statusStyles[item.status] || statusStyles["Not Started"]
                  )}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={item.status} />
              )}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Checklist title="Included" items={item.included} positive />
              <Checklist title="Not included / later" items={item.notIncluded} />
            </div>
            <div className="mt-5 rounded-md bg-slate-50 border border-slate-200/65 p-4 text-sm">
              <Info
                label="Client input needed"
                value={
                  isAdmin && onUpdateDeliverable ? (
                    <EditableText
                      value={item.clientInput}
                      onSave={(val) => onUpdateDeliverable(item.id, { clientInput: val })}
                    />
                  ) : (
                    item.clientInput || <span className="italic text-slate-400">None</span>
                  )
                }
              />
              <div className="mt-4 pt-3 border-t border-slate-200/60">
                <button
                  onClick={() => setActiveNotesTaskId(item.id)}
                  className={cx(
                    "w-full text-xs font-bold py-1.5 px-3 rounded flex items-center justify-between transition-all border",
                    item.notes || notes.filter(n => n.tracker_item_id === item.id).length > 0
                      ? "bg-white border-slate-200 text-navy hover:bg-slate-50"
                      : "border-dashed border-slate-200 text-slate-400 hover:border-gold hover:text-gold"
                  )}
                >
                  <span>Notes & History ({notes.filter(n => n.tracker_item_id === item.id).length})</span>
                  <span className="text-[10px] text-gold font-black">View & Edit Notes ↗</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeNotesTaskId && (() => {
        const activeItem = phaseDeliverables.find(item => item.id === activeNotesTaskId);
        if (!activeItem) return null;
        return (
          <TaskNotesModal
            itemId={activeItem.id}
            title={activeItem.title}
            category="Deliverable"
            notes={activeItem.notes}
            history={notes.filter(n => n.tracker_item_id === activeItem.id)}
            isAdmin={isAdmin}
            onSaveNote={(val) => onUpdateDeliverable(activeItem.id, { notes: val })}
            selectedAuthorId={selectedAuthorId}
            authors={authors}
            onSelectAuthor={onSelectAuthor}
            onClose={() => setActiveNotesTaskId(null)}
          />
        );
      })()}
    </>
  );
}

function Checklist({ title, items, positive = false }) {
  return (
    <div>
      <p className="mb-2 text-sm font-black text-navy">{title}</p>
      <ul className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 size={16} className={cx("mt-0.5 shrink-0", positive ? "text-olive" : "text-slate-400")} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PhaseScope;
