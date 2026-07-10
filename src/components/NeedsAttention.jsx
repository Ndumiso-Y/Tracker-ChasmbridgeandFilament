import { useState, useEffect } from "react";
import { AlertTriangle, Users, Building2, CheckCircle2, ChevronRight } from "lucide-react";
import { collaborationService } from "../services/collaborationService";
import { RESPONSIBILITY, ticketResponsibility, requestResponsibility, reviewResponsibility } from "../utils/responsibility";
import { cx } from "../utils/cx";

// The operating home (V4A.12): a derived action surface that answers
// "what needs attention?" before anything else. It reads the existing
// canonical records — tracker_items (via props), support_tickets,
// client_input_requests, weekly_delivery_reviews (persona-correct service
// reads) — and NEVER creates a second work store. Every item deep-links
// into the module that owns the record.

const GROUPS = [
  { key: "embark", title: "Needs Embark", icon: Building2, accent: "text-navy", border: "border-navy/20" },
  { key: "client", title: "Needs Client", icon: Users, accent: "text-amber-700", border: "border-amber-200" },
  { key: "risk", title: "At Risk / Blocked", icon: AlertTriangle, accent: "text-red-600", border: "border-red-200" },
];

// ATTENTION, defined operationally (V4A.15): something ARRIVED for this side
// to act on, or a deadline/state BROKE. Ownership is not attention — work
// Embark is simply busy with ('Requirements Confirmed', 'In Production')
// belongs to the Delivery Board and registers, never to the home focus.
const MAX_PER_GROUP = 5;

// Request statuses that are genuine Embark attention events: the client
// submitted input for review, or the client sent work back.
const EMBARK_ATTENTION_STATUSES = ['Ready for Embark Review', 'Changes Requested'];

