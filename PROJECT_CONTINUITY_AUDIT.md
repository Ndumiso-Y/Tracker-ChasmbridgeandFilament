# Project Continuity, Architecture, and Decision-History Audit

Date: 2026-06-02  
Project: Chasm Bridge & Filament Tracker  
Repository state audited: Vite React static tracker app, build verified with `npm.cmd run build`

## 1. Executive Summary

This project is a project command center for Embark Digitals' Phase 1 Digital Foundation & Launch Setup work for Chasm Bridge and Filament. It presents the rollout as an executive tracker: what is included in Phase 1, what is waiting on client input, what is blocked, what is actively moving, and what has intentionally been moved into retainer, future phases, or separate quote territory.

The project exists to solve a delivery and scope-control problem. Chasm Bridge and Filament need several launch-foundation items: email setup, static landing pages, logo work, social account setup, client asset collection, and launch readiness. At the same time, the surrounding opportunity space includes larger systems such as forms, WhatsApp integration, dashboards, CRM/applicant tracking, AI-supported documentation, Google/SEO, and ongoing social/media/domain support. Without a visible command center, Phase 1 could blur into later systems work and create delivery risk.

The users are Embark Digitals as the delivery owner, the client team as decision/input owners, and any senior stakeholder who needs a quick view of rollout posture. A future developer, product owner, or AI assistant is also a secondary user because the tracker encodes the business agreement in structured project data.

Success looks like:

- Phase 1 remains narrow, explainable, and handover-ready.
- Client dependencies are visible before they block delivery silently.
- Retainer and future-phase items are acknowledged without being accidentally treated as included.
- Launch readiness can be assessed quickly.
- The tracker can be deployed statically without backend infrastructure.

## 2. Current Project State

The current project is a working static React application. It uses Vite, React 19, React Router's `HashRouter`, Tailwind CSS, and `lucide-react` icons. It has one main application component and one structured data module.

What currently exists:

- A sidebar-driven command center with seven views: Dashboard, Task Command Center, Phase 1 Scope, Retainer / Later Phases, Client Assets, Launch Readiness, and Scope Boundaries.
- A structured static dataset containing task records, deliverables, client assets, launch checklist items, scope groups, retainer items, and future-phase items.
- Dashboard metrics computed from the static task data.
- Search and filtering across tasks by phase, category, status, priority, owner, and text query.
- Responsive table/card layouts for desktop and smaller screens.
- Static hosting support for both Vercel and GitHub Pages through Vite base-path logic.

What works:

- The production build passes.
- Navigation works locally inside one React surface.
- Filtering and search logic are functional for the static task list.
- Phase/status/priority badge systems are consistent across views.
- The current product story is clear: foundation first, ongoing systems later.

What is partially complete:

- The tracker is operational as a read-only project dashboard, but not as an editable workflow system.
- Reporting exists as lightweight dashboard metrics, not formal exports, audit trails, recurring reports, or role-based summaries.
- The notes system exists only as static text fields in committed data.
- Ownership exists as string fields, not authenticated users or permissions.

What remains outstanding:

- No editable task updates from the UI.
- No persistence beyond committed source code.
- No backend database.
- No Supabase integration.
- No realtime sync.
- No merge/conflict handling.
- No backup/export workflow apart from source control and static deployment artifacts.
- No formal tests.

Current maturity level: early production utility / internal command center. It is mature enough to communicate scope and delivery status, but not mature enough to be treated as a collaborative project-management platform.

## 3. System Architecture

### Frontend

The frontend is a single-page Vite React app.

Primary structure:

- `src/main.jsx` mounts the app inside `React.StrictMode` and wraps it in `HashRouter`.
- `src/App.jsx` contains the full UI: navigation, dashboard, task table/cards, scope views, asset views, launch readiness, and boundary messaging.
- `src/data/trackerData.js` contains all project records and list constants.
- `src/styles.css` defines Tailwind layers plus shared component classes.
- `tailwind.config.js` defines the project palette, shadows, and font stack.
- `vite.config.js` switches base path between GitHub Pages and Vercel.

Major UI modules inside `App.jsx`:

- `Dashboard`: executive rollup, current focus, blockers, client input, launch readiness snapshot.
- `TaskCommandCenter`: filterable/searchable task tracker.
- `PhaseScope`: the five locked Phase 1 deliverables and their included/excluded boundaries.
- `LaterPhases`: retainer and future-phase planning buckets.
- `ClientAssets`: client-side materials needed for production.
- `LaunchReadiness`: go-live checklist and readiness percentage.
- `ScopeBoundaries`: client-friendly scope taxonomy and working agreement.

