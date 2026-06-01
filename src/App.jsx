import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileStack,
  Filter,
  Flag,
  FolderKanban,
  Layers3,
  LayoutDashboard,
  Menu,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import inspiration from "./assets/FilamentandChasmInspiration.png";
import {
  categories,
  clientAssets,
  futurePhaseItems,
  launchChecklist,
  phaseDeliverables,
  phases,
  priorities,
  retainerItems,
  scopeItems,
  statuses,
  tasks,
  teamMembers,
} from "./data/trackerData";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tasks", label: "Task Command Center", icon: FolderKanban },
  { id: "scope", label: "Phase 1 Scope", icon: ShieldCheck },
  { id: "later", label: "Retainer / Later Phases", icon: Layers3 },
  { id: "assets", label: "Client Assets", icon: FileStack },
  { id: "launch", label: "Launch Readiness", icon: Rocket },
  { id: "boundaries", label: "Scope Boundaries", icon: Flag },
];

const statusStyles = {
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

const priorityStyles = {
  High: "border-red-200 bg-red-50 text-red-700",
  Medium: "border-gold/40 bg-gold/10 text-[#795000]",
  Low: "border-slate-200 bg-slate-50 text-slate-600",
};

const phaseStyles = {
  "Phase 1": "border-gold/40 bg-gold/10 text-[#795000]",
  Retainer: "border-blue-200 bg-blue-50 text-blue-700",
  "Phase 2": "border-olive/40 bg-olive/10 text-[#4c5616]",
  "Phase 3": "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Out of Scope": "border-zinc-300 bg-zinc-100 text-zinc-700",
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ children, className = "" }) {
  return <span className={cx("pill", className)}>{children}</span>;
}

function StatusBadge({ status }) {
  return <Badge className={statusStyles[status] ?? statusStyles["Not Started"]}>{status}</Badge>;
}

function PhaseBadge({ phase }) {
  return <Badge className={phaseStyles[phase] ?? phaseStyles["Out of Scope"]}>{labelPhase(phase)}</Badge>;
}

function SectionHeader({ eyebrow, title, copy }) {
  return (
    <div className="mb-6 max-w-4xl">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl font-black leading-tight text-navy md:text-4xl">{title}</h2>
      {copy && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{copy}</p>}
    </div>
  );
}

