import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Flag,
  Sparkles,
  Users,
} from "lucide-react";
import { tasks as staticTasks, launchChecklist as staticLaunchChecklist, statuses } from "../data/trackerData";
import { Badge, StatusBadge, priorityStyles, statusStyles } from "../components/Badge";
import { ProgressBar } from "../components/ProgressBar";
import { EmptyState } from "../components/EmptyState";
import { TaskList } from "../components/TaskList";
import { cx } from "../utils/cx";

export function Dashboard({
  metrics,
  tasks = staticTasks,
  launchChecklist = staticLaunchChecklist,
  userRole = null,
  onUpdateLaunchItem = null
}) {
  const currentFocus = tasks.filter((task) => ["In Progress", "Blocked", "Waiting on Client"].includes(task.status)).slice(0, 5);
  const blockers = tasks.filter((task) => task.status === "Blocked");
  const clientNeeded = tasks.filter((task) => task.status === "Waiting on Client").slice(0, 5);
  const phaseOneActive = tasks.filter((task) => task.phase === "Phase 1" && task.status !== "Done").length;
  const launchReady = launchChecklist.filter((item) => item.status === "Done").length;
  const launchPercent = launchChecklist.length ? Math.round((launchReady / launchChecklist.length) * 100) : 0;

  const statCards = [
    ["Total tasks", metrics.total, BarChart3],
    ["Done", metrics.done, CheckCircle2],
    ["In progress", metrics.inProgress, Sparkles],
    ["Waiting on client", metrics.waiting, Users],
    ["Blocked", metrics.blocked, AlertTriangle],
    ["High priority", metrics.high, Flag],
    ["Tasks due soon", metrics.dueSoon, CalendarClock],
  ];

  const isAdmin = userRole === "admin";

  const handleStatusChange = async (item, val, e) => {
    const success = await onUpdateLaunchItem(item.id, { status: val });
    if (!success && e) {
      e.target.value = item.status;
    }
  };

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
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {isAdmin && onUpdateLaunchItem ? (
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item, e.target.value, e)}
                    className={cx(
                      "pill cursor-pointer border outline-none font-bold text-xs rounded-full px-2.5 py-0.5 appearance-none text-center",
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

export default Dashboard;
