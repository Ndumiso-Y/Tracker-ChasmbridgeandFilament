import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import { requestResponsibility, RESPONSIBILITY } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { displayRequestStatus } from '../utils/statusLanguage';
import { cx } from '../utils/cx';
import { BookOpen, Presentation, ChevronRight, CheckCircle } from 'lucide-react';

// Filament Reviews lens (V4A.15): the Company Profile and Presentation
// reviews are ongoing, high-value programmes — not transactional requests —
// so they get a dedicated, always-findable surface. This is a LENS, not a
// second store: every card renders live client_input_requests /
// client_input_review_entries truth through the same persona-correct reads
// the Requests register uses, and Continue opens the exact record through
// the shared record-target mechanism.

// Each programme may span template versions: the Presentation programme
// covers the corrected 61-slide template (v2, used for all NEW reviews) AND
// the retired 43-slide template (historical persisted reviews stay fully
// readable). Totals are always taken from each request's OWN template
// config — never a global count.
const PROGRAMMES = [
  {
    templateIds: ['template-filament-profile-review'],
    createTemplateId: 'template-filament-profile-review',
    title: 'Company Profile Review',
    unit: 'pages',
    icon: BookOpen,
    description: 'Structured review of all 16 Company Profile pages.',
  },
  {
    templateIds: ['template-filament-slides-review-v2', 'template-filament-slides-review'],
    // New presentation reviews are ALWAYS created against the corrected
    // 61-slide v2 template — v1 exists only for historical persisted reviews.
    createTemplateId: 'template-filament-slides-review-v2',
    title: 'Presentation Review',
    unit: 'slides',
    icon: Presentation,
    description: 'Structured slide-by-slide review of the full 61-slide Filament presentation.',
    // The wizard identifies every slide by its real number, title and
    // section; the slide's full visual content lives in the deployed deck,
    // reviewed side by side.
    deckUrl: 'https://ndumiso-y.github.io/FilamentSlides/',
  },
];