Navigation:

- Navigation is not route-based despite using `HashRouter`.
- The current view is held in local React state: `activeView`.
- Mobile sidebar visibility is held in local React state: `mobileOpen`.
- The navigation items are an in-file array with stable IDs and icons.

State management:

- UI state is local component state only.
- Derived metrics use `useMemo`.
- There is no global store, reducer, server cache, or query library.
- Project data is imported as immutable module data from `trackerData.js`.

### Backend

There is no backend in the audited project.

Database:

- No database client exists.
- No Supabase package or client initialization exists.
- No schema, migrations, row-level security, or API calls exist.

Tables:

- No physical tables exist.
- Conceptual tables can be inferred from arrays: tasks, deliverables, client assets, launch checklist, scope groups, retainer items, future-phase items.

Sync logic:

- No sync logic exists.
- There is no fetch, mutation, polling, subscription, or offline queue.

APIs:

- No HTTP APIs are consumed or exposed.
- The app is fully static at runtime.

### Storage

LocalStorage:

- Not used.
- No local preference storage, local draft storage, backup key, or recovery key exists.

Database:

- Not used.

Metadata structures:

- Metadata exists as fields in static JavaScript objects: `id`, `phase`, `category`, `responsible`, `status`, `priority`, `dueDate`, `clientInput`, `notes`, and `nextAction`.
- The static metadata is important because the UI logic depends on exact string values matching filter options and style maps.

### Realtime

Current sync model:

- None.
- Updates require editing source data and redeploying.

Merge logic:

- None.

Conflict handling:

- None.
- The only conflict surface today is source control if multiple people edit `trackerData.js`.

## 4. Data Model

The main entities are static JavaScript arrays and objects.

Tasks:

- Main operational entity.
- Fields: `id`, `task`, `category`, `phase`, `responsible`, `status`, `priority`, `dueDate`, `clientInput`, `notes`, `nextAction`.
- Used for dashboard counts, current focus, blocker/client-input snapshots, task filtering, table rows, and mobile cards.

Phase deliverables:

- Represent the formal Phase 1 commercial scope.
- Fields: `title`, `description`, `included`, `notIncluded`, `status`, `notes`, `clientInput`.
- Used to explain what Phase 1 includes and excludes.

Client assets:

- Represent information/materials required from the client.
- Fields: `id`, `asset`, `requirement`, `status`, `responsible`, `notes`, `dueDate`.
- Generated from a source list using `.map`.

Launch checklist:

- Represents go-live readiness.
- Fields: `id`, `item`, `status`, `owner`, `priority`.
- Used to compute launch readiness percentage.

Scope items:

- Represent scope categories and boundary language.
- Fields: `label`, `items`, `tone`.
- Used in the Scope Boundaries view.

Retainer and future phase items:

- Represent work intentionally outside active Phase 1.
- `retainerItems` is a simple array.
- `futurePhaseItems` is an object keyed by phase/category title.

Important contracts:

- Status strings must match `statuses` and `statusStyles`.
- Phase strings must match `phases`, `phaseStyles`, and `labelPhase`.
- Priority strings must match `priorities` and `priorityStyles`.
- Task filter keys must match task object fields: `phase`, `category`, `status`, `priority`, `responsible`.
- `dueDate: ""` means parked/later work and is displayed as `Parked`.
- Sensitive credentials must not be stored in tracker data; the current data explicitly says email handover should include no secrets in the tracker.

Status system:

- Active statuses: Not Started, In Progress, Waiting on Client, Blocked, Done.
- Boundary statuses: Moved to Retainer, Moved to Phase 2, Moved to Phase 3, Out of Scope.
- The status system is both operational and commercial: it tracks progress while also protecting scope.

Notes system:

- Notes are static descriptive text.
- Notes clarify dependencies, scope exclusions, handover expectations, and future-phase positioning.
- There is no threaded comment history or timestamped note model.

## 5. Project Evolution Timeline

The Git reflog shows three commits on `main`.

### 1. Initial Chasm Bridge Filament tracker dashboard

Approximate local date: 2026-06-01.

This appears to be the original version. It established the central idea: a command center for Chasm Bridge and Filament rollout management. The likely first decision was to build a static, deployable tracker rather than a backend-driven project-management system. That choice fits the problem: the urgent need was clarity, alignment, and scope control, not a complex collaboration platform.

