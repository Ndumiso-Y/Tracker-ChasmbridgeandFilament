import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { GUIDED_REVIEW_CONFIGS } from '../data/guidedReviewConfigs';
import { requestResponsibility, RESPONSIBILITY } from '../utils/responsibility';
import { displayRequestStatus } from '../utils/statusLanguage';
import { cx } from '../utils/cx';
import ReviewComparisonPanel from '../components/ReviewComparisonPanel';
import { explainDbError } from '../utils/dbErrors';
import CopyLinkButton from '../components/CopyLinkButton';
import {
  buildExactReviewPath,
  buildExactReviewUrl,
  buildReviewOrganisationPath,
  buildReviewProgrammeUrl,
  ORG_SLUGS,
  PROGRAMME_SLUGS,
} from '../utils/trackerRoutes';
import { BookOpen, Presentation, Globe2, CalendarCheck, ChevronRight, CheckCircle, ExternalLink, X } from 'lucide-react';

// Reviews lens (V4A.15, multi-reviewer V4A.23): structured Company Profile,
// Presentation, Website and Social Strategy reviews are ongoing, high-value
// programmes, not transactional requests. This is a lens over the same
// client_input_requests and client_input_review_entries truth used by the
// Requests register. One reviewer pass = one request; sibling passes for the
// same asset and cycle share a review_group_id (a Review Round). Legacy
// records (no round identity) stay visible as truthful single reviews.
const PROGRAMMES = [
  {
    organisation: 'Filament',
    entity: 'Filament',
    templateIds: ['template-filament-profile-review'],
    createTemplateId: 'template-filament-profile-review',
    programmeSlug: 'company-profile',
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
    programmeSlug: 'presentation',
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
    programmeSlug: 'website',
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
    organisation: 'Filament',
    entity: 'Filament',
    templateIds: ['template-filament-social-media-strategy-review-v1'],
    createTemplateId: 'template-filament-social-media-strategy-review-v1',
    programmeSlug: 'social-media-strategy',
    title: '3-Month Social Media Strategy',
    actionTitle: 'Strategy Review',
    unit: 'sections',
    icon: CalendarCheck,
    description: 'Review the strategic direction, audiences, technical content pillars, monthly calendar, calls to action, approval workflow and measurement plan for 13 July-13 October 2026.',
    setupPendingTitle: 'Strategy Review Setup Pending',
    setupPendingMessage: 'The Filament Social Media Strategy Review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.',
  },
  {
    organisation: 'Chasm Bridge Charity',
    entity: 'Chasm Bridge Charity',
    templateIds: ['template-chasm-bridge-website-review-v1'],
    createTemplateId: 'template-chasm-bridge-website-review-v1',
    programmeSlug: 'website',
    title: 'Chasm Bridge Charity Website',
    actionTitle: 'Website Review',
    unit: 'sections',
    icon: Globe2,
    description: 'Review the charity website content, programme details, impact claims, contact paths and digital business cards.',
    liveUrl: 'https://www.chasmbridgecharity.org',
    setupPendingTitle: 'Chasm Website Review Setup Pending',
    setupPendingMessage: 'The Chasm Bridge Charity Website Review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.',
  },
  {
    organisation: 'Chasm Bridge Charity',
    entity: 'Chasm Bridge Charity',
    templateIds: ['template-chasm-bridge-social-media-strategy-review-v1'],
    createTemplateId: 'template-chasm-bridge-social-media-strategy-review-v1',
    programmeSlug: 'social-media-strategy',
    title: '3-Month Social Media Strategy',
    actionTitle: 'Strategy Review',
    unit: 'sections',
    icon: CalendarCheck,
    description: 'Review the graduate-development messaging, audiences, monthly calendar, sponsor and funder communication, approval workflow and measurement plan for 13 July-13 October 2026.',
    setupPendingTitle: 'Strategy Review Setup Pending',
    setupPendingMessage: 'The Chasm Bridge Charity Social Media Strategy Review workspace has not been activated yet. Once activated, you can start and continue the review directly from here.',
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

// Reviewer-pass display status: Submitted / In Progress / Awaiting Reviewer.
function passStatus(pass, done) {
  if (requestResponsibility(pass) === RESPONSIBILITY.DONE) return 'Submitted';
  if ((done ?? 0) > 0) return 'In Progress';
  return 'Awaiting Reviewer';
}

const PASS_STATUS_TONE = {
  Submitted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'In Progress': 'bg-gold/10 text-[#795000] border-gold/40',
  'Awaiting Reviewer': 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function FilamentReviews({ selectedAuthorId = '', onOpenRecord = null, onNavigate = null, authors = [], routeTarget = null }) {
  const { profile, isClient } = useAuth();
  const [requests, setRequests] = useState([]);
  const [entryCounts, setEntryCounts] = useState({});
  const [state, setState] = useState('loading');
  const [liveTemplateIds, setLiveTemplateIds] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Reviewer picker: { mode: 'start' | 'add', prog, round } — one dialog for
  // "Who will review this asset?" on Start and for Add Reviewer.
  const [picker, setPicker] = useState(null);
  const [pickedReviewerIds, setPickedReviewerIds] = useState([]);
  // Compare Feedback panel: { prog, round }
  const [comparison, setComparison] = useState(null);

  const isEmbarkEditor = !!authors.find(a => a.id === selectedAuthorId && a.organisation_label === 'Embark Digitals');
  const activeAuthors = authors.filter(a => a.is_active);

  useEffect(() => {
    if (!routeTarget?.organisationSlug) return;
    const id = routeTarget.programmeSlug
      ? `review-programme-${routeTarget.organisationSlug}-${routeTarget.programmeSlug}`
      : `reviews-${routeTarget.organisationSlug}`;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [routeTarget?.organisationSlug, routeTarget?.programmeSlug, state]);

  useEffect(() => {
    const orgLabel = routeTarget?.organisationSlug === 'chasm-bridge-charity' ? 'Chasm Bridge Charity'
      : routeTarget?.organisationSlug === 'filament' ? 'Filament' : null;
    const programmeLabel = routeTarget?.programmeSlug
      ? routeTarget.programmeSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : null;
    document.title = orgLabel && programmeLabel
      ? `${orgLabel} ${programmeLabel} Reviews`
      : orgLabel
        ? `${orgLabel} Reviews`
        : 'Reviews - Tracker';
  }, [routeTarget?.organisationSlug, routeTarget?.programmeSlug]);

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

        // Authenticated client rows come from a direct RLS select without the
        // per-request review_completed projection — count entries per visible
        // pass. Internal rows already carry review_completed.
        if (profile) {
          const counts = {};
          const needCounts = guided.filter(r => typeof r.review_completed === 'undefined');
          for (const req of needCounts) {
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
  }, [profile, selectedAuthorId, reloadKey]);

  const open = (recordId, prog) => {
    const routePath = buildExactReviewPath(ORG_SLUGS[prog.organisation], prog.programmeSlug || PROGRAMME_SLUGS[prog.createTemplateId], recordId);
    if (onOpenRecord) onOpenRecord({ view: 'client_input', recordId, routePath });
  };

  const doneFor = (pass) =>
    typeof pass.review_completed !== 'undefined'
      ? Number(pass.review_completed)
      : (entryCounts[pass.id] ?? null);

  // Group a programme's requests into review rounds. A round is identified by
  // review_group_id ONLY — never inferred from template + entity, so separate
  // cycles can never merge. Legacy rows (no round identity) each display as
  // their own truthful single Legacy Review.
  const buildProgrammeState = (prog) => {
    const rows = requests.filter(r => prog.templateIds.includes(r.template_id));
    const roundMap = new Map();
    rows.forEach(r => {
      const key = r.review_group_id || `legacy-${r.id}`;
      if (!roundMap.has(key)) roundMap.set(key, { key, groupId: r.review_group_id || null, passes: [] });
      roundMap.get(key).passes.push(r);
    });
    const rounds = [...roundMap.values()]
      .map(round => ({
        ...round,
        isLegacy: !round.groupId,
        newestAt: round.passes.reduce((m, p) => ((p.created_at || '') > m ? p.created_at : m), ''),
        passes: [...round.passes].sort((a, b) =>
          ((a.reviewer_display_name || a.title || '') > (b.reviewer_display_name || b.title || '') ? 1 : -1)),
      }))
      .sort((a, b) => (a.newestAt > b.newestAt ? -1 : 1));

    const currentRound = rounds[0] || null;
    const historyRounds = rounds.slice(1);
    const expected = GUIDED_REVIEW_CONFIGS[prog.createTemplateId]?.items.length || 0;
    const totalFor = (pass) => GUIDED_REVIEW_CONFIGS[pass.template_id]?.items.length || expected;

    // Programme-level summary: the round's best asset coverage (never a
    // shared bar pretending to represent every reviewer).
    const currentBestDone = currentRound
      ? Math.max(0, ...currentRound.passes.map(p => Math.min(Number(doneFor(p)) || 0, totalFor(p))))
      : 0;
    const allSubmitted = !!currentRound && currentRound.passes.every(p => requestResponsibility(p) === RESPONSIBILITY.DONE);
    const anyActive = !!currentRound && currentRound.passes.some(p => requestResponsibility(p) !== RESPONSIBILITY.DONE);

    return {
      prog,
      rounds,
      currentRound,
      historyRounds,
      expected,
      totalFor,
      summaryDone: Math.min(currentBestDone, expected),
      isSubmitted: allSubmitted,
      hasActive: anyActive,
    };
  };

  const openPicker = (mode, prog, round = null) => {
    if (!selectedAuthorId) {
      setStartError('Select an Active Editor in the sidebar to start a review.');
      return;
    }
    setStartError(null);
    setPickedReviewerIds(mode === 'start' && selectedAuthorId ? [] : []);
    setPicker({ mode, prog, round });
  };

  const existingReviewerIds = picker?.round
    ? picker.round.passes.map(p => p.reviewer_author_id).filter(Boolean)
    : [];

  const handleConfirmPicker = async () => {
    if (!picker || pickedReviewerIds.length === 0) return;
    setStartBusy(true);
    setStartError(null);
    try {
      if (picker.mode === 'start') {
        const prog = picker.prog;
        const titleBase = `${prog.actionTitle || prog.title} - ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        const created = await collaborationService.createInternalReviewRound({
          authorId: selectedAuthorId,
          templateId: prog.createTemplateId,
          entity: prog.entity || 'Filament',
          titleBase,
          reviewerAuthorIds: pickedReviewerIds,
        });
        setPicker(null);
        setReloadKey(k => k + 1);
        // A single-reviewer round keeps the old fast path straight into the form.
        if ((created || []).length === 1) open(created[0].id);
      } else {
        for (const reviewerId of pickedReviewerIds) {
          await collaborationService.addInternalReviewerPass({
            authorId: selectedAuthorId,
            reviewGroupId: picker.round.groupId,
            reviewerAuthorId: reviewerId,
          });
        }
        setPicker(null);
        setReloadKey(k => k + 1);
      }
    } catch (err) {
      console.error(err);
      setStartError(explainDbError(err, 'review workspace'));
    } finally {
      setStartBusy(false);
    }
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
            const orgSlug = ORG_SLUGS[group.label];
            const sectionId = `reviews-${orgSlug}`;

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
                      <CopyLinkButton
                        getUrl={() => `${window.location.origin}${window.location.pathname}#${buildReviewOrganisationPath(orgSlug)}`}
                        label="Copy Organisation Review Link"
                      />
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${group.label} review completion`} aria-valuenow={groupPct} aria-valuemin="0" aria-valuemax="100">
                    <div className={cx('h-full rounded-full', treatment.progress)} style={{ width: `${groupPct}%` }} />
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  {groupStates.map(({ prog, currentRound, historyRounds, expected, totalFor, isSubmitted }) => {
                    const Icon = prog.icon;
                    return (
                      <div
                        key={prog.createTemplateId}
                        id={`review-programme-${ORG_SLUGS[prog.organisation]}-${prog.programmeSlug}`}
                        className={cx('rounded-xl border border-t-4 border-slate-200 bg-white shadow-lift overflow-hidden scroll-mt-24', treatment.card, routeTarget?.organisationSlug === ORG_SLUGS[prog.organisation] && routeTarget?.programmeSlug === prog.programmeSlug && 'ring-2 ring-gold/60')}
                      >
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
                          <div className="mt-3">
                            <CopyLinkButton
                              getUrl={() => buildReviewProgrammeUrl(ORG_SLUGS[prog.organisation], prog.programmeSlug)}
                              label="Copy Programme Link"
                            />
                          </div>
                        </div>

                        <div className="p-5">
                          {currentRound ? (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                                  {currentRound.isLegacy ? 'Legacy Review' : 'Current Review Round'}
                                </p>
                                {isSubmitted && (
                                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                                    <CheckCircle size={12} /> All reviewers submitted
                                  </span>
                                )}
                              </div>

                              {/* One row PER reviewer pass — separate progress,
                                  separate resume, separate submission. Never one
                                  bar pretending to represent everyone. */}
                              <div className="mt-2 space-y-3">
                                {currentRound.passes.map(pass => {
                                  const total = totalFor(pass);
                                  const rawDone = doneFor(pass);
                                  const done = rawDone === null ? null : Math.min(Number(rawDone) || 0, total);
                                  const pct = done !== null && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                                  const status = passStatus(pass, done);
                                  return (
                                    <div key={pass.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="min-w-0 truncate text-sm font-bold text-navy">
                                          {pass.reviewer_display_name || (currentRound.isLegacy ? 'Legacy Review' : displayRequestStatus(pass.status, isClient))}
                                        </p>
                                        <span className={cx('rounded-full border px-2 py-0.5 text-[10px] font-bold', PASS_STATUS_TONE[status])}>{status}</span>
                                      </div>
                                      {done !== null && (
                                        <div className="mt-2">
                                          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                                            <span>{done} of {total} {prog.unit} reviewed</span>
                                            <span>{pct}%</span>
                                          </div>
                                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${pass.reviewer_display_name || prog.title} review completion`} aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                                            <div className={cx('h-full rounded-full', treatment.progress)} style={{ width: `${pct}%` }} />
                                          </div>
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => open(pass.id, prog)}
                                        className={cx('mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1', treatment.cta)}
                                      >
                                        <span className="truncate">{status === 'Submitted' ? 'View Review Submission' : (prog.actionTitle ? `Continue ${prog.actionTitle}` : 'Continue Review')}</span>
                                        <ChevronRight size={14} className="shrink-0" />
                                      </button>
                                      <CopyLinkButton
                                        getUrl={() => buildExactReviewUrl(ORG_SLUGS[prog.organisation], prog.programmeSlug, pass.id)}
                                        label="Copy Review Link"
                                        className="mt-2"
                                      />
                                    </div>
                                  );
                                })}
                              </div>

                              {startError && (
                                <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{startError}</p>
                              )}
                              {!isClient && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {!currentRound.isLegacy && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openPicker('add', prog, currentRound)}
                                        className={cx('rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2', treatment.ghostCta)}
                                      >
                                        Add Reviewer
                                      </button>
                                      {currentRound.passes.length >= 2 && (
                                        <button
                                          type="button"
                                          onClick={() => setComparison({ prog, round: currentRound })}
                                          className={cx('rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2', treatment.ghostCta)}
                                        >
                                          Compare Feedback
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {isSubmitted && (
                                    <button
                                      type="button"
                                      onClick={() => openPicker('start', prog)}
                                      className={cx('rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2', treatment.ghostCta)}
                                    >
                                      Start New Review Round
                                    </button>
                                  )}
                                </div>
                              )}
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
                                    onClick={() => openPicker('start', prog)}
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

                          {historyRounds.length > 0 && (
                            <div className="mt-5 border-t border-slate-100 pt-3">
                              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Previous Review Rounds</p>
                              <div className="mt-1 divide-y divide-slate-100">
                                {historyRounds.flatMap(round => round.passes.map(r => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => open(r.id, prog)}
                                    className="group flex w-full items-center justify-between gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
                                  >
                                    <span className="min-w-0 truncate text-sm text-slate-600">
                                      {round.isLegacy ? `Legacy Review — ${r.title}` : r.title}
                                    </span>
                                    <span className={cx(
                                      'flex shrink-0 items-center gap-1 text-xs font-bold',
                                      requestResponsibility(r) === RESPONSIBILITY.DONE ? 'text-emerald-600' : 'text-slate-400'
                                    )}>
                                      {requestResponsibility(r) === RESPONSIBILITY.DONE && <CheckCircle size={12} />}
                                      {displayRequestStatus(r.status, isClient)}
                                      <ChevronRight size={13} className={cx('text-slate-300', prog.organisation === 'Chasm Bridge Charity' ? 'group-hover:text-olive' : 'group-hover:text-gold')} />
                                    </span>
                                  </button>
                                )))}
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

      {/* Reviewer picker — "Who will review this asset?" One pass is created
          per selected reviewer: separate responses, progress and submission. */}
      {picker && (
        <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Choose reviewers">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h3 className="text-lg font-bold text-navy">
                {picker.mode === 'start' ? `Start ${picker.prog.actionTitle || picker.prog.title}` : 'Add Reviewer'}
              </h3>
              <button type="button" onClick={() => setPicker(null)} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm font-bold text-navy mb-1">Who will review this asset?</p>
              <p className="text-xs text-slate-500 mb-3">
                Each person gets their own separate review — their own progress, their own responses, their own submission. Nobody can overwrite anyone else.
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {activeAuthors.map(a => {
                  const alreadyIn = picker.mode === 'add' && existingReviewerIds.includes(a.id);
                  const checked = pickedReviewerIds.includes(a.id);
                  return (
                    <label key={a.id} className={cx('flex items-center gap-2.5 rounded-lg border p-2.5 text-sm', alreadyIn ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 hover:border-gold/60 cursor-pointer')}>
                      <input
                        type="checkbox"
                        disabled={alreadyIn}
                        checked={checked}
                        onChange={() => setPickedReviewerIds(prev => (checked ? prev.filter(id => id !== a.id) : [...prev, a.id]))}
                        className="h-4 w-4 rounded border-slate-300 text-gold focus:ring-gold"
                      />
                      <span className="font-bold text-navy">{a.display_name}</span>
                      {alreadyIn && <span className="ml-auto text-[10px] font-bold uppercase text-slate-400">Already reviewing</span>}
                    </label>
                  );
                })}
              </div>
              {startError && <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{startError}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setPicker(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPicker}
                  disabled={startBusy || pickedReviewerIds.length === 0}
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy shadow-md shadow-gold/20 hover:bg-gold/90 disabled:opacity-50"
                >
                  {startBusy ? 'Working…' : picker.mode === 'start' ? 'Start Review' : 'Add Reviewer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {comparison && (
        <ReviewComparisonPanel
          prog={comparison.prog}
          round={comparison.round}
          selectedAuthorId={selectedAuthorId}
          isEmbarkEditor={isEmbarkEditor}
          onClose={() => setComparison(null)}
        />
      )}
    </div>
  );
}
