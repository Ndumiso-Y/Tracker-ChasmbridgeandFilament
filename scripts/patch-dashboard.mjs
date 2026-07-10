import fs from 'fs';
import path from 'path';

const dashboardPath = path.resolve('./src/views/Dashboard.jsx');

const newDashboardContent = `import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Flag,
  Sparkles,
  Users,
  Activity,
  History,
  Info
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
  const deliveryWindowTasks = tasks.filter((t) => t.phase === "Phase 2" || t.phase === "Phase 3");
  const currentFocus = deliveryWindowTasks.filter((task) => ["In Progress", "Blocked"].includes(task.status) || task.deliveryLane === "This Week").slice(0, 5);
  const blockers = deliveryWindowTasks.filter((task) => task.deliveryLane === "Blocked" || task.status === "Blocked");
  const awaitingApprovals = deliveryWindowTasks.filter((task) => task.approvalStatus === "Awaiting Approval" || task.deliveryLane === "Awaiting Approval").slice(0, 5);
  
  const phaseOneActive = tasks.filter((task) => task.phase === "Phase 1" && task.status !== "Done").length;
  const launchReady = launchChecklist.filter((item) => item.status === "Done").length;
  const launchPercent = launchChecklist.length ? Math.round((launchReady / launchChecklist.length) * 100) : 0;

  const statCards = [
    ["Phase 2 Progress", \`\${metrics.p2Progress}%\`, BarChart3],
    ["Phase 3 Health", metrics.p3Health, Activity],
    ["Awaiting Approval", metrics.awaitingApproval, CheckCircle2],
    ["Blocked", metrics.deliveryBlocked, AlertTriangle],
    ["Due This Week", metrics.dueThisWeek, Sparkles],
    ["Overdue", metrics.overdue, CalendarClock],
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
      <div className="mb-4 rounded bg-gold/10 border border-gold/30 p-3 text-xs font-bold text-[#795000] flex items-center gap-2">
        <Info size={16} />
        <span><strong>Package 3 Review Context:</strong> The programme is currently undergoing a one-month review and support period to establish active operational cadence.</span>
      </div>

      <div className="mb-6 overflow-hidden rounded-lg border border-navy/10 bg-navy shadow-premium">
        <div className="grid gap-0 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="p-5 text-white md:p-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Executive Command Center</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">Phase 2 + Phase 3 Delivery Window</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
              The programme has moved from digital foundation setup to active growth, publishing, and cohort management.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <CommandSignal label="Days Remaining" value={metrics.daysRemaining} />
              <CommandSignal label="Items Awaiting Approval" value={metrics.awaitingApproval} />
              <CommandSignal label="Blocked Deliveries" value={metrics.deliveryBlocked} alert={metrics.deliveryBlocked > 0} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 md:p-7 xl:border-l xl:border-t-0">
            <div className="rounded-lg border border-white/10 bg-white/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold flex items-center gap-2">
                <History size={14} /> Historical Foundation
              </p>
              <div className="mt-5 space-y-5">
                <ProgressBar value={metrics.phaseProgress} label="Phase 1 setup complete" dark />
                <ProgressBar value={launchPercent} label="Launch readiness complete" dark />
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Phase 1 metrics are preserved for historical audit and reference context. The focus is now on operational delivery.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {statCards.map(([label, value, Icon]) => (
          <div key={label} className="panel group p-5 transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-premium">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
              <span className="rounded-md bg-gold/10 p-1.5 text-gold transition group-hover:bg-gold group-hover:text-navy">
                <Icon size={16} />
              </span>
            </div>
            <p className="text-2xl font-black text-navy">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Now Moving</p>
              <h3 className="mt-1 text-xl font-black text-navy">Current Focus</h3>
            </div>
            <Badge className="border-gold/40 bg-gold/10 text-[#795000]">Active Execution</Badge>
          </div>
          <TaskList tasks={currentFocus} />
        </div>

        <div className="space-y-5">
          <Snapshot title="Awaiting Approval" icon={CheckCircle2} items={awaitingApprovals} empty="No items waiting for approval." />
          <Snapshot title="Blockers" icon={AlertTriangle} items={blockers} empty="No delivery blockers recorded." />
        </div>
      </div>

      <div className="mt-6 panel p-5 opacity-70">
        <h3 className="text-sm font-black text-slate-600 flex items-center gap-2">
          <History size={16} /> Launch Readiness Snapshot (Phase 1 Context)
        </h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {launchChecklist.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold text-slate-600 text-sm">{item.item}</p>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {isAdmin && onUpdateLaunchItem ? (
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item, e.target.value, e)}
                    className={cx(
                      "pill cursor-pointer border outline-none font-bold text-[10px] rounded-full px-2 py-0.5 appearance-none text-center opacity-80",
                      statusStyles[item.status] || statusStyles["Not Started"]
                    )}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s} className="bg-white text-navy font-normal">{s}</option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge status={item.status} className="text-[10px] px-2 py-0.5" />
                )}
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
`;

fs.writeFileSync(dashboardPath, newDashboardContent, 'utf8');
console.log('Dashboard.jsx updated successfully.');