Why this mattered:

- It made the tracker fast to build and easy to deploy.
- It avoided infrastructure work before the project scope had justified it.
- It encoded Phase 1 boundaries directly into the product experience.

### 2. Polish executive tracker command center

Approximate local date: 2026-06-01.

This commit indicates a shift from a basic tracker toward an executive-facing dashboard. The app's current language, visual hierarchy, status badges, command-center framing, and dashboard cards all point to a product decision: the tracker should not merely list tasks; it should help stakeholders understand launch posture.

Why this mattered:

- Senior stakeholders need summaries before details.
- The dashboard makes blockers and client dependencies more visible.
- The product becomes a communication artifact, not just a task table.

### 3. Final QA polish for tracker

Approximate local date: 2026-06-01.

This commit suggests final refinements to readiness, visual polish, responsive behavior, and static hosting quality. The current build config supports GitHub Pages and Vercel, which is an important deployment turning point.

Why this mattered:

- The app became launchable as a static artifact.
- `HashRouter` and Vite base-path handling reduce static-hosting navigation risk.
- The work reached a stable handoff point.

Important caveat: this repository has a short visible history. There is no evidence in the current checkout of an earlier Supabase/localStorage/realtime version. If such a version existed outside this repo, it is not represented here.

## 6. Decision History

### Product decision: command center instead of generic task list

What was considered:

- A plain checklist or spreadsheet-like task table.
- A richer command center with dashboards, scope boundaries, and launch posture.

What was chosen:

- A command center with executive rollups and task-level detail.

Why:

- The main risk is not just incomplete tasks; it is misunderstanding what is included, what is blocked, and what belongs later.

### Product decision: Phase 1 setup only

What was considered:

- Including dynamic systems, dashboards, forms, AI support, applicant tracking, and ongoing management.
- Keeping Phase 1 limited to foundation setup and handover readiness.

What was chosen:

- Phase 1 includes email setup, logo concepts/revisions, static landing pages, and social setup.
- Retainer/future-phase/separate-quote items are visible but separated.

Why:

- Narrow scope protects delivery quality, timeline, commercial boundaries, and client expectations.

### UX decision: sidebar navigation with named operational views

What was considered:

- A single long page.
- Separate view tabs/sections.

What was chosen:

- Sidebar navigation with seven focused views.

Why:

- Different stakeholders need different slices: executives need dashboard posture, delivery needs tasks, client-facing conversations need boundaries/assets/readiness.

### UX decision: badges for phase, status, and priority

What was considered:

- Text-only fields.
- Visual taxonomy using color-coded pills.

What was chosen:

- Badge system with consistent status, phase, and priority styles.

Why:

- The tracker depends on fast scanning. Visual status language makes blockers, client waits, and parked work easier to detect.

### Architecture decision: static data module

What was considered:

- Backend database and editable app.
- Static dataset committed in source.

What was chosen:

- Static data in `src/data/trackerData.js`.

Why:

- The current need is a deployable scope and accountability artifact.
- Static data removes auth, database, sync, and security complexity.
- It makes the project's scope contract inspectable in code.

Tradeoff:

- Updates require code changes and redeployment.
- There is no live multi-user collaboration.

### Deployment decision: support both Vercel and GitHub Pages

What was considered:

- One static host with one base path.
- Conditional base path for different static hosts.

What was chosen:

- Vite base path uses `/Tracker-ChasmbridgeandFilament/` for non-Vercel production builds and `/` when `VERCEL=1`.

Why:

- GitHub Pages needs the repository subpath; Vercel does not.
- This reduces deployment friction across both environments.

## 7. Current Business Logic

Accountability logic:

- Each task and asset has a `responsible` field.
- Launch checklist items use `owner`.
- Responsibility is informational only; there are no user accounts, role permissions, or assignment workflows.

Ownership logic:

- Embark Digitals owns delivery work.
- Client Team, Monique Phillis, Dr. Rudy Phillis, and Jazmin appear as client-side or stakeholder owners.
- Ownership is used to make dependencies visible and prevent client-input items from appearing as delivery negligence.

Reporting logic:

- Dashboard totals are derived from task status, priority, due dates, and phase.
- Current focus is the first five tasks with In Progress, Blocked, or Waiting on Client status.
- Blockers are all tasks with Blocked status.
- Client input needed is the first five tasks with Waiting on Client status.
- Launch readiness is the percentage of launch checklist items marked Done.

Dashboard logic:

