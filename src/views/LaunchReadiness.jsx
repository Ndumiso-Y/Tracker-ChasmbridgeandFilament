import { ClipboardCheck } from "lucide-react";
import { launchChecklist as staticLaunchChecklist, statuses } from "../data/trackerData";
import { SectionHeader } from "../components/SectionHeader";
import { ProgressBar } from "../components/ProgressBar";
import { Badge, StatusBadge, priorityStyles, statusStyles } from "../components/Badge";
import { cx } from "../utils/cx";

export function LaunchReadiness({
  launchChecklist = staticLaunchChecklist,
  userRole = null,
  onUpdateLaunchItem = null
}) {
  const done = launchChecklist.filter((item) => item.status === "Done").length;
  const percent = launchChecklist.length ? Math.round((done / launchChecklist.length) * 100) : 0;
  const isAdmin = userRole === "admin";

  const handleStatusChange = async (item, val, e) => {
    const success = await onUpdateLaunchItem(item.id, { status: val });
    if (!success && e) {
      e.target.value = item.status;
    }
  };

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
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  {isAdmin && onUpdateLaunchItem ? (
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

export default LaunchReadiness;
