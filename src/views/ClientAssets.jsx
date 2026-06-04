import { useState } from "react";
import { clientAssets as staticClientAssets, statuses, teamMembers } from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { Badge, StatusBadge, statusStyles } from "../components/Badge";
import { Info } from "../components/Info";
import { cx } from "../utils/cx";
import { TaskNotesModal } from "./TaskCommandCenter";

export function ClientAssets({
  clientAssets = staticClientAssets,
  notes = [],
  userRole = null,
  onUpdateAsset = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null
}) {
  const [activeNotesTaskId, setActiveNotesTaskId] = useState(null);
  const isAdmin = userRole === "admin";

  const handleStatusChange = async (asset, val, e) => {
    const success = await onUpdateAsset(asset.id, { status: val });
    if (!success && e) {
      e.target.value = asset.status;
    }
  };

  const handleRequirementChange = async (asset, val, e) => {
    const success = await onUpdateAsset(asset.id, { priority: val }); // requirement stored in priority column
    if (!success && e) {
      e.target.value = asset.requirement;
    }
  };

  const handleResponsibleChange = async (asset, val, e) => {
    const success = await onUpdateAsset(asset.id, { responsible: val });
    if (!success && e) {
      e.target.value = asset.responsible;
    }
  };

  const handleDueDateChange = async (asset, val, e) => {
    const success = await onUpdateAsset(asset.id, { dueDate: val });
    if (!success && e) {
      e.target.value = asset.dueDate;
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Inputs"
        title="Client Assets"
        copy="A focused list of client-side materials needed to unlock copywriting, account setup, approvals, and launch confidence."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clientAssets.map((asset) => (
          <div key={asset.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-black text-navy">{asset.asset}</h3>
              {isAdmin && onUpdateAsset ? (
                <select
                  value={asset.requirement}
                  onChange={(e) => handleRequirementChange(asset, e.target.value, e)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded p-1 outline-none text-navy font-bold focus:border-gold"
                >
                  <option value="Required">Required</option>
                  <option value="Optional">Optional</option>
                </select>
              ) : (
                <Badge className={asset.requirement === "Required" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{asset.requirement}</Badge>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {isAdmin && onUpdateAsset ? (
                <select
                  value={asset.status}
                  onChange={(e) => handleStatusChange(asset, e.target.value, e)}
                  className={cx(
                    "pill cursor-pointer border outline-none font-bold text-xs rounded-full px-2.5 py-1 appearance-none text-center",
                    statusStyles[asset.status] || statusStyles["Not Started"]
                  )}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={asset.status} />
              )}
              {isAdmin && onUpdateAsset ? (
                <input
                  type="text"
                  value={asset.dueDate || ""}
                  placeholder="YYYY-MM-DD"
                  onChange={(e) => handleDueDateChange(asset, e.target.value, e)}
                  className="inline-input text-slate-700 font-bold text-xs text-left w-28 focus:ring-0 focus:bg-white border-b border-dashed border-slate-300 hover:border-gold"
                />
              ) : (
                asset.dueDate ? (
                  <Badge className="border-gold/40 bg-gold/10 text-[#795000]">{asset.dueDate}</Badge>
                ) : (
                  <Badge className="border-slate-200 bg-slate-50 text-slate-500">No Date</Badge>
                )
              )}
            </div>
            <div className="mt-4 text-sm">
              <Info
                label="Responsible party"
                value={
                  isAdmin && onUpdateAsset ? (
                    <select
                      value={asset.responsible}
                      onChange={(e) => handleResponsibleChange(asset, e.target.value, e)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded p-1 outline-none text-navy font-bold focus:border-gold"
                    >
                      {teamMembers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    asset.responsible
                  )
                }
              />
              <div className="mt-4 pt-3 border-t border-slate-200/60">
                <button
                  onClick={() => setActiveNotesTaskId(asset.id)}
                  className={cx(
                    "w-full text-xs font-bold py-1.5 px-3 rounded flex items-center justify-between transition-all border",
                    asset.notes || notes.filter(n => n.tracker_item_id === asset.id).length > 0
                      ? "bg-white border-slate-200 text-navy hover:bg-slate-50"
                      : "border-dashed border-slate-200 text-slate-400 hover:border-gold hover:text-gold"
                  )}
                >
                  <span>Notes & History ({notes.filter(n => n.tracker_item_id === asset.id).length})</span>
                  <span className="text-[10px] text-gold font-black">View & Edit Notes ↗</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeNotesTaskId && (() => {
        const activeAsset = clientAssets.find(a => a.id === activeNotesTaskId);
        if (!activeAsset) return null;
        return (
          <TaskNotesModal
            itemId={activeAsset.id}
            title={activeAsset.asset}
            category="Client Asset"
            notes={activeAsset.notes}
            history={notes.filter(n => n.tracker_item_id === activeAsset.id)}
            isAdmin={isAdmin}
            onSaveNote={(val) => onUpdateAsset(activeAsset.id, { notes: val })}
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

export default ClientAssets;