- The dashboard prioritizes executive awareness:
  - Total tasks.
  - Done count.
  - In-progress count.
  - Waiting-on-client count.
  - Blocked count.
  - High-priority count.
  - Tasks with due dates.
  - Phase 1 progress.
  - Launch readiness progress.

Notes logic:

- Notes explain context, dependencies, and boundaries.
- They are used in task search and display.
- They are not editable or historical.

Status logic:

- Statuses do double duty:
  - Operational state: Not Started, In Progress, Waiting on Client, Blocked, Done.
  - Scope state: Moved to Retainer, Moved to Phase 2, Moved to Phase 3, Out of Scope.

Timeline logic:

- Phase 1 dates are hard-coded around June 2026.
- Later-phase and retainer items use blank due dates and display as Parked.
- There is no date math, sorting, calendar view, overdue logic, or timezone handling.

## 8. Data Protection Mechanisms

Backup protections:

- Source control is the primary backup mechanism.
- Static deployment artifacts can be rebuilt from source.
- There is no in-app backup/export feature.

LocalStorage protections:

- None needed currently because localStorage is not used.
- There is no risk of browser-local task data being lost because no task data is stored in the browser.

Supabase protections:

- Not applicable in the current implementation.
- There is no Supabase client, database, or realtime subscription to protect.

Metadata protections:

- Metadata is protected only by source code review discipline and exact string consistency.
- The main protection is centralized constants for statuses, phases, categories, priorities, and team members.
- There is no schema validator.

Realtime protections:

- Not applicable.
- No realtime layer means no realtime data-loss risk, but also no multi-user update flow.

What could cause data loss:

- Editing `trackerData.js` incorrectly and committing/removing records.
- Multiple people editing static data and resolving Git conflicts poorly.
- Deploying from an outdated branch.
- Adding persistence later without migration/backup discipline.
- Storing credentials in notes, then exposing them through the public static app.

What currently prevents data loss:

- The data is source-controlled.
- The app has no destructive UI actions.
- There are no client-side writes.
- The tracker explicitly warns that secrets should not be stored in tracker data.

## 9. Risks & Technical Debt

### High

No real persistence or editing workflow:

- All updates require source edits and redeploys.
- This is acceptable for a static command center but risky if used as a live project-management tool.

Public/static data exposure:

- If deployed publicly, every task note and client dependency is visible to anyone with the URL unless hosting access controls are added.
- No sensitive data or credentials should ever be placed in this app.

No formal data validation:

- The UI relies on exact status/phase/priority strings.
- A typo can silently break styling, filtering, or reporting meaning.

### Medium

Single-file UI concentration:

- `App.jsx` holds all views and shared components.
- This is manageable now, but future edits will get harder as behavior grows.

Static generated IDs:

- Some IDs are generated from array indexes.
- Reordering arrays changes IDs, which is acceptable for static display but unsafe if IDs become persistence keys later.

No tests:

- Build passes, but no unit/component/regression tests exist.
- Filtering, metric calculation, and data-contract assumptions are untested.

Reporting limitations:

- Metrics are useful but shallow.
- There is no overdue logic, owner workload view, weekly report, dependency report, or export.

### Low

Bundle asset size:

- The inspiration image is roughly 1.9 MB in the production build.
- This is acceptable for an internal tool but could be optimized.

Router mismatch:

- `HashRouter` is present, but navigation is state-based rather than route-based.
- This is harmless now, but future developers may expect route URLs to map to views.

Date handling:

- Dates are static strings.
- No immediate issue, but future reporting would need proper date parsing and overdue rules.

## 10. Lessons Learned

Mistakes or likely risks already avoided:

- The project avoided building backend infrastructure before the value of a static command center was proven.
- It avoided mixing Phase 1 delivery with retainer/future systems work.
- It avoided storing secrets in the tracker.

What was learned:

- The central product value is boundary clarity as much as task tracking.
- A small static app can be more useful than a heavy system when the immediate need is alignment.
- Status language must represent both delivery progress and commercial scope.

What future developers should avoid:

- Do not casually turn future-phase items into Phase 1 items.
- Do not add secrets, passwords, mailbox credentials, API keys, or private client documents to static data.
- Do not introduce localStorage or database writes without a backup/export and migration plan.
- Do not treat generated index-based IDs as durable database IDs.
- Do not split scope data from task data in a way that makes the commercial boundary harder to audit.

Practices that should continue:

- Keep scope boundaries explicit.
- Keep client dependencies visible.
- Keep Phase 1, retainer, future-phase, and separate-quote work clearly separated.
- Preserve build/deployment simplicity unless the product need justifies more infrastructure.
- Use centralized data constants for statuses, phases, priorities, categories, and owners.

## 11. Current Priorities

### Immediate

Add a data contract validation layer or tests.

Why:

- The app's correctness depends on static data strings and fields.
- A lightweight test can catch missing IDs, invalid statuses, invalid phases, duplicate IDs, and typo-driven reporting breakage.

Clarify hosting/privacy posture.

Why:

- If the app is public, task/client-input data may be exposed.
- The project should explicitly decide whether this is public, private, or access-controlled.

### Next

Modularize `App.jsx`.

Why:

- The single-file approach is still functional, but future changes will be easier if major views and shared components are split.

Add reporting enhancements.

Why:

- Owner summaries, overdue detection, client-dependency reports, and launch-readiness exports would make the tracker more operationally useful.

### Later

Evaluate editable persistence.

Why:

- If multiple stakeholders need live updates, static source edits will become limiting.
- A future database should be introduced only with auth, backup, validation, and migration planning.

Introduce route-addressable views.

Why:

- Deep links to dashboard/tasks/assets would help stakeholder communication.
- This can use the existing `HashRouter` more fully.

## 12. What A New AI Engineer Must Understand Before Touching This Project

Project philosophy:

- This is a scope-protection and launch-readiness command center, not merely a pretty task list.
- The most important product idea is: Phase 1 builds the foundation, retainer keeps it running, future phases scale the system.
- The app should help prevent accidental scope creep while keeping future opportunities visible.

Data protection principles:

- Never store secrets in tracker data.
- Treat the static app as potentially public unless access control is confirmed.
- Preserve source-control history as the current backup mechanism.
- Before adding persistence, define backup, export, validation, migration, and rollback behavior.

Architectural constraints:

- Current architecture is static React plus committed data.
- There is no backend, Supabase, realtime sync, API layer, or localStorage.
- Do not assume database tables exist.
- Do not invent realtime conflict handling unless implementing a real persistence model.

Non-negotiables:

- Keep Phase 1 deliverables separate from retainer, later phases, and separate-quote work.
- Keep client dependencies explicit.
- Keep ownership fields visible.
- Keep launch readiness visible.
- Keep credentials out of the tracker.
- Preserve static deployment reliability unless a stronger product requirement exists.

Known risks:

- Static data can drift or break through typos.
- Public deployment can expose client/project details.
- Index-generated IDs should not become permanent database IDs.
- Adding editable state without backup and validation would create avoidable data-loss risk.

Existing decisions that should not be undone casually:

- `HashRouter` and conditional Vite base path exist to support static hosting.
- The status taxonomy intentionally includes both progress statuses and scope-routing statuses.
- Retainer/future/out-of-scope items are intentionally visible so they can be discussed without being included in Phase 1.
- The current tracker is intentionally read-only; editing workflows need deliberate architecture.

## 13. Final Verdict

Overall project health score: 7.5 / 10

Product maturity score: 7 / 10

- Strong for a scope and delivery-communication tool.
- Not mature as a collaborative work-management product.

Architecture maturity score: 6.5 / 10

- Clean and suitable for the current static use case.
- Needs modularization and validation before expanding.

Data integrity score: 6 / 10

- Source-controlled static data is safe from accidental UI writes.
- No schema validation, tests, or private storage controls exist.

UX score: 8 / 10

- Clear navigation, strong scanning patterns, useful dashboard framing.
- Could improve deep linking, reporting exports, and date/owner views.

Scalability score: 5 / 10

- Scales well as a static stakeholder artifact.
- Does not scale to multi-user editing, live operations, or complex reporting without new architecture.

What is excellent:

- The project understands its real product problem: protecting delivery scope while making progress visible.
- The Phase 1 versus retainer/future/separate-quote separation is unusually clear.
- The UI is coherent, responsive, and stakeholder-friendly.
- Static deployment is simple and currently works.

What needs attention:

- Data contract validation.
- Privacy/access-control decision.
- Modularization if ongoing development continues.
- Reporting depth if the tracker becomes an operational system rather than a presentation/control artifact.

What should happen next:

1. Add tests or a validation script for `trackerData.js`.
2. Decide whether the deployed tracker is public or private.
3. Split major views into modules once the next meaningful feature is added.
4. Only consider Supabase/localStorage/realtime after defining auth, backups, durable IDs, conflict rules, and migration strategy.

