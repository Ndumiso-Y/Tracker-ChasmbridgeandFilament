import { useMemo, useState, useEffect, useRef, Fragment } from "react";
import { Search, Filter, Target, ChevronDown, Edit2, X, SlidersHorizontal, AlertCircle, CheckCircle, Plus } from "lucide-react";
import {
  tasks as staticTasks,
  phases,
  categories,
  statuses,
  priorities,
  teamMembers,
} from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { Badge, StatusBadge, PhaseBadge, PhaseIndicator, priorityStyles, statusStyles, labelPhase } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { Info } from "../components/Info";
import { cx } from "../utils/cx";

function formatLastUpdated(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function TaskCommandCenter({
  tasks = staticTasks,
  notes = [],
  userRole = null,
  onUpdateTask = null,
  onCreateDeliveryItem = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null
}) {
  const [filters, setFilters] = useState({ 
    phase: "All", category: "All", status: "All", priority: "All", responsible: "All",
    recordType: "All", approvalStatus: "All", deliveryLane: "All", deliveryWeek: "All", 
    deliveryContext: "All", scopeTreatment: "All"
  });
  const [query, setQuery] = useState("");
  const [activeNotesTaskId, setActiveNotesTaskId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    title: "",
    entity: "Both",
    phase: "Phase 2",
    recordType: "Task",
    category: "Strategy",
    status: "Not Started",
    priority: "Medium",
    dueDate: "",
    ownerLabel: "Embark Digitals",
    nextAction: "",
    clientInput: "",
    deliveryContext: "Package 3 Review",
    scopeTreatment: "Current Delivery",
  });

  // New Delivery Filter States
  const [currentDeliveryOnly, setCurrentDeliveryOnly] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Sticky horizontal scroll rail + column-group jump control. The table's
  // own scroll region can be taller than the viewport, pushing its native
  // horizontal scrollbar out of reach without first scrolling to the bottom
  // of the table — this rail stays pinned to the viewport bottom instead.
  const tableScrollRef = useRef(null);
  const railScrollRef = useRef(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const columnRefs = useRef({});

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setTableScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const syncRailFromTable = () => {
    if (railScrollRef.current && tableScrollRef.current) {
      railScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };
  const syncTableFromRail = () => {
    if (railScrollRef.current && tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = railScrollRef.current.scrollLeft;
    }
  };
  const jumpToColumn = (key) => {
    const th = columnRefs.current[key];
    const container = tableScrollRef.current;
    if (!th || !container) return;
    const containerRect = container.getBoundingClientRect();
    const thRect = th.getBoundingClientRect();
    const targetLeft = container.scrollLeft + (thRect.left - containerRect.left) - 8;
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  };

  const columnGroups = [
    { label: "Overview", key: "task" },
    { label: "Delivery", key: "status" },
    { label: "Execution", key: "nextAction" },
    { label: "History", key: "notes" },
  ];

  const filteredTasks = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tasks.filter((task) => {
      // 1. Current Delivery Override. This convenience toggle hides the
      // historical Phase 1 and Separate Scope work by default — but only
      // when no explicit phase has been chosen. An explicit phase click
      // (below) must always win, otherwise selecting "Phase 1" would filter
      // to Phase 1 and then be immediately re-hidden by this toggle.
      if (currentDeliveryOnly && filters.phase === "All" && task.phase === "Phase 1") return false;
      if (currentDeliveryOnly && filters.phase === "All" && task.phase === "Separate Scope") return false;
      
      // 2. Standard Filters
      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (value === "All") return true;
        // Check exact match for the key in task object
        return task[key] === value;
      });
      
      // 3. Search text
      const haystack = [task.task, task.notes, task.clientInput, task.nextAction].join(" ").toLowerCase();
      
      return matchesFilters && (!text || haystack.includes(text));
    });
  }, [filters, query, tasks, currentDeliveryOnly]);

  const isAdmin = userRole === "admin";
  const canOperateInternally = isAdmin && !!onCreateDeliveryItem;

  const handleOpenCreateModal = () => {
    setCreateError(null);
    setNewItemForm({
      title: "",
      entity: "Both",
      phase: "Phase 2",
      recordType: "Task",
      category: "Strategy",
      status: "Not Started",
      priority: "Medium",
      dueDate: "",
      ownerLabel: "Embark Digitals",
      nextAction: "",
      clientInput: "",
      deliveryContext: "Package 3 Review",
      scopeTreatment: "Current Delivery",
    });
    setShowCreateModal(true);
  };

  const handleCreateDeliveryItem = async (event) => {
    event.preventDefault();
    if (!selectedAuthorId) {
      setCreateError("Please select an Active Editor in the sidebar to enable editing.");
      return;
    }
    if (!newItemForm.title.trim()) {
      setCreateError("Task / deliverable name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const result = await onCreateDeliveryItem(newItemForm);
      if (!result?.success) {
        setCreateError(result?.message || "Failed to create delivery item.");
        return;
      }
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (task, val, e) => {
    const success = await onUpdateTask(task.id, { status: val });
    if (!success && e) {
      e.target.value = task.status;
    }
  };

  const handleResponsibleChange = async (task, val, e) => {
    const success = await onUpdateTask(task.id, { responsible: val });
    if (!success && e) {
      e.target.value = task.responsible;
    }
  };

  const handleDueDateChange = async (task, val, e) => {
    const success = await onUpdateTask(task.id, { dueDate: val });
    if (!success && e) {
      e.target.value = task.dueDate;
    }
  };

  // Hardcode options for new taxonomy dropdowns since they are validated in scripts
  const recordTypes = ["Task", "Deliverable", "Recurring Activity", "Approval Gate", "Milestone", "Risk", "Decision", "Context"];
  const approvalStatuses = ["Not Required", "Drafting", "Ready for Review", "Awaiting Approval", "Changes Requested", "Approved", "Superseded"];
  const deliveryLanes = ["Now", "This Week", "Next", "Awaiting Approval", "Blocked", "Completed"];
  const deliveryWeeks = ["Week 1: Stabilise & Confirm", "Week 2: Organise & Publish", "Week 3: Build Credibility", "Week 4: Review & Recommend", "Cross-Period / Recurring"];
  const deliveryContextsArray = ["Package 3 Review", "Historical Foundation", "Future / Separate Scope", "Phase Delivery"];
  const scopeTreatments = ["Current Delivery", "Current Delivery if Minor", "Requires Client Approval", "Separate Cost Likely", "Third-Party Cost", "Separate Scope", "Future Context Only"];

  return (
    <>
      <SectionHeader
        eyebrow="Tracker"
        title="Master Delivery Register"
        copy="The complete command center for all items. Filters apply instantly. Use the 'Current Delivery' toggle to focus only on Phase 2 & Phase 3."
      />

      {canOperateInternally && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:bg-gold/90 transition-all whitespace-nowrap"
          >
            <Plus size={16} /> Add Delivery Item
          </button>
        </div>
      )}

      <div className="panel p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, notes, input, next action"
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-gold/30 focus:border-gold focus:ring-4"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-navy bg-gold/10 px-3 py-2.5 rounded-md border border-gold/30 cursor-pointer">
              <input 
                type="checkbox" 
                checked={currentDeliveryOnly} 
                onChange={(e) => setCurrentDeliveryOnly(e.target.checked)}
                className="w-4 h-4 text-gold rounded border-slate-300 focus:ring-gold"
              />
              Active Delivery Window Only
            </label>
            <button
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className={cx(
                "flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-md border transition",
                showMoreFilters ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200 hover:border-gold"
              )}
            >
              <SlidersHorizontal size={16} />
              Filters
            </button>
          </div>

          {showMoreFilters && (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-4 pt-3 border-t border-slate-100 animate-fadeIn">
              <FilterSelect label="Phase" value={filters.phase} options={phases} onChange={(value) => setFilters((prev) => ({ ...prev, phase: value }))} />
              <FilterSelect label="Category" value={filters.category} options={categories} onChange={(value) => setFilters((prev) => ({ ...prev, category: value }))} />
              <FilterSelect label="Status" value={filters.status} options={statuses} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
              <FilterSelect label="Priority" value={filters.priority} options={priorities} onChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))} />
              <FilterSelect label="Owner" value={filters.responsible} options={teamMembers} onChange={(value) => setFilters((prev) => ({ ...prev, responsible: value }))} />
              
              <FilterSelect label="Record Type" value={filters.recordType} options={recordTypes} onChange={(value) => setFilters((prev) => ({ ...prev, recordType: value }))} />
              <FilterSelect label="Approval Status" value={filters.approvalStatus} options={approvalStatuses} onChange={(value) => setFilters((prev) => ({ ...prev, approvalStatus: value }))} />
              <FilterSelect label="Delivery Lane" value={filters.deliveryLane} options={deliveryLanes} onChange={(value) => setFilters((prev) => ({ ...prev, deliveryLane: value }))} />
              <FilterSelect label="Delivery Week" value={filters.deliveryWeek} options={deliveryWeeks} onChange={(value) => setFilters((prev) => ({ ...prev, deliveryWeek: value }))} />
              <FilterSelect label="Delivery Context" value={filters.deliveryContext} options={deliveryContextsArray} onChange={(value) => setFilters((prev) => ({ ...prev, deliveryContext: value }))} />
              <FilterSelect label="Scope Treatment" value={filters.scopeTreatment} options={scopeTreatments} onChange={(value) => setFilters((prev) => ({ ...prev, scopeTreatment: value }))} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lift">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <Target size={17} className="text-gold" />
          Showing <span className="text-navy">{filteredTasks.length}</span> of <span className="text-navy">{tasks.length}</span> tracker items
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, phase: "All" }))}
            className={cx(
              "pill border transition cursor-pointer",
              filters.phase === "All" ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-gold"
            )}
          >
            All Phases
          </button>
          {phases.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, phase: prev.phase === phase ? "All" : phase }))}
              className={cx(
                "transition cursor-pointer rounded-full",
                filters.phase === phase ? "ring-2 ring-navy ring-offset-1" : "opacity-90 hover:opacity-100"
              )}
              title={`Show only ${labelPhase(phase)}`}
            >
              <PhaseBadge phase={phase} />
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Responsive Table */}
      <div className="mt-5 hidden rounded-lg border border-slate-200 bg-white shadow-lift xl:block">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2 overflow-x-auto">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 shrink-0">Jump to:</span>
          {columnGroups.map((g) => (
            <button
              key={g.key}
              onClick={() => jumpToColumn(g.key)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-gold hover:text-navy transition whitespace-nowrap shrink-0"
            >
              {g.label}
            </button>
          ))}
        </div>
        <div ref={tableScrollRef} onScroll={syncRailFromTable} className="max-h-[calc(100vh-320px)] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[1300px] table-fixed border-collapse text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th ref={(el) => (columnRefs.current.task = el)} className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[18%] sticky top-0 left-0 bg-navy z-30 sticky-header-shadow">Task & Indicators</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[7%] sticky top-0 bg-navy z-20">Phase</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[11%] sticky top-0 bg-navy z-20">Responsible Party</th>
                <th ref={(el) => (columnRefs.current.status = el)} className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[9%] sticky top-0 bg-navy z-20">Status</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[8%] sticky top-0 bg-navy z-20">Due Date</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[12%] sticky top-0 bg-navy z-20">Client Input / Blockers</th>
                <th ref={(el) => (columnRefs.current.notes = el)} className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[14%] sticky top-0 bg-navy z-20">Notes / History</th>
                <th ref={(el) => (columnRefs.current.nextAction = el)} className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] w-[12%] sticky top-0 bg-navy z-20">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const historyCount = notes.filter(n => n.tracker_item_id === task.id).length;
                return (
                  <tr key={task.id} className="border-b border-slate-100 align-top hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-150 sticky-column-shadow">
                      <p className="font-black leading-5 text-navy">{task.task}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {task.recordType && task.recordType !== "Task" && (
                          <Badge className="bg-slate-200 text-slate-700 text-[9px] border-slate-300">{task.recordType}</Badge>
                        )}
                        {task.approvalStatus && task.approvalStatus !== "Not Required" && (
                          <Badge className={cx("text-[9px]", task.approvalStatus === "Approved" ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-purple-100 border-purple-300 text-purple-800")}>
                            {task.approvalStatus}
                          </Badge>
                        )}
                        {task.cadenceStatus && (
                          <Badge className={cx("text-[9px]", task.cadenceStatus === "On Track" ? "bg-emerald-100 border-emerald-300 text-emerald-800" : task.cadenceStatus === "Behind" ? "bg-red-100 border-red-300 text-red-800" : "bg-amber-100 border-amber-300 text-amber-800")}>
                            {task.cadenceStatus}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4"><PhaseIndicator phase={task.phase} /></td>
                    <td className="px-4 py-3">
                      {isAdmin && onUpdateTask ? (
                        <select
                          value={task.responsible}
                          onChange={(e) => handleResponsibleChange(task, e.target.value, e)}
                          className="inline-select text-navy font-bold text-xs w-full text-center"
                        >
                          {teamMembers.map((m) => (
                            <option key={m} value={m} className="text-navy font-bold">{m}</option>
                          ))}
                        </select>
                      ) : (
                        task.responsible
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && onUpdateTask ? (
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task, e.target.value, e)}
                          className={cx(
                            "pill cursor-pointer border outline-none font-bold text-xs rounded-full px-2.5 py-1 appearance-none text-center inline-select",
                            statusStyles[task.status] || statusStyles["Not Started"]
                          )}
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={task.status} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && onUpdateTask ? (
                        <input
                          type="date"
                          value={task.dueDate || ""}
                          onChange={(e) => handleDueDateChange(task, e.target.value, e)}
                          className="inline-input text-slate-700 font-bold text-xs text-center w-full focus:ring-0 focus:bg-white border-b border-dashed border-slate-300 hover:border-gold"
                        />
                      ) : (
                        task.dueDate || "Parked"
                      )}
                      {task.lastUpdated && (
                        <p className="mt-1 text-[9px] font-semibold text-slate-400 text-center">Updated {formatLastUpdated(task.lastUpdated)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 leading-5 text-slate-650">
                      {task.clientInput}
                      {task.blockedBy && (
                        <div className="mt-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded p-1.5 flex items-start gap-1">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <span>Blocked By: {task.blockedBy}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 leading-5 text-slate-600 select-none">
                      <div className="flex flex-col gap-1.5 items-start">
                        <div className="text-xs font-semibold text-slate-700 line-clamp-2" title={task.notes || "No notes yet"}>
                          {task.notes ? task.notes : <span className="text-slate-400 italic font-normal">No notes</span>}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveNotesTaskId(task.id); }}
                          className={cx(
                            "text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-all border",
                            task.notes || historyCount > 0
                              ? "bg-gold/10 border-gold/20 text-[#795000] hover:bg-gold/25"
                              : "border-dashed border-slate-300 text-slate-400 hover:border-gold hover:text-gold"
                          )}
                        >
                          {task.notes || historyCount > 0 ? `Notes & History (${historyCount})` : "+ Add Note / Edit"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 leading-5 text-slate-600">
                      {isAdmin && onUpdateTask ? (
                        <EditableText
                          value={task.nextAction}
                          placeholder="Add next action..."
                          onSave={(val) => onUpdateTask(task.id, { nextAction: val })}
                        />
                      ) : (
                        task.nextAction
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div
          ref={railScrollRef}
          onScroll={syncTableFromRail}
          className="sticky bottom-0 z-40 overflow-x-auto overflow-y-hidden border-t border-slate-200 bg-white h-3.5 custom-scrollbar"
        >
          <div style={{ width: tableScrollWidth, height: 1 }} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:hidden">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            notes={notes}
            userRole={userRole}
            onUpdateTask={onUpdateTask}
            handleStatusChange={handleStatusChange}
            handleResponsibleChange={handleResponsibleChange}
            handleDueDateChange={handleDueDateChange}
            onOpenNotes={setActiveNotesTaskId}
          />
        ))}
      </div>

      {!filteredTasks.length && (
        <div className="mt-5">
          <EmptyState icon={Filter} title="No tasks match this view" copy="Adjust a filter or search term to bring items back into focus." />
        </div>
      )}

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

      {showCreateModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
          <div className="bg-white rounded-xl shadow-premium border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleUp z-10">
            <div className="bg-navy px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">Internal Delivery Spine</span>
                <h3 className="text-lg font-black mt-0.5">Add Delivery Item</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDeliveryItem} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-semibold">{createError}</div>
              )}

              <div>
                <label className="block text-sm font-bold text-navy mb-1.5">Task / Deliverable Name</label>
                <input
                  type="text"
                  value={newItemForm.title}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Business Profile Adjustments"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ModalSelect label="Entity" value={newItemForm.entity} options={["Chasm Bridge Charity", "Filament", "Both"]} onChange={(value) => setNewItemForm(prev => ({ ...prev, entity: value }))} />
                <ModalSelect label="Phase" value={newItemForm.phase} options={["Phase 2", "Phase 3"]} onChange={(value) => setNewItemForm(prev => ({ ...prev, phase: value }))} />
                <ModalSelect label="Record Type" value={newItemForm.recordType} options={["Task", "Deliverable", "Milestone", "Approval Gate"]} onChange={(value) => setNewItemForm(prev => ({ ...prev, recordType: value }))} />
                <ModalSelect label="Category" value={newItemForm.category} options={categories} onChange={(value) => setNewItemForm(prev => ({ ...prev, category: value }))} />
                <ModalSelect label="Status" value={newItemForm.status} options={statuses.filter(s => !["Moved to Retainer", "Moved to Phase 2", "Moved to Phase 3", "Out of Scope", "Separate Scope"].includes(s))} onChange={(value) => setNewItemForm(prev => ({ ...prev, status: value }))} />
                <ModalSelect label="Priority" value={newItemForm.priority} options={priorities} onChange={(value) => setNewItemForm(prev => ({ ...prev, priority: value }))} />
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={newItemForm.dueDate}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                </div>
                <ModalSelect label="Owner / Responsible Party" value={newItemForm.ownerLabel} options={teamMembers} onChange={(value) => setNewItemForm(prev => ({ ...prev, ownerLabel: value }))} />
                <ModalSelect label="Delivery Context" value={newItemForm.deliveryContext} options={["Package 3 Review", "Phase Delivery"]} onChange={(value) => setNewItemForm(prev => ({ ...prev, deliveryContext: value }))} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Next Action</label>
                  <textarea
                    value={newItemForm.nextAction}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, nextAction: e.target.value }))}
                    rows={3}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-navy mb-1.5">Client Input Needed</label>
                  <textarea
                    value={newItemForm.clientInput}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, clientInput: e.target.value }))}
                    rows={3}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
                  />
                </div>
              </div>

              <input type="hidden" value={newItemForm.scopeTreatment} readOnly />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-navy bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 text-sm font-bold text-navy bg-gold hover:bg-gold/90 rounded-lg shadow-md shadow-gold/20 transition-all disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create Delivery Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ModalSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-sm font-bold text-navy mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-gold/30 focus:border-gold"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-bold text-slate-700 outline-none ring-gold/30 focus:border-gold focus:ring-4"
      >
        <option value="All">All {label}</option>
        {options.map((option) => <option key={option} value={option}>{label === "Phase" ? labelPhase(option) : option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
    </label>
  );
}

function TaskCard({
  task,
  notes,
  userRole,
  onUpdateTask,
  handleStatusChange,
  handleResponsibleChange,
  handleDueDateChange,
  onOpenNotes
}) {
  const isAdmin = userRole === "admin";
  const itemNotes = notes.filter(n => n.tracker_item_id === task.id);

  return (
    <div className="panel overflow-hidden">
      <div className={cx("h-1", task.phase === "Phase 1" ? "bg-gold" : task.phase === "Retainer" ? "bg-blue-500" : task.phase === "Phase 2" ? "bg-olive" : task.phase === "Phase 3" ? "bg-cyan-500" : "bg-zinc-400")} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-navy">{task.task}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {task.recordType && task.recordType !== "Task" && (
                <Badge className="bg-slate-200 text-slate-700 text-[9px] border-slate-300">{task.recordType}</Badge>
              )}
              {task.approvalStatus && task.approvalStatus !== "Not Required" && (
                <Badge className={cx("text-[9px]", task.approvalStatus === "Approved" ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-purple-100 border-purple-300 text-purple-800")}>
                  {task.approvalStatus}
                </Badge>
              )}
              {task.cadenceStatus && (
                <Badge className={cx("text-[9px]", task.cadenceStatus === "On Track" ? "bg-emerald-100 border-emerald-300 text-emerald-800" : task.cadenceStatus === "Behind" ? "bg-red-100 border-red-300 text-red-800" : "bg-amber-100 border-amber-300 text-amber-800")}>
                  {task.cadenceStatus}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <PhaseBadge phase={task.phase} />
            {isAdmin && onUpdateTask ? (
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task, e.target.value, e)}
                className={cx(
                  "pill cursor-pointer border outline-none font-bold text-xs rounded-full px-2.5 py-1 appearance-none text-center inline-select",
                  statusStyles[task.status] || statusStyles["Not Started"]
                )}
              >
                {statuses.map((s) => (
                  <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
                ))}
              </select>
            ) : (
              <StatusBadge status={task.status} />
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Info
            label="Due Date"
            value={
              isAdmin && onUpdateTask ? (
                <input
                  type="date"
                  value={task.dueDate || ""}
                  onChange={(e) => handleDueDateChange(task, e.target.value, e)}
                  className="inline-input text-slate-700 font-bold text-xs text-left w-full focus:ring-0 focus:bg-white border-b border-dashed border-slate-300 hover:border-gold"
                />
              ) : (
                task.dueDate || "Parked"
              )
            }
          />
          <Info label="Client Input Needed" value={
            <>
              {task.clientInput}
              {task.blockedBy && (
                <div className="mt-2 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded p-1 flex items-start gap-1 w-fit">
                  <AlertCircle size={10} className="mt-0.5 shrink-0" />
                  <span>Blocked By: {task.blockedBy}</span>
                </div>
              )}
            </>
          } />
          
          <div className="sm:col-span-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => onOpenNotes(task.id)}
              className={cx(
                "w-full text-xs font-bold py-2 px-3 rounded flex items-center justify-between transition-all border",
                task.notes || itemNotes.length > 0
                  ? "bg-slate-50 border-slate-200 text-navy hover:bg-slate-100"
                  : "border-dashed border-slate-200 text-slate-400 hover:border-gold hover:text-gold"
              )}
            >
              <span>Notes & History ({itemNotes.length})</span>
              <span className="text-[10px] text-gold font-black">View & Edit Notes ↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dedicated Overlay Modal popup for Notes & History (reusable across all views)
export function TaskNotesModal({
  itemId,
  title,
  category,
  notes = "",
  history = [],
  isAdmin,
  onSaveNote,
  nextAction = null,
  onSaveNextAction = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null,
  onClose
}) {
  const [noteText, setNoteText] = useState(notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [nextActionText, setNextActionText] = useState(nextAction || "");

  useEffect(() => {
    setNoteText(notes || "");
  }, [notes]);

  useEffect(() => {
    setNextActionText(nextAction || "");
  }, [nextAction]);

  const handleSaveNote = async () => {
    setIsSaving(true);
    const success = await onSaveNote(noteText);
    setIsSaving(false);
  };

  const handleSaveNextAction = async () => {
    if (onSaveNextAction) {
      await onSaveNextAction(nextActionText);
    }
  };

  const hasEditor = !!selectedAuthorId;

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop Close Click */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="bg-white rounded-xl shadow-premium border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleUp z-10">
        {/* Header */}
        <div className="bg-navy px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">{category}</span>
            <h3 className="text-lg font-black mt-0.5">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
          {/* Left Panel: Editing Workspace */}
          <div className="space-y-5">
            <h4 className="text-xs font-black uppercase tracking-[0.12em] text-navy border-b border-slate-100 pb-2">
              Update Notes & Actions
            </h4>

            {isAdmin && (
              <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Active Editor {!selectedAuthorId && <span className="text-red-500 font-extrabold">*</span>}
                </label>
                <select
                  value={selectedAuthorId}
                  onChange={(e) => onSelectAuthor && onSelectAuthor(e.target.value)}
                  className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 font-bold outline-none ring-gold/30 focus:border-gold focus:ring-2"
                >
                  <option value="" className="text-slate-400 font-normal">Select active editor...</option>
                  {(authors || []).filter(a => a.is_active).map((a) => (
                    <option key={a.id} value={a.id} className="text-slate-800">
                      {a.display_name} — {a.organisation_label}
                    </option>
                  ))}
                </select>
                {!selectedAuthorId && (
                  <p className="text-[10px] text-amber-700 font-semibold mt-1">
                    ⚠️ Select an editor to enable typing notes and actions.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Notes / History Detail
              </label>
              {isAdmin && onSaveNote ? (
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={!hasEditor}
                  placeholder="Type note details here... (e.g. 'Waiting on registrar access')"
                  className="w-full text-xs p-3 border border-slate-200 rounded-md outline-none focus:border-gold focus:ring-4 focus:ring-gold/15 text-slate-700 font-bold resize-y min-h-[140px] leading-relaxed disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-md text-xs text-slate-600 font-semibold leading-relaxed min-h-[140px]">
                  {notes || <span className="italic text-slate-400 font-normal">No notes recorded</span>}
                </div>
              )}
            </div>

            {nextAction !== null && onSaveNextAction && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Next Action
                </label>
                {isAdmin ? (
                  <input
                    type="text"
                    value={nextActionText}
                    onChange={(e) => setNextActionText(e.target.value)}
                    onBlur={handleSaveNextAction}
                    disabled={!hasEditor}
                    placeholder="Enter next immediate task..."
                    className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-md outline-none focus:border-gold focus:ring-4 focus:ring-gold/15 text-slate-700 font-bold disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md text-xs text-slate-600 font-semibold">
                    {nextAction || <span className="italic text-slate-400 font-normal">None specified</span>}
                  </div>
                )}
              </div>
            )}

            {isAdmin && onSaveNote && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                <span className="text-[10px] text-slate-500 font-semibold leading-tight">
                  {nextAction !== null ? "Next Action saves on blur. Notes save on click." : "Notes save on click."}
                </span>
                <button
                  onClick={handleSaveNote}
                  disabled={isSaving || !hasEditor || noteText === (notes || "")}
                  className={cx(
                    "px-4 py-2 text-xs font-black uppercase tracking-wider text-white rounded transition-all",
                    !hasEditor || noteText === (notes || "")
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200"
                      : "bg-emerald-600 hover:bg-emerald-700 hover:shadow shadow-sm"
                  )}
                >
                  {isSaving ? "Saving..." : "Save Note Update"}
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: Change History timeline */}
          <div className="flex flex-col min-h-[300px]">
            <h4 className="text-xs font-black uppercase tracking-[0.12em] text-navy border-b border-slate-100 pb-2 mb-3">
              Change Log & Audit Trail ({history.length})
            </h4>
            <div className="flex-1 bg-slate-50 rounded-lg p-4 border border-slate-150 overflow-y-auto max-h-[360px] custom-scrollbar">
              {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic py-10">
                  No activity history logged yet.
                </div>
              ) : (
                <div className="timeline space-y-4">
                  {history.map((note) => (
                    <div key={note.id} className="relative pl-1">
                      <div className="timeline-dot" />
                      <div className="text-xs">
                        <p className="font-bold text-navy leading-tight">
                          {note.note_type === "status_change" ? "Status changed" :
                           note.note_type === "due_date_update" ? "Due date updated" :
                           note.note_type === "next_action_update" ? "Next action updated" :
                           note.note_type === "priority_update" ? "Priority/Requirement updated" : "Note added"} by <span className="text-gold font-extrabold">{note.changed_by_label}</span>
                        </p>
                        {note.old_status && note.new_status && (
                          <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                            {note.old_status} → {note.new_status}
                          </p>
                        )}
                        {note.note_text && (
                          <p className="mt-1.5 bg-white p-2 rounded border border-slate-100 text-slate-650 font-semibold leading-relaxed">
                            {note.note_text}
                          </p>
                        )}
                        <p className="text-[9px] text-slate-400 mt-1 font-bold">
                          {new Date(note.created_at).toLocaleString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:text-navy border border-slate-200 bg-white rounded hover:bg-slate-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline Editable Text Component (Saves on blur or save click, returns Promise boolean)
export function EditableText({ value, placeholder = "Add note...", onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value);

  useEffect(() => {
    setTempVal(value);
  }, [value]);

  const handleSave = async () => {
    if (tempVal === value) {
      setIsEditing(false);
      return;
    }
    const success = await onSave(tempVal);
    if (success) {
      setIsEditing(false);
    } else {
      setTempVal(value); // revert on failure
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1 w-full min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        <textarea
          value={tempVal || ""}
          onChange={(e) => setTempVal(e.target.value)}
          className="w-full text-xs p-1.5 border border-navy/30 rounded outline-none resize-y text-slate-700 font-bold"
          rows={2}
          autoFocus
          onBlur={handleSave}
        />
        <div className="flex gap-2 justify-end">
          <button
            onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
            className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
          >
            Save
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); setTempVal(value); setIsEditing(false); }}
            className="px-2 py-0.5 text-[10px] bg-slate-400 text-white rounded font-bold hover:bg-slate-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      className="cursor-pointer hover:bg-slate-100/50 p-1.5 rounded transition border-b border-dashed border-slate-300 hover:border-gold text-slate-600 min-h-[28px] font-bold flex items-center justify-between gap-2 hover:text-gold"
      title="Click to edit inline"
    >
      <span className="truncate max-w-[90%]">{value || <span className="text-slate-400 italic font-normal">{placeholder}</span>}</span>
      <Edit2 size={11} className="text-slate-400 shrink-0" />
    </div>
  );
}

export default TaskCommandCenter;