// Deterministic ranking inside each group: urgent first, then oldest
// actionable first (the longer something has waited, the more it needs eyes).
const URGENT_VALUES = ['Urgent', 'Critical (Blocker)', 'Time Sensitive', 'High (1-2 days)'];
function rankAttention(items) {
  return items.slice().sort((a, b) => {
    const ua = URGENT_VALUES.indexOf(a.urgency) === -1 ? 1 : 0;
    const ub = URGENT_VALUES.indexOf(b.urgency) === -1 ? 1 : 0;
    if (ua !== ub) return ua - ub;
    return (a.ts || '9999') < (b.ts || '9999') ? -1 : 1;
  });
}

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NeedsAttention({ tasks = [], hasProfile = false, selectedAuthorId = "", onNavigate = null, onOpenRecord = null }) {
  const [collab, setCollab] = useState({ tickets: [], requests: [], reviews: [] });
  const [collabState, setCollabState] = useState("loading"); // loading | ready | unavailable | error

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Persona-correct reads: authenticated admin uses RLS-owned direct
      // reads; the no-session operator uses the author-validated RPCs.
      // With neither identity, collaboration signals are honestly
      // unavailable rather than silently empty.
      if (!hasProfile && !selectedAuthorId) {
        setCollabState("unavailable");
        setCollab({ tickets: [], requests: [], reviews: [] });
        return;
      }
      setCollabState("loading");
      try {
        const [tickets, requests, reviews] = await Promise.all([
          hasProfile ? collaborationService.getTickets() : collaborationService.getInternalSupportTickets(selectedAuthorId),
          hasProfile ? collaborationService.getRequests() : collaborationService.getInternalClientInputRequests(selectedAuthorId),
          hasProfile ? collaborationService.getReviews() : collaborationService.getInternalWeeklyReviews(selectedAuthorId),
        ]);
        if (!mounted) return;
        setCollab({ tickets: tickets || [], requests: requests || [], reviews: reviews || [] });
        setCollabState("ready");
      } catch (err) {
        console.error(err);
        if (mounted) setCollabState("error");
      }
    })();
    return () => { mounted = false; };
  }, [hasProfile, selectedAuthorId]);

  const today = new Date();
  const deliveryTasks = tasks.filter((t) => t.phase === "Phase 2" || t.phase === "Phase 3");

  const groups = { embark: [], client: [], risk: [] };

  // --- Delivery signals (always available from props) ---
  // Every item carries only the owning view + the record id; clicking it
  // opens the EXACT record via the shared record-target mechanism.
  deliveryTasks.forEach((t) => {
    if (t.status === "Done") return;
    if (t.status === "Blocked" || t.deliveryLane === "Blocked") {
      groups.risk.push({ key: `task-blocked-${t.id}`, title: t.task, meta: "Delivery item blocked", badge: RESPONSIBILITY.BLOCKED, action: "Open Delivery Item", view: "tasks", recordId: t.id, ts: t.blockedSince || t.dueDate || "" });
    } else if (t.dueDate && new Date(t.dueDate) < today) {
      groups.risk.push({ key: `task-overdue-${t.id}`, title: t.task, meta: `Overdue — was due ${t.dueDate}`, badge: RESPONSIBILITY.BLOCKED, badgeLabel: "Overdue", action: "Open Delivery Item", view: "tasks", recordId: t.id, ts: t.dueDate });
    } else if (t.status === "Waiting on Client") {
      groups.client.push({ key: `task-waiting-${t.id}`, title: t.task, meta: t.clientInput ? `Waiting for client: ${t.clientInput}` : "Waiting on client input", badge: RESPONSIBILITY.CLIENT, action: "Open Delivery Item", view: "tasks", recordId: t.id, ts: t.dueDate || "" });
    }
  });

  // --- Collaboration signals (attention events only) ---
  collab.tickets.forEach((tk) => {
    const r = ticketResponsibility(tk);
    const linkedMeta = tk.tracker_items?.title ? ` · ${tk.tracker_items.title}` : "";
    if (tk.status === "Resolved") {
      groups.client.push({ key: `ticket-${tk.id}`, title: tk.title, meta: `Resolved — awaiting client confirmation${linkedMeta}`, badge: RESPONSIBILITY.CLIENT, action: "Confirm Resolution", view: "support", recordId: tk.id, ts: tk.updated_at });
    } else if (r === RESPONSIBILITY.EMBARK) {
      // An unresolved reported issue is always an Embark attention event.
      groups.embark.push({ key: `ticket-${tk.id}`, title: tk.title, meta: `Support ticket open${linkedMeta}`, urgency: tk.client_reported_urgency, when: timeAgo(tk.created_at), action: "Review Ticket", view: "support", recordId: tk.id, ts: tk.created_at });
    }
  });

  collab.requests.forEach((rq) => {
    if (rq.archived_at) return; // archived records leave every active lens
    const r = requestResponsibility(rq);
    const clientOriginated = ["Client-Originated Requirement", "Internally Logged Client Requirement"].includes(rq.request_origin);
    const linkedMeta = rq.tracker_items?.title ? ` · ${rq.tracker_items.title}` : "";
    // Embark side: only arrival events qualify. Work Embark already owns
    // ('Requirements Confirmed', 'In Production') is NOT attention.
    if (EMBARK_ATTENTION_STATUSES.includes(rq.status)) {
      groups.embark.push({ key: `req-${rq.id}`, title: rq.title, meta: (clientOriginated ? "Client requested changes" : "Client input returned — review it") + linkedMeta, urgency: rq.client_reported_urgency, when: timeAgo(rq.submitted_at || rq.created_at), action: "Review Request", view: "client_input", recordId: rq.id, ts: rq.submitted_at || rq.created_at });
    } else if (r === RESPONSIBILITY.CLIENT) {
      groups.client.push({ key: `req-${rq.id}`, title: rq.title, meta: `Waiting for client input${linkedMeta}`, badge: RESPONSIBILITY.CLIENT, action: "Continue Request", view: "client_input", recordId: rq.id, ts: rq.created_at });
    }
  });

  collab.reviews.forEach((rv) => {
    const r = reviewResponsibility(rv);
    const period = `${rv.review_period_start} – ${rv.review_period_end}`;
    if (r === RESPONSIBILITY.CLIENT) {
      groups.client.push({ key: `review-${rv.id}`, title: `Weekly Delivery Review — ${rv.entity}`, meta: `${period} · Reviewer: ${rv.assigned_contributor_name || "Unassigned"}`, badge: RESPONSIBILITY.CLIENT, action: "Complete Review", view: "weekly_review", recordId: rv.id, ts: rv.created_at });
    } else if (r === RESPONSIBILITY.EMBARK) {
      groups.embark.push({ key: `review-${rv.id}`, title: `Weekly Delivery Review — ${rv.entity}`, meta: `${period} · Client submitted — review scores`, when: timeAgo(rv.submitted_at), action: "Review Feedback", view: "weekly_review", recordId: rv.id, ts: rv.submitted_at });
    }
  });

  // Deterministic ranking inside every group.
  groups.embark = rankAttention(groups.embark);
  groups.client = rankAttention(groups.client);
  groups.risk = rankAttention(groups.risk);

  // --- Recently completed (small, secondary): Embark's accountability strip
  // includes collaboration wins, not just delivery tasks. ---
  const recentlyCompleted = [
    ...deliveryTasks.filter((t) => t.status === "Done" && t.completedAt).map((t) => ({ key: `t-${t.id}`, title: t.task, at: t.completedAt })),
    ...collab.tickets.filter((tk) => tk.status === "Closed").map((tk) => ({ key: `tk-${tk.id}`, title: `Ticket closed: ${tk.title}`, at: tk.updated_at || tk.created_at })),
    ...collab.requests.filter((rq) => !rq.archived_at && requestResponsibility(rq) === RESPONSIBILITY.DONE).map((rq) => ({ key: `rq-${rq.id}`, title: `Delivered: ${rq.title}`, at: rq.updated_at || rq.submitted_at || rq.created_at })),
    ...collab.reviews.filter((rv) => rv.review_status === "Reviewed").map((rv) => ({ key: `rv-${rv.id}`, title: `Weekly review closed — ${rv.entity}`, at: rv.submitted_at || rv.created_at })),
  ]
    .sort((a, b) => ((a.at || "") > (b.at || "") ? -1 : 1))
    .slice(0, 4);

  const totalAttention = groups.embark.length + groups.client.length + groups.risk.length;

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Operating Home</p>
          <h2 className="mt-0.5 text-2xl font-black text-navy">Needs Attention</h2>
        </div>
        {collabState === "ready" && (
          <p className="text-sm font-bold text-slate-500">{totalAttention === 0 ? "All clear — nothing is waiting." : `${totalAttention} item${totalAttention === 1 ? "" : "s"} waiting for action`}</p>
        )}
      </div>

      {collabState === "unavailable" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Select an Active Editor in the sidebar to include client requests, tickets and weekly reviews here. Delivery signals are shown below.
        </div>
      )}
      {collabState === "error" && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Collaboration signals could not be loaded — delivery signals are still shown. Open the individual modules for tickets, requests and reviews.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map(({ key, title, icon: Icon, accent, border }) => {
          const items = groups[key];
          return (
            <div key={key} className={cx("rounded-lg border bg-white shadow-lift", border)}>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={accent} />
                  <h3 className={cx("text-sm font-black", accent)}>{title}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{items.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-400">
                    {collabState === "loading" ? "Checking..." : "Nothing waiting here."}
                  </p>
                ) : (
                  items.slice(0, MAX_PER_GROUP).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        // Open the exact record where the mechanism exists;
                        // fall back to module navigation only if it doesn't.
                        if (onOpenRecord && item.recordId) {
                          onOpenRecord({ view: item.view, recordId: item.recordId });
                        } else if (onNavigate) {
                          onNavigate(item.view);
                        }
                      }}
                      className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy">{item.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{item.meta}</span>
                          {item.urgency && item.urgency !== "Normal" && (
                            <span className="font-bold text-red-600">{item.urgency}</span>
                          )}
                          {item.when && <span className="text-slate-400">{item.when}</span>}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-400 transition group-hover:text-gold">
                        {item.action} <ChevronRight size={13} />
                      </span>
                    </button>
                  ))
                )}
                {items.length > MAX_PER_GROUP && (
                  <p className="px-4 py-2 text-xs font-bold text-slate-400">+ {items.length - MAX_PER_GROUP} more — the full list lives in the module registers</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {recentlyCompleted.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">
            <CheckCircle2 size={14} /> Recently Completed
          </span>
          {recentlyCompleted.map((c) => (
            <span key={c.key} className="text-xs text-slate-500">
              {c.title}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