function ProgressBar({ value, label, dark = false }) {
  return (
    <div>
      <div className={cx("mb-2 flex items-center justify-between text-xs font-bold", dark ? "text-slate-200" : "text-slate-600")}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className={cx("h-2.5 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-slate-100")}>
        <div className="h-full rounded-full bg-gradient-to-r from-olive to-gold" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  const metrics = useMemo(() => {
    const phaseOne = tasks.filter((task) => task.phase === "Phase 1");
    const donePhaseOne = phaseOne.filter((task) => task.status === "Done").length;
    return {
      total: tasks.length,
      done: tasks.filter((task) => task.status === "Done").length,
      inProgress: tasks.filter((task) => task.status === "In Progress").length,
      waiting: tasks.filter((task) => task.status === "Waiting on Client").length,
      blocked: tasks.filter((task) => task.status === "Blocked").length,
      high: tasks.filter((task) => task.priority === "High").length,
      dueSoon: tasks.filter((task) => task.dueDate && task.status !== "Done").length,
      phaseProgress: Math.round((donePhaseOne / phaseOne.length) * 100),
    };
  }, []);

  const ActiveIcon = navItems.find((item) => item.id === activeView)?.icon ?? LayoutDashboard;

  return (
    <div className="min-h-screen bg-mist">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-navy text-white lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            className="rounded-md border border-white/15 p-2"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 text-sm font-black">
            <ActiveIcon size={18} className="text-gold" />
            {navItems.find((item) => item.id === activeView)?.label}
          </div>
        </div>
      </div>

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 w-72 transform bg-navy text-white transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-5">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <img src={inspiration} alt="Filament and Chasm Bridge visual inspiration" className="h-24 w-full object-cover" />
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-gold">Embark Digitals</p>
            <h1 className="mt-1 text-xl font-black leading-tight">Chasm Bridge & Filament Command Center</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Phase 1 builds the foundation. The retainer keeps it running. Future phases turn it into a scalable system.
            </p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold transition",
                    active ? "bg-gold text-navy" : "text-slate-200 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-4 text-xs leading-5 text-slate-300">
            <p className="font-bold text-white">Phase 1 Fee: R23,000</p>
            <p>Owner: Ndumiso Yedwa, Embark Digitals</p>
          </div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-navy/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <main className="pt-20 lg:ml-72 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 lg:py-8">
          {activeView === "dashboard" && <Dashboard metrics={metrics} />}
          {activeView === "tasks" && <TaskCommandCenter />}
          {activeView === "scope" && <PhaseScope />}
          {activeView === "later" && <LaterPhases />}
          {activeView === "assets" && <ClientAssets />}
          {activeView === "launch" && <LaunchReadiness />}
          {activeView === "boundaries" && <ScopeBoundaries />}
        </div>
      </main>
    </div>
  );
}

function Dashboard({ metrics }) {
  const currentFocus = tasks.filter((task) => ["In Progress", "Blocked", "Waiting on Client"].includes(task.status)).slice(0, 5);
  const blockers = tasks.filter((task) => task.status === "Blocked");
  const clientNeeded = tasks.filter((task) => task.status === "Waiting on Client").slice(0, 5);
  const phaseOneActive = tasks.filter((task) => task.phase === "Phase 1" && task.status !== "Done").length;
  const launchReady = launchChecklist.filter((item) => item.status === "Done").length;
  const launchPercent = Math.round((launchReady / launchChecklist.length) * 100);

  const statCards = [
    ["Total tasks", metrics.total, BarChart3],
    ["Done", metrics.done, CheckCircle2],
    ["In progress", metrics.inProgress, Sparkles],
    ["Waiting on client", metrics.waiting, Users],
    ["Blocked", metrics.blocked, AlertTriangle],
    ["High priority", metrics.high, Flag],
    ["Tasks due soon", metrics.dueSoon, CalendarClock],
  ];

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-lg border border-navy/10 bg-navy shadow-premium">
        <div className="grid gap-0 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="p-5 text-white md:p-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Executive Command Center</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">Phase 1: Setup Control Room</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
              A live working view of what is moving, what needs client input, and what has been deliberately parked for retainer or later phases.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <CommandSignal label="Active Phase 1 items" value={phaseOneActive} />
              <CommandSignal label="Client decisions" value={metrics.waiting} />
              <CommandSignal label="Blocked handoffs" value={metrics.blocked} alert={metrics.blocked > 0} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 md:p-7 xl:border-l xl:border-t-0">
            <div className="rounded-lg border border-white/10 bg-white/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Launch Posture</p>
              <div className="mt-5 space-y-5">
                <ProgressBar value={metrics.phaseProgress} label="Phase 1 setup complete" dark />
                <ProgressBar value={launchPercent} label="Launch readiness complete" dark />
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Phase 1 builds the foundation. The retainer keeps it running. Future phases turn it into a scalable system.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value, Icon]) => (
          <div key={label} className="panel group p-5 transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-premium">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-500">{label}</p>
              <span className="rounded-md bg-gold/10 p-2 text-gold transition group-hover:bg-gold group-hover:text-navy">
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-navy">{value}</p>
          </div>
        ))}
        <div className="panel p-5 sm:col-span-2 xl:col-span-1">
          <ProgressBar value={metrics.phaseProgress} label="Phase 1 progress" />
          <div className="mt-5">
            <ProgressBar value={launchPercent} label="Launch readiness" />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Now Moving</p>
              <h3 className="mt-1 text-xl font-black text-navy">Current Focus</h3>
            </div>
            <Badge className="border-gold/40 bg-gold/10 text-[#795000]">Urgent Attention</Badge>
          </div>
          <TaskList tasks={currentFocus} />
        </div>

        <div className="space-y-5">
          <Snapshot title="Blockers" icon={AlertTriangle} items={blockers} empty="No blockers recorded. The setup path is clear for now." />
          <Snapshot title="Client Input Needed" icon={Users} items={clientNeeded} empty="No client input pending. Production can continue without a decision delay." />
        </div>
      </div>

      <div className="mt-6 panel p-5">
        <h3 className="text-lg font-black text-navy">Launch Readiness Snapshot</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {launchChecklist.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold text-navy">{item.item}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={item.status} />
                <Badge className={priorityStyles[item.priority]}>{item.priority}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CommandSignal({ label, value, alert = false }) {
  return (
    <div className={cx("rounded-md border p-4", alert ? "border-red-300/40 bg-red-400/10" : "border-white/10 bg-white/10")}>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-300">{label}</p>
    </div>
  );
}

function Snapshot({ title, icon: Icon, items, empty }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-gold" />
        <h3 className="text-lg font-black text-navy">{title}</h3>
      </div>
      {items.length ? <TaskList tasks={items} compact /> : <EmptyState icon={Icon} title={title} copy={empty} compact />}
    </div>
  );
}