export default function FilamentReviews({ selectedAuthorId = '', onOpenRecord = null, onNavigate = null }) {
  const { profile, isClient } = useAuth();
  const [requests, setRequests] = useState([]);
  const [entryCounts, setEntryCounts] = useState({}); // requestId -> reviewed count (authenticated persona)
  const [state, setState] = useState('loading'); // loading | ready | needs-editor | error
  // Live template availability: the 61-slide v2 template ships in the
  // pending filament_presentation_61_slide_review.sql migration — until it
  // runs, starting a new presentation review is honestly impossible and the
  // card says so instead of failing on a foreign key.
  const [liveTemplateIds, setLiveTemplateIds] = useState(null); // null = unknown
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setState('loading');
      try {
        let rows = null;
        if (profile) {
          rows = await collaborationService.getRequests();
        } else if (selectedAuthorId) {
          rows = await collaborationService.getInternalClientInputRequests(selectedAuthorId);
        }
        if (!mounted) return;
        if (rows === null) {
          setState('needs-editor');
          setRequests([]);
          return;
        }
        const guided = (rows || []).filter(r => GUIDED_REVIEW_CONFIGS[r.template_id] && !r.archived_at);
        setRequests(guided);

        // Progress: the internal register RPC already carries
        // review_completed; the authenticated read does not, so count the
        // active reviews' persisted entries directly (RLS-owned).
        if (profile) {
          const counts = {};
          const actives = PROGRAMMES
            .map(p => pickActive(guided, p.templateIds))
            .filter(Boolean);
          for (const req of actives) {
            try {
              const entries = await collaborationService.getReviewEntries(req.id);
              counts[req.id] = (entries || []).filter(e => e.review_status !== 'Not Reviewed').length;
            } catch (err) {
              console.error(err);
            }
          }
          if (mounted) setEntryCounts(counts);
        }
        if (mounted) setState('ready');

        // Which review templates physically exist in the live database
        // (anon-readable templates policy) — drives the Start Review
        // availability honestly.
        try {
          const tpls = await collaborationService.getTemplates();
          if (mounted) setLiveTemplateIds((tpls || []).map(t => t.id));
        } catch (err) {
          console.error(err);
          if (mounted) setLiveTemplateIds(null);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setState('error');
      }
    })();
    return () => { mounted = false; };
  }, [profile, selectedAuthorId]);

  const open = (recordId) => {
    if (onOpenRecord) onOpenRecord({ view: 'client_input', recordId });
  };

  // Start a new programme review directly from its card (internal Active
  // Editor path — same narrow create RPC as Request Client Input, with the
  // programme's template preset), then open the wizard on the exact record.
  const handleStartReview = async (prog) => {
    if (!selectedAuthorId) {
      setStartError('Select an Active Editor in the sidebar to start a review.');
      return;
    }
    setStartBusy(true);
    setStartError(null);
    try {
      const created = await collaborationService.createInternalClientInputRequest({
        authorId: selectedAuthorId,
        title: `${prog.title} — ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        entity: 'Filament',
        templateId: prog.createTemplateId,
        contributorUserId: null,
        approverAuthorId: null,
        contextNote: null,
        clientReportedUrgency: 'Normal',
      });
      if (created) open(created.id);
    } catch (err) {
      console.error(err);
      setStartError(err.message || 'The review could not be started.');
    } finally {
      setStartBusy(false);
    }
  };

  function pickActive(rows, templateIds) {
    return rows
      .filter(r => templateIds.includes(r.template_id) && requestResponsibility(r) !== RESPONSIBILITY.DONE)
      .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1))[0] || null;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Filament Reviews</h1>
        <p className="text-slate-500 max-w-xl">The ongoing Company Profile and Presentation review programmes — current progress, where to continue, and everything previously submitted.</p>
      </div>

      {state === 'needs-editor' && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Select an Active Editor in the sidebar to load the review programmes.
        </div>
      )}
      {state === 'error' && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          The review programmes could not be loaded. Please refresh and try again.
        </div>
      )}
      {state === 'loading' && <div className="p-8 text-slate-500">Loading review programmes...</div>}

      {state === 'ready' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {PROGRAMMES.map(prog => {
            const rows = requests
              .filter(r => prog.templateIds.includes(r.template_id))
              .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1));
            const active = pickActive(requests, prog.templateIds);
            const history = rows.filter(r => !active || r.id !== active.id);
            // Total always comes from the active request's OWN template
            // version (61 for v2, 43 for a historical v1 still in flight).
            const total = active ? (GUIDED_REVIEW_CONFIGS[active.template_id]?.items.length || 0) : 0;
            const done = active
              ? (typeof active.review_completed !== 'undefined' ? Number(active.review_completed) : (entryCounts[active.id] ?? null))
              : null;
            const pct = active && done !== null && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
            const Icon = prog.icon;

            return (
              <div key={prog.templateIds[0]} className="rounded-xl border border-slate-200 bg-white shadow-lift overflow-hidden">
                <div className="border-b border-slate-100 bg-navy p-5 text-white">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-gold" />
                    <h2 className="text-lg font-black">{prog.title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{prog.description}</p>
                  {prog.deckUrl && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      The review is a quick slide-by-slide form — view the deck separately if needed:{' '}
                      <a href={prog.deckUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-gold underline hover:text-gold/80">
                        open presentation ↗
                      </a>
                    </p>
                  )}
                </div>

                <div className="p-5">
                  {active ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-navy">{active.title}</p>
                        <ResponsibilityBadge value={requestResponsibility(active)} />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{displayRequestStatus(active.status, isClient)}</p>
                      {done !== null && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>{done} of {total} {prog.unit} reviewed</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => open(active.id)}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 transition-all"
                      >
                        Continue Review <ChevronRight size={15} />
                      </button>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      {startError && (
                        <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{startError}</p>
                      )}
                      {liveTemplateIds !== null && !liveTemplateIds.includes(prog.createTemplateId) ? (
                        // Honest dependency state: the template ships in the
                        // pending migration — nothing can start before it runs.
                        <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                          <span className="font-bold">Review template not installed yet.</span>{' '}
                          Run the pending migration <span className="font-mono">filament_presentation_61_slide_review.sql</span> in Supabase, then start the {prog.unit === 'slides' ? '61-slide' : ''} review here.
                        </p>
                      ) : !isClient ? (
                        <div>
                          <p>No active review yet.</p>
                          <button
                            type="button"
                            onClick={() => handleStartReview(prog)}
                            disabled={startBusy}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 transition-all disabled:opacity-60"
                          >
                            {startBusy ? 'Starting…' : `Start ${prog.title}`} <ChevronRight size={15} />
                          </button>
                          {!selectedAuthorId && (
                            <p className="mt-2 text-xs text-amber-700">Select an Active Editor in the sidebar first.</p>
                          )}
                        </div>
                      ) : (
                        <p>
                          No active review. Embark opens these — or submit one via{' '}
                          <button type="button" onClick={() => onNavigate && onNavigate('client_input')} className="font-bold text-navy underline hover:text-gold">
                            Requests
                          </button>.
                        </p>
                      )}
                    </div>
                  )}

                  {history.length > 0 && (
                    <div className="mt-5 border-t border-slate-100 pt-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Previous Reviews</p>
                      <div className="mt-1 divide-y divide-slate-100">
                        {history.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => open(r.id)}
                            className="group flex w-full items-center justify-between gap-2 py-2 text-left"
                          >
                            <span className="min-w-0 truncate text-sm text-slate-600">{r.title}</span>
                            <span className={cx(
                              'flex shrink-0 items-center gap-1 text-xs font-bold',
                              requestResponsibility(r) === RESPONSIBILITY.DONE ? 'text-emerald-600' : 'text-slate-400'
                            )}>
                              {requestResponsibility(r) === RESPONSIBILITY.DONE && <CheckCircle size={12} />}
                              {displayRequestStatus(r.status, isClient)}
                              <ChevronRight size={13} className="text-slate-300 group-hover:text-gold" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
