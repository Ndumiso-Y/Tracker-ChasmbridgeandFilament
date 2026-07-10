import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { RESPONSIBILITY, ticketResponsibility, requestResponsibility, reviewResponsibility } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import { cx } from '../utils/cx';
import { CheckCircle2, ChevronRight, Hourglass, Sparkles } from 'lucide-react';

// The client contributor's operating home (V4A.14): one question — WHAT
// NEEDS MY ATTENTION? Derived entirely from the client's legitimately
// accessible records via the existing RLS-owned collaborationService reads
// (requests, tickets, weekly reviews). No new store, no internal delivery
// health, no internal programme controls. Every action opens the exact
// record through the shared record-target mechanism.

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function ClientAttentionHome({ onOpenRecord = null }) {
  const { profile } = useAuth();
  const [data, setData] = useState({ requests: [], tickets: [], reviews: [] });
  const [state, setState] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let mounted = true;
    (async () => {
      setState('loading');
      try {
        // Authenticated RLS-owned reads only — the client sees exactly what
        // their own policies allow, nothing else.
        const [requests, tickets, reviews] = await Promise.all([
          collaborationService.getRequests(),
          collaborationService.getTickets(),
          collaborationService.getReviews(),
        ]);
        if (!mounted) return;
        setData({ requests: requests || [], tickets: tickets || [], reviews: reviews || [] });
        setState('ready');
      } catch (err) {
        console.error(err);
        if (mounted) setState('error');
      }
    })();
    return () => { mounted = false; };
  }, [profile]);

  const open = (view, recordId) => {
    if (onOpenRecord) onOpenRecord({ view, recordId });
  };

  // --- NEEDS YOUR ATTENTION: things only the client can move forward ---
  const needsMe = [];

  data.requests.forEach((rq) => {
    if (requestResponsibility(rq) !== RESPONSIBILITY.CLIENT) return;
    const guided = !!GUIDED_REVIEW_CONFIGS[rq.template_id];
    needsMe.push({
      key: `req-${rq.id}`,
      title: rq.title,
      meta: [
        guided ? 'Guided review in progress' : 'Embark is waiting on your input',
        rq.tracker_items?.title ? `Delivery item: ${rq.tracker_items.title}` : null,
      ].filter(Boolean).join(' · '),
      action: guided ? 'Continue Review' : 'Respond',
      view: 'client_input',
      recordId: rq.id,
      urgency: rq.client_reported_urgency,
    });
  });

  data.reviews.forEach((rv) => {
    if (reviewResponsibility(rv) !== RESPONSIBILITY.CLIENT) return;
    // Only reviews this client may actually complete: assigned to them, or
    // unassigned (claimable) — mirrors the register's isMyPending contract.
    if (rv.assigned_contributor_user_id && rv.assigned_contributor_user_id !== profile?.user_id) return;
    needsMe.push({
      key: `review-${rv.id}`,
      title: `Weekly Delivery Review — ${rv.entity}`,
      meta: `${rv.review_period_start} to ${rv.review_period_end}`,
      action: 'Complete Review',
      view: 'weekly_review',
      recordId: rv.id,
    });
  });

  data.tickets.forEach((tk) => {
    if (tk.status !== 'Resolved') return;
    needsMe.push({
      key: `ticket-${tk.id}`,
      title: tk.title,
      meta: 'Embark marked this issue resolved — please confirm or reopen',
      action: 'Confirm Resolution',
      view: 'support',
      recordId: tk.id,
      urgency: tk.client_reported_urgency,
    });
  });

  // --- WAITING ON EMBARK: submitted, now Embark's to act on ---
  const waitingOnEmbark = [];

  data.requests.forEach((rq) => {
    if (requestResponsibility(rq) !== RESPONSIBILITY.EMBARK) return;
    waitingOnEmbark.push({
      key: `req-${rq.id}`,
      title: rq.title,
      meta: rq.submitted_at ? `Submitted ${timeAgo(rq.submitted_at)}` : 'With Embark',
      view: 'client_input',
      recordId: rq.id,
    });
  });

  data.tickets.forEach((tk) => {
    if (ticketResponsibility(tk) !== RESPONSIBILITY.EMBARK) return;
    waitingOnEmbark.push({
      key: `ticket-${tk.id}`,
      title: tk.title,
      meta: tk.created_at ? `Raised ${timeAgo(tk.created_at)}` : 'Open with Embark',
      view: 'support',
      recordId: tk.id,
    });
  });

  data.reviews.forEach((rv) => {
    if (reviewResponsibility(rv) !== RESPONSIBILITY.EMBARK) return;
    waitingOnEmbark.push({
      key: `review-${rv.id}`,
      title: `Weekly Delivery Review — ${rv.entity}`,
      meta: rv.submitted_at ? `Submitted ${timeAgo(rv.submitted_at)} — Embark is reviewing your feedback` : 'With Embark',
      view: 'weekly_review',
      recordId: rv.id,
    });
  });

  // --- RECENTLY COMPLETED (compact) ---
  const completed = [
    ...data.requests.filter(rq => requestResponsibility(rq) === RESPONSIBILITY.DONE).map(rq => ({ key: `req-${rq.id}`, title: rq.title, at: rq.updated_at || rq.created_at })),
    ...data.tickets.filter(tk => tk.status === 'Closed').map(tk => ({ key: `ticket-${tk.id}`, title: tk.title, at: tk.updated_at || tk.created_at })),
    ...data.reviews.filter(rv => reviewResponsibility(rv) === RESPONSIBILITY.DONE).map(rv => ({ key: `review-${rv.id}`, title: `Weekly Review — ${rv.entity}`, at: rv.submitted_at })),
  ].sort((a, b) => ((a.at || '') > (b.at || '') ? -1 : 1)).slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          {profile?.display_name ? `Welcome, ${profile.display_name}` : 'Client Collaboration'}
        </p>
        <h1 className="mt-1 text-3xl font-black text-navy tracking-tight">Your Attention</h1>
        <p className="mt-1 text-slate-500 max-w-xl">Everything Embark needs from you, and everything you're waiting on from Embark — in one place.</p>
      </div>

      {state === 'loading' && (
        <div className="p-8 text-slate-500">Checking what needs your attention...</div>
      )}
      {state === 'error' && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          Your items could not be loaded. Please refresh, or open Requests, Support & Tickets, or Weekly Reviews directly.
        </div>
      )}

      {state === 'ready' && (
        <>
          {/* NEEDS YOUR ATTENTION */}
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-600" />
              <h2 className="text-sm font-black uppercase tracking-wide text-amber-700">Needs Your Attention</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{needsMe.length}</span>
            </div>
            {needsMe.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                <p className="font-bold text-navy">Nothing needs you right now.</p>
                <p className="mt-1 text-sm text-slate-500">When Embark requests input, opens a weekly review, or resolves one of your tickets, it will appear here first.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {needsMe.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => open(item.view, item.recordId)}
                    className="group flex w-full items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-navy">{item.title}</p>
                        <ResponsibilityBadge value={RESPONSIBILITY.CLIENT} />
                        {item.urgency && item.urgency !== 'Normal' && (
                          <span className="text-xs font-bold text-red-600">{item.urgency}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{item.meta}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy shadow-sm transition group-hover:bg-gold/90">
                      {item.action} <ChevronRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* WAITING ON EMBARK */}
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Hourglass size={15} className="text-navy/60" />
              <h2 className="text-sm font-black uppercase tracking-wide text-navy/70">Waiting on Embark</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{waitingOnEmbark.length}</span>
            </div>
            {waitingOnEmbark.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">Nothing is currently with Embark on your behalf.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {waitingOnEmbark.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => open(item.view, item.recordId)}
                    className="group flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cx('truncate text-sm font-bold text-navy')}>{item.title}</p>
                        <ResponsibilityBadge value={RESPONSIBILITY.EMBARK} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{item.meta}</p>
                    </div>
                    <ChevronRight size={15} className="shrink-0 text-slate-300 transition group-hover:text-gold" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* RECENTLY COMPLETED */}
          {completed.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">
                <CheckCircle2 size={14} /> Recently Completed
              </span>
              {completed.map(c => (
                <span key={c.key} className="text-xs text-slate-500">{c.title}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
