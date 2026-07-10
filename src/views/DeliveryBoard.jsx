import { useState, useMemo } from "react";
import { Target, AlertTriangle, CheckCircle2, MoreHorizontal, Clock, ArrowRight } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { Badge, StatusBadge, priorityStyles, statusStyles, StatusLegend } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { cx } from "../utils/cx";
import { TaskNotesModal, EditableText } from "./TaskCommandCenter";
import { statuses, priorities } from "../data/trackerData";

const lanes = [
  { id: "Now", title: "Now / Active", icon: Target, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { id: "This Week", title: "Due This Week", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { id: "Next", title: "Up Next", icon: ArrowRight, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" },
  { id: "Awaiting Approval", title: "Awaiting Approval", icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { id: "Blocked", title: "Blocked", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  { id: "Completed", title: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" }
];

export default function DeliveryBoard({
  tasks = [],
  notes = [],
  userRole = null,
  onUpdateTask = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null
}) {
  const [activeNotesTaskId, setActiveNotesTaskId] = useState(null);

  // Scope to Phase 2 and Phase 3 only
  const deliveryTasks = useMemo(() => {
    return tasks.filter(t => t.phase === "Phase 2" || t.phase === "Phase 3");
  }, [tasks]);

  const isAdmin = userRole === "admin";

  const handleLaneChange = async (task, newLane) => {
    if (newLane === task.deliveryLane) return;
    let updates = { deliveryLane: newLane };

    // Auto-update status based on lane if helpful
    if (newLane === "Blocked") updates.status = "Blocked";
    if (newLane === "Completed") updates.status = "Done";
    if (newLane === "Now" && task.status === "Not Started") updates.status = "In Progress";
    if (newLane === "Awaiting Approval") updates.approvalStatus = "Awaiting Approval";

    await onUpdateTask(task.id, updates);
  };

  return (
    <>
      <SectionHeader
        eyebrow="Delivery Execution"
        title="Active Delivery Board"
        copy="Phase 2 & Phase 3 active delivery pipeline. Use lanes to manage immediate focus."
      />

      <StatusLegend className="mt-4" />

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4 custom-scrollbar h-[calc(100vh-220px)] items-start">
        {lanes.map(lane => {
          const laneTasks = deliveryTasks.filter(t => (t.deliveryLane || "Next") === lane.id);

          return (
            <div key={lane.id} className="flex-shrink-0 w-80 flex flex-col h-full">
              <div className={cx("rounded-t-lg border-t border-x px-4 py-3 flex items-center justify-between", lane.bg)}>
                <div className="flex items-center gap-2">
                  <lane.icon size={16} className={lane.color} />
                  <h3 className={cx("font-black text-sm", lane.color)}>{lane.title}</h3>
                </div>
                <Badge className="bg-white border-slate-200 text-slate-700 font-bold">{laneTasks.length}</Badge>
              </div>

              <div className="flex-1 bg-slate-100/50 border-x border-b border-slate-200 rounded-b-lg p-2 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                {laneTasks.length === 0 ? (
                  <div className="text-center py-6 px-4">
                    <p className="text-xs text-slate-400 font-medium italic">No items in {lane.title}</p>
                  </div>
                ) : (
                  laneTasks.map(task => (
                    <DeliveryCard
                      key={task.id}
                      task={task}
                      isAdmin={isAdmin}
                      onUpdateTask={onUpdateTask}
                      onLaneChange={(newLane) => handleLaneChange(task, newLane)}
                      onOpenNotes={() => setActiveNotesTaskId(task.id)}
                      notesCount={notes.filter(n => n.tracker_item_id === task.id).length}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeNotesTaskId && (() => {
        const activeTask = tasks.find(t => t.id === activeNotesTaskId);
        if (!activeTask) return null;
        return (
          <TaskNotesModal
            itemId={activeTask.id}
            title={activeTask.task}
            category={activeTask.category}
            notes={activeTask.notes}
            history={notes.filter(n => n.tracker_item_id === activeTask.id)}
            isAdmin={isAdmin}
            onSaveNote={(val) => onUpdateTask(activeTask.id, { notes: val })}
            nextAction={activeTask.nextAction}
            onSaveNextAction={(val) => onUpdateTask(activeTask.id, { nextAction: val })}
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

function DeliveryCard({ task, isAdmin, onUpdateTask, onLaneChange, onOpenNotes, notesCount }) {
  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm p-3 group hover:border-gold/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {task.recordType && task.recordType !== "Task" && (
            <Badge className="bg-slate-100 text-slate-600 text-[9px] px-1 py-0 border-slate-200">{task.recordType}</Badge>
          )}
          {task.approvalStatus && task.approvalStatus !== "Not Required" && (
            <Badge className={cx("text-[9px] px-1 py-0", task.approvalStatus === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-purple-100 text-purple-800")}>
              {task.approvalStatus}
            </Badge>
          )}
        </div>
        {isAdmin && onUpdateTask && (
          <select
            value={task.deliveryLane || "Next"}
            onChange={(e) => onLaneChange(e.target.value)}
            className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded outline-none w-20 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
          >
            {lanes.map(l => <option key={l.id} value={l.id}>Move: {l.title}</option>)}
          </select>
        )}
      </div>

      <p className="text-sm font-bold text-navy leading-snug">{task.task}</p>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500">{task.responsible}</span>
        {isAdmin && onUpdateTask ? (
          <select
            value={task.status}
            onChange={(e) => onUpdateTask(task.id, { status: e.target.value })}
            className={cx(
              "pill cursor-pointer border outline-none font-bold text-[9px] rounded-full px-1.5 py-0.5 appearance-none text-center inline-select",
              statusStyles[task.status] || statusStyles["Not Started"]
            )}
          >
            {statuses.map((s) => (
              <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
            ))}
          </select>
        ) : (
          <StatusBadge status={task.status} className="text-[9px] px-1.5 py-0.5" />
        )}
      </div>

      {isAdmin && onUpdateTask ? (
        <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
          <label className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Priority</span>
            <select
              value={task.priority || "Medium"}
              onChange={(e) => onUpdateTask(task.id, { priority: e.target.value })}
              className={cx(
                "pill cursor-pointer border outline-none font-bold text-[10px] rounded px-1.5 py-0.5 appearance-none text-center inline-select w-full",
                priorityStyles[task.priority] || priorityStyles.Medium
              )}
            >
              {priorities.map((p) => <option key={p} value={p} className="bg-white text-navy font-normal">{p}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Due Date</span>
            <input
              type="date"
              value={task.dueDate || ""}
              onChange={(e) => onUpdateTask(task.id, { dueDate: e.target.value })}
              className="text-slate-700 font-bold text-[10px] w-full bg-white border border-slate-200 rounded px-1 py-0.5 focus:ring-0 focus:border-gold"
            />
          </label>
        </div>
      ) : (
        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px]">
          {task.dueDate ? (
            <span className="font-semibold text-slate-500">Due: {task.dueDate}</span>
          ) : (
            <span className="text-slate-400 italic">No date</span>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Next Action</div>
        {isAdmin && onUpdateTask ? (
          <EditableText
            value={task.nextAction}
            placeholder="Add next action..."
            onSave={(val) => onUpdateTask(task.id, { nextAction: val })}
          />
        ) : (
          <p className="text-xs text-slate-600">{task.nextAction || <span className="text-slate-400 italic">None specified</span>}</p>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Client Input Needed</div>
        {isAdmin && onUpdateTask ? (
          <EditableText
            value={task.clientInput}
            placeholder="Add what's needed from the client..."
            onSave={(val) => onUpdateTask(task.id, { clientInput: val })}
          />
        ) : (
          <p className="text-xs text-slate-600">{task.clientInput || <span className="text-slate-400 italic">None specified</span>}</p>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end text-[10px]">
        <button
          onClick={onOpenNotes}
          className={cx(
            "font-bold hover:text-gold transition",
            task.notes || notesCount > 0 ? "text-gold" : "text-slate-400"
          )}
        >
          {task.notes || notesCount > 0 ? `Notes (${notesCount})` : "Add Note"}
        </button>
      </div>
    </div>
  );
}
