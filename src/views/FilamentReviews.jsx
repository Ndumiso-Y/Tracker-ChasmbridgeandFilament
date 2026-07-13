import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import { requestResponsibility, RESPONSIBILITY } from '../utils/responsibility';
import { ResponsibilityBadge } from '../components/Badge';
import { displayRequestStatus } from '../utils/statusLanguage';
import { cx } from '../utils/cx';
import { BookOpen, Presentation, Globe2, ChevronRight, CheckCircle, ExternalLink } from 'lucide-react';

// Reviews lens (V4A.15): structured Company Profile, Presentation and Website
// reviews are ongoing, high-value programmes, not transactional requests.
// This is a lens over the same client_input_requests and
// client_input_review_entries truth used by the Requests register.
const PROGRAMMES = [
  {
    organisation: 'Filament',
    entity: 'Filament',
    templateIds: ['template-filament-profile-review'],
    createTemplateId: 'template-filament-profile-review',
    title: 'Company Profile Review',
    unit: 'pages',
    icon: BookOpen,
    description: 'Structured review of all 16 Company Profile pages.',
  },
  {
    organisation: 'Filament',
    entity: 'Filament',
    templateIds: ['template-filament-slides-review-v2', 'template-filament-slides-review'],
    createTemplateId: 'template-filament-slides-review-v2',
    title: 'Presentation Review',
    unit: 'slides',
    icon: Presentation,
    description: 'Structured slide-by-slide review of the full 61-slide Filament presentation.',
    deckUrl: 'https://ndumiso-y.github.io/FilamentSlides/',
  },
  {
    organisation: 'Filament',
    entity: 'Filament',
    templateIds: ['template-filament-website-review-v1'],
    createTemplateId: 'template-filament-website-review-v1',
    title: 'Filament Website',
    actionTitle: 'Website Review',
    unit: 'sections',
    icon: Globe2,
    description: 'Review the visible website content, branding, images, facts, links and page structure.',
    liveUrl: 'https://www.filament-transformation.com',
    setupPendingTitle: 'Website Review Setup Pending',
    setupPendingMessage: 'The Website Review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.',
  },
  {
    organisation: 'Chasm Bridge Charity',
    entity: 'Chasm Bridge Charity',
    templateIds: ['template-chasm-bridge-website-review-v1'],
    createTemplateId: 'template-chasm-bridge-website-review-v1',
    title: 'Chasm Bridge Charity Website',
    actionTitle: 'Website Review',
    unit: 'sections',
    icon: Globe2,
    description: 'Review the charity website content, programme details, impact claims, contact paths and digital business cards.',
    liveUrl: 'https://www.chasmbridgecharity.org',
    setupPendingTitle: 'Chasm Website Review Setup Pending',
    setupPendingMessage: 'The Chasm Bridge Charity Website Review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.',
  },
];

const PROGRAMME_GROUPS = [
  { label: 'Filament', programmes: PROGRAMMES.filter(p => p.organisation === 'Filament') },
  { label: 'Chasm Bridge Charity', programmes: PROGRAMMES.filter(p => p.organisation === 'Chasm Bridge Charity') },
];

const ENTITY_TREATMENTS = {
  Filament: {
    badge: 'border-gold/40 bg-gold/10 text-[#795000]',
    heading: 'text-navy',
    rule: 'bg-gold',
    card: 'border-t-gold',
    header: 'bg-navy text-white',
    icon: 'text-gold',
    link: 'text-gold hover:text-gold/80 focus-visible:ring-gold/40',
    progress: 'bg-gold',
    cta: 'bg-gold text-navy shadow-gold/20 hover:bg-gold/90 focus-visible:ring-gold/40',
    ghostCta: 'border-gold/40 text-navy hover:border-gold hover:bg-gold/10 focus-visible:ring-gold/30',
  },
  'Chasm Bridge Charity': {
    badge: 'border-olive/40 bg-olive/10 text-[#4c5616]',
    heading: 'text-[#4c5616]',
    rule: 'bg-olive',
    card: 'border-t-olive',
    header: 'bg-[#4c5616] text-white',
    icon: 'text-gold',
    link: 'text-gold hover:text-gold/80 focus-visible:ring-gold/40',
    progress: 'bg-olive',
    cta: 'bg-olive text-white shadow-olive/20 hover:bg-olive/90 focus-visible:ring-olive/40',
    ghostCta: 'border-olive/40 text-[#4c5616] hover:border-olive hover:bg-olive/10 focus-visible:ring-olive/30',
  },
};

