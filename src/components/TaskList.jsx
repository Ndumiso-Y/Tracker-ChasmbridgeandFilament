import { cx } from "../utils/cx";
import { Badge, StatusBadge, priorityStyles } from "./Badge";

export function TaskList({ tasks: taskList, compact = false }) {
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
export default TaskList;