function TaskList({ tasks: taskList, compact = false }) {
  return (
    <div className="space-y-3">
      {taskList.map((task) => (
        <div key={task.id} className="rounded-md border border-slate-200 bg-white p-4 transition hover:border-gold/50 hover:shadow-lift">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-black text-navy">{task.task}</p>
              {!compact && <p className="mt-1 text-sm leading-6 text-slate-600">{task.nextAction}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={task.status} />
              <Badge className={priorityStyles[task.priority]}>{task.priority}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCommandCenter() {
  const [filters, setFilters] = useState({ phase: "All", category: "All", status: "All", priority: "All", responsible: "All" });
  const [query, setQuery] = useState("");

  const filteredTasks = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesFilters = Object.entries(filters).every(([key, value]) => value === "All" || task[key] === value);
      const haystack = [task.task, task.notes, task.clientInput, task.nextAction].join(" ").toLowerCase();
      return matchesFilters && (!text || haystack.includes(text));
    });
  }, [filters, query]);

  return (
    <>
      <SectionHeader
        eyebrow="Tracker"
        title="Task Command Center"
        copy="Filter the rollout by phase, category, status, priority, and owner. The data is static and easy to edit in the tracker data file."
      />

      <div className="panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks, notes, input, next action"
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-gold/30 focus:border-gold focus:ring-4"
            />
          </label>
          <FilterSelect label="Phase" value={filters.phase} options={phases} onChange={(value) => setFilters((prev) => ({ ...prev, phase: value }))} />
          <FilterSelect label="Category" value={filters.category} options={categories} onChange={(value) => setFilters((prev) => ({ ...prev, category: value }))} />
          <FilterSelect label="Status" value={filters.status} options={statuses} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
          <FilterSelect label="Priority" value={filters.priority} options={priorities} onChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))} />
          <FilterSelect label="Owner" value={filters.responsible} options={teamMembers} onChange={(value) => setFilters((prev) => ({ ...prev, responsible: value }))} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lift">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <Target size={17} className="text-gold" />
          Showing <span className="text-navy">{filteredTasks.length}</span> of <span className="text-navy">{tasks.length}</span> tracker items
        </div>
        <div className="flex flex-wrap gap-2">
          {phases.map((phase) => <PhaseBadge key={phase} phase={phase} />)}
        </div>
      </div>

      <div className="mt-5 hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift xl:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              {["Task", "Category", "Phase", "Responsible Party", "Status", "Priority", "Due Date", "Client Input Needed", "Notes", "Next Action"].map((heading) => (
                <th key={heading} className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <tr key={task.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                <td className="px-4 py-4 font-black leading-5 text-navy">{task.task}</td>
                <td className="px-4 py-4 text-slate-600">{task.category}</td>
                <td className="px-4 py-4"><PhaseBadge phase={task.phase} /></td>
                <td className="px-4 py-4">{task.responsible}</td>
                <td className="px-4 py-4"><StatusBadge status={task.status} /></td>
                <td className="px-4 py-4"><Badge className={priorityStyles[task.priority]}>{task.priority}</Badge></td>
                <td className="px-4 py-4">{task.dueDate || "Parked"}</td>
                <td className="px-4 py-4 leading-5 text-slate-600">{task.clientInput}</td>
                <td className="px-4 py-4 leading-5 text-slate-600">{task.notes}</td>
                <td className="px-4 py-4 leading-5 text-slate-600">{task.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 xl:hidden">
        {filteredTasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </div>

      {!filteredTasks.length && (
        <div className="mt-5">
          <EmptyState icon={Filter} title="No tasks match this view" copy="Adjust a filter or search term to bring items back into focus." />
        </div>
      )}
    </>
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
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
    </label>
  );
}

function TaskCard({ task }) {
  return (
    <div className="panel overflow-hidden">
      <div className={cx("h-1", task.phase === "Phase 1" ? "bg-gold" : task.phase === "Retainer" ? "bg-blue-500" : task.phase === "Phase 2" ? "bg-olive" : task.phase === "Phase 3" ? "bg-cyan-500" : "bg-zinc-400")} />
      <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-navy">{task.task}</p>
          <p className="mt-1 text-sm text-slate-500">{task.category} / {task.responsible}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PhaseBadge phase={task.phase} />
          <StatusBadge status={task.status} />
          <Badge className={priorityStyles[task.priority]}>{task.priority}</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Due Date" value={task.dueDate || "Parked"} />
        <Info label="Client Input Needed" value={task.clientInput} />
        <Info label="Notes" value={task.notes} />
        <Info label="Next Action" value={task.nextAction} />
      </div>
      </div>
    </div>
  );
}

function PhaseScope() {
  return (
    <>
      <SectionHeader
        eyebrow="Locked Scope"
        title="Phase 1: Setup Only"
        copy="Only the five deliverables below belong to Phase 1. Dynamic systems, web forms, WhatsApp, AI, databases, dashboards, applicant tracking, and ongoing management are parked separately."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {phaseDeliverables.map((item) => (
          <div key={item.title} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-xl font-black text-navy">{item.title}</h3>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Checklist title="Included" items={item.included} positive />
              <Checklist title="Not included / later" items={item.notIncluded} />
            </div>
            <div className="mt-5 rounded-md bg-slate-50 p-4 text-sm">
              <Info label="Client input needed" value={item.clientInput} />
              <div className="mt-3"><Info label="Notes" value={item.notes} /></div>
            </div>
          </div>
        ))}
      </div>
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

function LaterPhases() {
  return (
    <>
      <SectionHeader
        eyebrow="Separated Work"
        title="Retainer: Keep It Running"
        copy="These items are visible for planning, but they are not included in the Phase 1 setup fee."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ItemGroup title="Retainer: Keep It Running" items={retainerItems} tone="retainer" />
        {Object.entries(futurePhaseItems).map(([title, items]) => (
          <ItemGroup key={title} title={title} items={items} tone={title.includes("Out") ? "separate" : "future"} />
        ))}
      </div>
    </>
  );
}

function ItemGroup({ title, items, tone }) {
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

function ClientAssets() {
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
              <Badge className={asset.requirement === "Required" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{asset.requirement}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={asset.status} />
              {asset.dueDate && <Badge className="border-gold/40 bg-gold/10 text-[#795000]">{asset.dueDate}</Badge>}
            </div>
            <div className="mt-4 text-sm">
              <Info label="Responsible party" value={asset.responsible} />
              <div className="mt-3"><Info label="Notes" value={asset.notes} /></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function LaunchReadiness() {
  const done = launchChecklist.filter((item) => item.status === "Done").length;
  const percent = Math.round((done / launchChecklist.length) * 100);
  return (
    <>
      <SectionHeader
        eyebrow="Go-Live Control"
        title="Launch Readiness"
        copy="This view prevents the brands from going public before the foundation is approved, tested, and handover-ready."
      />
      <div className="panel p-5">
        <ProgressBar value={percent} label="Readiness complete" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {launchChecklist.map((item) => (
          <div key={item.id} className="panel p-4">
            <div className="flex gap-3">
              <ClipboardCheck className="mt-1 shrink-0 text-gold" size={18} />
              <div>
                <h3 className="font-black text-navy">{item.item}</h3>
                <p className="mt-1 text-sm text-slate-500">Owner: {item.owner}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={item.status} />
                  <Badge className={priorityStyles[item.priority]}>{item.priority}</Badge>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ScopeBoundaries() {
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

function EmptyState({ icon: Icon, title, copy, compact = false }) {
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

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function labelPhase(phase) {
  if (phase === "Phase 1") return "Phase 1: Setup";
  if (phase === "Retainer") return "Retainer: Keep It Running";
  if (phase === "Phase 2") return "Phase 2: Public Growth";
  if (phase === "Phase 3") return "Phase 3: Systems & Automation";
  return phase;
}

export default App;