const DEFAULT_TREATMENT = ENTITY_TREATMENTS.Filament;

export default function FilamentReviews({ selectedAuthorId = '', onOpenRecord = null, onNavigate = null }) {
  const { profile, isClient } = useAuth();
  const [requests, setRequests] = useState([]);
  const [entryCounts, setEntryCounts] = useState({});
  const [state, setState] = useState('loading');
  const [liveTemplateIds, setLiveTemplateIds] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(null);

  function pickActive(rows, templateIds) {
    return rows
      .filter(r => templateIds.includes(r.template_id) && requestResponsibility(r) !== RESPONSIBILITY.DONE)
      .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1))[0] || null;
  }

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

        if (profile) {
          const counts = {};
          const currentRecords = PROGRAMMES
            .map(p => {
              const programmeRows = guided
                .filter(r => p.templateIds.includes(r.template_id))
                .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1));
              return pickActive(guided, p.templateIds) || programmeRows[0] || null;
            })
            .filter(Boolean);
          for (const req of currentRecords) {
            try {
              const entries = await collaborationService.getReviewEntries(req.id);
              const uniqueReviewed = new Set(
                (entries || [])
                  .filter(e => e.review_status !== 'Not Reviewed')
                  .map(e => e.review_item_key)
              );
              counts[req.id] = uniqueReviewed.size;
            } catch (err) {
              console.error(err);
            }
          }
          if (mounted) setEntryCounts(counts);
        }
        if (mounted) setState('ready');

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
        title: `${prog.actionTitle || prog.title} - ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        entity: prog.entity || 'Filament',
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

  const buildProgrammeState = (prog) => {
    const rows = requests
      .filter(r => prog.templateIds.includes(r.template_id))
      .sort((a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1));
    const current = rows[0] || null;
    const active = pickActive(requests, prog.templateIds);
    const displayRecord = active || current;
    const history = rows.filter(r => !displayRecord || r.id !== displayRecord.id);
    const expected = GUIDED_REVIEW_CONFIGS[prog.createTemplateId]?.items.length || 0;
    const displayTotal = displayRecord ? (GUIDED_REVIEW_CONFIGS[displayRecord.template_id]?.items.length || expected) : expected;
    const rawDone = displayRecord
      ? (typeof displayRecord.review_completed !== 'undefined' ? Number(displayRecord.review_completed) : (entryCounts[displayRecord.id] ?? null))
      : 0;
    const done = rawDone === null ? null : Math.min(Number(rawDone) || 0, displayTotal);
    const summaryDone = done === null ? 0 : Math.min(done, expected);
    const pct = done !== null && displayTotal > 0 ? Math.min(100, Math.round((done / displayTotal) * 100)) : 0;
    const responsibility = displayRecord ? requestResponsibility(displayRecord) : null;
    return {
      prog,
      rows,
      active,
      displayRecord,
      history,
      expected,
      displayTotal,
      done,
      summaryDone,
      pct,
      responsibility,
      isSubmitted: responsibility === RESPONSIBILITY.DONE,
      hasActive: !!active,
    };
  };

  const programmeStates = PROGRAMMES.map(buildProgrammeState);
  const stateByTemplate = Object.fromEntries(programmeStates.map(s => [s.prog.createTemplateId, s]));
  const overallExpected = programmeStates.reduce((sum, s) => sum + s.expected, 0);
  const overallReviewed = programmeStates.reduce((sum, s) => sum + s.summaryDone, 0);
  const overallPct = overallExpected > 0 ? Math.min(100, Math.round((overallReviewed / overallExpected) * 100)) : 0;
  const programmesInProgress = programmeStates.filter(s => s.hasActive).length;
  const submittedProgrammes = programmeStates.filter(s => s.isSubmitted).length;
  const overallMetrics = [
    { label: 'Reviewed Sections', value: `${overallReviewed} of ${overallExpected}` },
    { label: 'Programmes In Progress', value: `${programmesInProgress} of ${PROGRAMMES.length}` },
    { label: 'Submitted Programmes', value: `${submittedProgrammes} of ${PROGRAMMES.length}` },
    { label: 'Overall Completion', value: `${overallPct}%` },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-navy tracking-tight mb-2">Reviews</h1>
        <p className="text-slate-500 max-w-2xl">Structured review programmes across Filament and Chasm Bridge Charity - current progress, where to continue, and everything previously submitted.</p>
      </div>

      {state === 'ready' && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Overall review progress">
          {overallMetrics.map(metric => (
            <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{metric.label}</p>
              <p className="mt-1 text-2xl font-black text-navy">{metric.value}</p>
            </div>
          ))}
        </div>
      )}

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
        <div className="space-y-8">
          {PROGRAMME_GROUPS.map(group => {
            const treatment = ENTITY_TREATMENTS[group.label] || DEFAULT_TREATMENT;
            const groupStates = group.programmes.map(prog => stateByTemplate[prog.createTemplateId]).filter(Boolean);
            const groupExpected = groupStates.reduce((sum, s) => sum + s.expected, 0);
            const groupReviewed = groupStates.reduce((sum, s) => sum + s.summaryDone, 0);
            const groupSubmitted = groupStates.filter(s => s.isSubmitted).length;
            const groupPct = groupExpected > 0 ? Math.min(100, Math.round((groupReviewed / groupExpected) * 100)) : 0;
            const sectionId = `reviews-${group.label.replace(/\s+/g, '-').toLowerCase()}`;

            return (
              <section key={group.label} className="space-y-3" aria-labelledby={sectionId}>
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cx('h-9 w-1.5 rounded-full', treatment.rule)} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className={cx('text-[10px] font-black uppercase tracking-[0.18em]', treatment.heading)}>Entity</p>
                        <h2 id={sectionId} className="text-lg font-black text-navy leading-tight">{group.label}</h2>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                      <span className={cx('rounded-full border px-2.5 py-1', treatment.badge)}>{groupReviewed} of {groupExpected} sections reviewed</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{groupSubmitted} of {group.programmes.length} programmes submitted</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{groupPct}% complete</span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${group.label} review completion`} aria-valuenow={groupPct} aria-valuemin="0" aria-valuemax="100">
                    <div className={cx('h-full rounded-full', treatment.progress)} style={{ width: `${groupPct}%` }} />
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  {groupStates.map(({ prog, displayRecord, history, expected, displayTotal, done, pct, responsibility, isSubmitted }) => {
                    const Icon = prog.icon;
                    return (
                      <div key={prog.createTemplateId} className={cx('rounded-xl border border-t-4 border-slate-200 bg-white shadow-lift overflow-hidden', treatment.card)}>
                        <div className={cx('border-b border-white/10 p-5', treatment.header)}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon size={18} className={cx('shrink-0', treatment.icon)} aria-hidden="true" />
                              <h3 className="min-w-0 text-lg font-black leading-tight">{prog.title}</h3>
                            </div>
                            <span className={cx('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', treatment.badge)}>
                              {prog.organisation}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">{prog.description}</p>
                          {prog.deckUrl && (
                            <p className="mt-1.5 text-xs text-slate-400">
                              The review is a quick slide-by-slide form - view the deck separately if needed:{' '}
                              <a href={prog.deckUrl} target="_blank" rel="noopener noreferrer" className={cx('font-bold underline rounded-sm focus-visible:outline-none focus-visible:ring-2', treatment.link)}>
                                open presentation <ExternalLink size={12} className="inline" />
                              </a>
                            </p>
                          )}
                          {prog.liveUrl && (
                            <p className="mt-1.5 text-xs text-slate-400">
                              Review the website side by side:{' '}
                              <a href={prog.liveUrl} target="_blank" rel="noopener noreferrer" className={cx('inline-flex items-center gap-1 rounded-sm font-bold underline focus-visible:outline-none focus-visible:ring-2', treatment.link)}>
                                open live website <ExternalLink size={12} />
                              </a>
                            </p>
                          )}
                        </div>

                        <div className="p-5">
                          {displayRecord ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-navy">{displayRecord.title}</p>
                                <ResponsibilityBadge value={responsibility} />
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{displayRequestStatus(displayRecord.status, isClient)}</p>
                              {done !== null && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                                    <span>{done} of {displayTotal} {prog.unit} reviewed</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${prog.title} review completion`} aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                                    <div className={cx('h-full rounded-full', treatment.progress)} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => open(displayRecord.id)}
                                className={cx('mt-4 inline-flex max-w-full items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2', treatment.cta)}
                              >
                                <span className="truncate">{isSubmitted ? 'View Review Submission' : (prog.actionTitle ? `Continue ${prog.actionTitle}` : 'Continue Review')}</span>
                                <ChevronRight size={15} className="shrink-0" />
                              </button>
                            </>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                              {startError && (
                                <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{startError}</p>
                              )}
                              {liveTemplateIds !== null && !liveTemplateIds.includes(prog.createTemplateId) ? (
                                <p className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                  <span className="font-bold">{prog.setupPendingTitle || 'Review Setup Pending'}</span>{' '}
                                  {prog.setupPendingMessage || 'This review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.'}
                                </p>
                              ) : !isClient ? (
                                <div>
                                  <p>No active review yet.</p>
                                  <p className="mt-1 text-xs font-bold text-slate-400">Expected scope: 0 of {expected} {prog.unit} reviewed.</p>
                                  <button
                                    type="button"
                                    onClick={() => handleStartReview(prog)}
                                    disabled={startBusy}
                                    className={cx('mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold shadow-md transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2', treatment.cta)}
                                  >
                                    <span className="truncate">{startBusy ? 'Starting...' : `Start ${prog.actionTitle || prog.title}`}</span>
                                    <ChevronRight size={15} className="shrink-0" />
                                  </button>
                                  {!selectedAuthorId && (
                                    <p className="mt-2 text-xs text-amber-700">Select an Active Editor in the sidebar first.</p>
                                  )}
                                </div>
                              ) : (
                                <p>
                                  No active review. Embark opens these - or submit one via{' '}
                                  <button type="button" onClick={() => onNavigate && onNavigate('client_input')} className={cx('rounded-sm font-bold underline focus-visible:outline-none focus-visible:ring-2', treatment.ghostCta)}>
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
                                    className="group flex w-full items-center justify-between gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
                                  >
                                    <span className="min-w-0 truncate text-sm text-slate-600">{r.title}</span>
                                    <span className={cx(
                                      'flex shrink-0 items-center gap-1 text-xs font-bold',
                                      requestResponsibility(r) === RESPONSIBILITY.DONE ? 'text-emerald-600' : 'text-slate-400'
                                    )}>
                                      {requestResponsibility(r) === RESPONSIBILITY.DONE && <CheckCircle size={12} />}
                                      {displayRequestStatus(r.status, isClient)}
                                      <ChevronRight size={13} className={cx('text-slate-300', prog.organisation === 'Chasm Bridge Charity' ? 'group-hover:text-olive' : 'group-hover:text-gold')} />
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
