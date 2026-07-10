# Tracker Data Dictionary
## Chasm Bridge Charity & Filament — Command Center

**Version:** 2.0
**Date:** 2026-07-05
**Authority:** PROJECT_CONTEXT_MANIFEST.md

---

## 1. Constants Reference

### 1.1 phases

Allowed values for the `phase` field on `tracker_items`:

| Value | Display Label | Description | Active? |
|---|---|---|---|
| `Phase 1` | Phase 1: Digital Foundation | Foundation phase — complete. Historical record. | Historically active; complete |
| `Phase 2` | Phase 2: Operating Foundations | Approval workflows, consent, access, analytics, content calendar. Active, parallel. | Active |
| `Phase 3` | Phase 3: Active Growth & Management | Content, social media, website care, testimonials, coordination. Active. | Active |
| `Separate Scope` | Separate Scope / Future Systems | Items requiring separate costing, technical development, or future-phase planning. Not current delivery. | Active (as boundary marker) |

> [!IMPORTANT]
> **Package 3 is NOT a phase and must not appear in the `phases` array.** Package 3 (R24,000/month one-month review arrangement) is a commercial arrangement. It is represented in the tracker through the `delivery_context` field and the `programme_settings` table.

### 1.1b delivery_context (new field)

A separate field on `tracker_items` that carries commercial/programme context alongside the phase. Allowed values:

| Value | Used For |
|---|---|
| `Package 3 Review` | Phase 2 and Phase 3 items within the current review period |
| `Historical Foundation` | All Phase 1 items |
| `Future / Separate Scope` | All Separate Scope items |
| `Phase Delivery` | Phase 2 / Phase 3 items for ongoing work beyond the current review period |

**Removed phase values (legacy — migrated):**

| Old Value | Migrated To | Reason |
|---|---|---|
| `Retainer` | `Phase 3` | Retainer activities are now active Phase 3 delivery |
| `Out of Scope` | `Separate Scope` | Clearer, commercially accurate terminology |

---

### 1.2 statuses

Allowed values for the `status` field on `tracker_items`:

| Value | Category | Used For |
|---|---|---|
| `Not Started` | Operational | Item not yet begun |
| `In Progress` | Operational | Actively being worked on |
| `Waiting on Client` | Operational | Blocked on client input |
| `Blocked` | Operational | Blocked (non-client blocker — must use `blocked_by` field) |
| `Done` | Operational | Complete |
| `Recurring — Active` | Operational | Ongoing recurring activity, currently running |
| `Deferred` | Boundary | Exists but start is parked (replaces legacy Parked for Later) |
| `Moved to Phase 2` | Routing | Item has been moved to Phase 2 scope |
| `Moved to Phase 3` | Routing | Item has been moved to Phase 3 scope |
| `Separate Scope` | Boundary | Not current delivery — requires separate scope/quote |

**Removed/deprecated status values:**

| Old Value | Treatment |
|---|---|
| `Moved to Retainer` | Migrated → items are now `Recurring — Active` in Phase 3 |
| `Out of Scope` | Migrated → `Separate Scope` |

---

### 1.3 categories

Allowed values for the `category` field on `tracker_items`:

| Value | Used For |
|---|---|
| `Strategy` | Strategic decisions, direction, comms strategy |
| `Branding` | Logo, brand identity, visual direction |
| `Domain & Email` | Domain management, email setup, mailbox care |
| `Landing Pages` | Website pages, web content, layout |
| `Social Media` | Social account management, posting, cadence |
| `Recruitment` | Recruitment messaging, application processes |
| `Client Assets` | Materials required from the client |
| `Google / SEO` | Google Profile, analytics, search hygiene |
| `Future Systems` | Legacy category — items being migrated to Separate Scope |
| `Content & Design` | Ongoing content creation, graphics, templates (Phase 3) |
| `Website Care` | Ongoing website monitoring and updates (Phase 3) |
| `Approval & Workflow` | Approval processes, turnaround agreements, workflow setup (Phase 2/3) |
| `Programme Review` | Review evidence, metrics, continuation decisions (Package 3) |
| `Testimonials & Consent` | Testimonial collection, photo/story consent (Phase 2/3) |

---

### 1.4 priorities

| Value | Meaning |
|---|---|
| `High` | Delivery-critical; due soon or blocking other work |
| `Medium` | Important but not immediately critical |
| `Low` | Context, boundary, or future reference |

---

### 1.5 teamMembers

Allowed values for the `responsible` / `owner_label` field:

| Value | Role |
|---|---|
| `Embark Digitals` | Delivery owner |
| `Dr. Rudy Phillis` | Client stakeholder — Chasm Bridge Charity |
| `Monique Phillis` | Client stakeholder — Filament (Pty) Ltd |
| `Jazmin` | Client stakeholder — role TBC |
| `Client Team` | General client responsibility |

---

## 2. tracker_items Fields

### 2.1 Core Fields (existing)

| Field | Type | Required | Values / Notes |
|---|---|---|---|
| `id` | text (PK) | Yes | Slug format, never sequential integer. Naming convention below. |
| `title` | text | Yes | Human-readable task/deliverable title |
| `entity` | text | No | `Chasm Bridge Charity` · `Filament` · `Both` |
| `phase` | text | Yes | Must be one of `phases` constant above |
| `category` | text | Yes | Must be one of `categories` constant above |
| `status` | text | Yes | Must be one of `statuses` constant above |
| `priority` | text | Yes | `High` · `Medium` · `Low` |
| `owner_label` | text | No | Must be one of `teamMembers` constant |
| `due_date` | date | No | Null = parked/no date |
| `description` | text | No | Client input needed, context, or dependencies |
| `next_action` | text | No | Immediate next step |
| `notes` | text | No | Current notes snapshot |
| `is_public` | boolean | No | `true` = visible in viewer mode; `false` = admin only |
| `created_at` | timestamptz | Auto | Set by Supabase |
| `updated_at` | timestamptz | Auto | Set by Supabase |

### 2.2 Extended Fields (Phase 2/3 maturation — added 2026-07-05)

| Field | Type | Required | Values / Notes |
|---|---|---|---|
| `record_type` | text | No | See record_type taxonomy below |
| `workstream` | text | No | `Website Care` · `Social Media` · `Content & Design` · `Coordination` · `Strategy` · `Operating Foundations` · `Programme Review` |
| `delivery_lane` | text | No | See delivery_lane taxonomy below |
| `delivery_week` | text | No | See delivery_week taxonomy below |
| `workflow_type` | text | No | `General` · `Content` · `Testimonial` |
| `workflow_stage` | text | No | Contextual within workflow_type — see below |
| `blocked_by` | text | No | Description of what is blocking (if status = Blocked) |
| `blocked_since` | date | No | Date blocking started |
| `scope_treatment` | text | No | See scope_treatment taxonomy below |
| `content_pillar` | text | No | Content pillar taxonomy — see below |
| `requires_approval` | boolean | No | `true` if client approval required before publishing/proceeding |
| `approval_status` | text | No | See approval_status taxonomy below |
| `cadence_status` | text | No | Health status for recurring activities — see below |

---

## 3. Extended Field Taxonomies

### 3.1 record_type

| Value | Use |
|---|---|
| `Task` | Default — a discrete, executable work item |
| `Deliverable` | A client-facing output or handover item |
| `Recurring Activity` | An ongoing activity without a fixed end date |
| `Approval Gate` | A checkpoint requiring client decision before proceeding |
| `Milestone` | A time-bound programme marker |
| `Risk` | An identified risk to delivery |
| `Decision` | A pending or recorded programme decision |
| `Context` | Background information or programme-level reference |

---

### 3.2 delivery_lane

Used on the July Delivery Board. Each item is assigned to one lane based on current delivery status.

| Value | Meaning |
|---|---|
| `Now` | In active delivery this week |
| `This Week` | Planned for this week, not yet started |
| `Next` | Planned for next week |
| `Awaiting Approval` | Drafted; waiting on client approval |
| `Blocked` | Cannot proceed — blocker documented in `blocked_by` |
| `Completed` | Done |

---

### 3.3 delivery_week

Corresponds to the four weeks of the first 30-day roadmap (Section 9 of roadmap):

| Value | Roadmap Week |
|---|---|
| `Week 1: Stabilise & Confirm` | Confirm start date, access, workflows, urgent updates |
| `Week 2: Organise & Publish` | First batch of posts, testimonial workflow, graphics |
| `Week 3: Build Credibility` | Testimonial collection, programme updates, engagement review |
| `Week 4: Review & Recommend` | Activity summary, bottlenecks, continuation recommendation |
| `Cross-Period / Recurring` | Items that span the entire 30-day period |

---

### 3.4 workflow_type and workflow_stage

**workflow_type = Content:**

| Stage | Description |
|---|---|
| `Client shares information` | Client provides update/photo/story |
| `Embark drafts copy/design` | Content is being drafted |
| `Awaiting client review` | Sent for client review |
| `Approved — ready to schedule` | Client approved, scheduling in progress |
| `Scheduled / Posted` | Content is live |
| `Tracked` | Added to consistency record |

**workflow_type = Testimonial:**

| Stage | Description |
|---|---|
| `Graduate submits testimonial` | Raw testimonial received |
| `Consent confirmed` | Permission to publish name/photo/story verified in writing |
| `Client review / approval` | Client reviews testimonial content |
| `Embark designs graphic` | Testimonial graphic in production |
| `Final approval` | Client approves the designed graphic |
| `Posted to platforms` | Live on relevant channels |
| `Graduate repost opportunity` | Graduate notified they can share |

---

### 3.5 scope_treatment

| Value | Meaning |
|---|---|
| `Current Delivery` | Active, committed delivery within Package 3 |
| `Current Delivery if Minor` | Included if the work is minor; major version requires separate approval |
| `Requires Client Approval` | Needs explicit client decision before proceeding |
| `Separate Cost Likely` | Likely requires separate quote — third-party costs or significant production |
| `Third-Party Cost` | Always a third-party cost (ad spend, registrar fees, etc.) |
| `Separate Scope` | Not current delivery — requires separate scoping and costing |
| `Future Context Only` | Not relevant to current delivery — exists as future reference only |

---

### 3.6 content_pillar

**Chasm Bridge Charity pillars:**

| Value |
|---|
| `Graduate Opportunity` |
| `Training Updates` |
| `Testimonials` |
| `Youth Development` |
| `Stakeholder Awareness` |
| `CV & Applications` |
| `Social Impact` |
| `Programme Milestones` |

**Filament (Pty) Ltd pillars:**

| Value |
|---|
| `Productivity Transformation` |
| `Operational Excellence` |
| `Mining Sector` |
| `People & Culture` |
| `Graduate Exposure` |
| `Leadership & Credibility` |
| `Process Improvement` |
| `Field Learning` |

---

### 3.7 approval_status

| Value | Meaning |
|---|---|
| `Not Required` | Default — no approval gate for this item |
| `Drafting` | Content/deliverable in preparation |
| `Ready for Review` | Sent to client for review |
| `Awaiting Approval` | Waiting for client decision |
| `Changes Requested` | Client has returned with revisions |
| `Approved` | Client has given sign-off |
| `Superseded` | Item was replaced or cancelled |

---

### 3.8 cadence_status

For `record_type = 'Recurring Activity'` items:

| Value | Meaning |
|---|---|
| `Not Yet Assessed` | Review period just started |
| `On Track` | Meeting the agreed cadence |
| `At Risk` | Showing signs of inconsistency |
| `Behind` | Cadence has lapsed or deliverables are late |
| `Awaiting Inputs` | On hold pending client content/approval |

---

## 4. tracker_item_notes Fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `tracker_item_id` | text (FK) | References tracker_items.id |
| `note_type` | text | See note_type taxonomy below |
| `note_text` | text | Free-text description of the change |
| `old_status` | text | Previous status (for status_change notes) |
| `new_status` | text | New status (for status_change notes) |
| `changed_by_label` | text | Display name of the author who made the change |
| `author_id` | uuid (FK) | References update_authors.id |
| `created_at` | timestamptz | Auto-set by Supabase |

### 4.1 note_type taxonomy

| Value | Trigger |
|---|---|
| `manual` | User typed a note update |
| `status_change` | Status field changed |
| `due_date_update` | Due date changed |
| `next_action_update` | Next action field updated |
| `priority_update` | Priority changed |
| `approval_requested` | approval_status changed to Awaiting Approval |
| `approval_status_change` | approval_status changed (not initial request) |
| `decision_recorded` | A Decision record has been resolved |
| `blocker_added` | blocked_by populated and status set to Blocked |
| `blocker_updated` | blocked_by text updated while still blocked |
| `blocker_resolved` | Blocker removed and status moved out of Blocked |
| `workflow_stage_change` | workflow_stage field changed |
| `delivery_lane_change` | delivery_lane field changed |
| `cadence_status_change` | cadence_status field changed |
| `scope_treatment_change` | scope_treatment field changed |
| `record_type_change` | record_type field changed |

---

## 5. ID Naming Conventions

IDs must be stable, slug-format strings. Do not use sequential integers. Do not reuse IDs.

| Prefix | Used For |
|---|---|
| `task-` | Phase 1 tasks (legacy) |
| `social-` | Phase 1 social setup tasks (legacy) |
| `later-` | Phase 1 deferred/retainer items (legacy) |
| `del-` | Phase 1 deliverables |
| `asset-` | Client assets |
| `launch-` | Launch checklist items |
| `p2-` | Phase 2 operating foundation items |
| `p3-` | Phase 3 active growth & management items |
| `risk-` | Risk records |
| `decision-` | Decision records |
| `milestone-` | Milestone records |
| `context-` | Context records |
| `scope-` | Separate scope / future systems records |

---

## 6. programme_settings Table

| Key | Type | Values / Notes |
|---|---|---|
| `programme_delivery_target` | text | `2026-07-31` — the 31 July 2026 programme target date |
| `programme_phase2_phase3_window_start` | text | Start date of the Phase 2 + Phase 3 delivery window |
| `package3_review_start_date` | text | Confirmed start date of the Package 3 one-month review |
| `package3_review_end_date` | text | Confirmed end date of the Package 3 one-month review |
| `programme_review_outcome` | text | `Pending Review` · `Continue Package 3` · `Adjust Package 3 Scope` · `Move to Lighter Support` |
| `primary_approver_cbc` | text | Name of the confirmed Chasm Bridge Charity approval contact |
| `primary_approver_filament` | text | Name of the confirmed Filament approval contact |

**Security:** The table includes an `is_public` boolean.
- Public/Viewer access is granted via RLS ONLY to rows where `is_public = true`.
- Safe public settings: `programme_delivery_target`, `package3_review_status`, `programme_delivery_mode`.
- Admin-only settings (is_public = false): `package3_review_start_date`, `package3_review_end_date`, `programme_review_outcome`, `primary_approver_cbc`, `primary_approver_filament`.

---

## 7. Security and Confidentiality Constraints

- **No email addresses** in task/note text fields (blocked by validation)
- **No API keys, JWTs, passwords, or credentials** in any tracker text (blocked by validation)
- **No banned third-party company names** (BHP, Harmony, RB Plats, Tranter, Ingwe)
- **No graduate personally identifiable information** in tracker_items — graduates live in the admin-only `graduates` table only
- **No guaranteed placement language** — graduate records must not promise employment outcomes
- **Admin-only RLS** on: cohorts, graduates, graduate_documents, graduate_activity_notes, programme_settings
- **Public-readable** tracker_items and tracker_item_notes (is_public = true items only)

---

## 8. Validation Checks (validate-delivery-data.mjs)

The data validation script must pass before every build:

| Check | Description |
|---|---|
| ID uniqueness | All task IDs are unique across the full dataset |
| Required fields | `id`, `task`, `category`, `phase`, `responsible`, `status`, `priority` present |
| Phase enum | Phase values in allowed list |
| Status enum | Status values in allowed list |
| Category enum | Category values in allowed list |
| Priority enum | Priority values in allowed list |
| Responsible enum | Owner values in allowed list |
| record_type enum | If present, record_type in allowed list |
| scope_treatment enum | If present, scope_treatment in allowed list |
| cadence_status enum | If present, cadence_status in allowed list |
| delivery_lane enum | If present, delivery_lane in allowed list |
| delivery_week enum | If present, delivery_week in allowed list |
| approval_status enum | If present, approval_status in allowed list |
| Confidentiality — email | No email address format in any text field |
| Confidentiality — secrets | No credential keywords in any text field |
| Confidentiality — JWT | No JWT tokens in source files |
| Confidentiality — service_role | No service_role keyword in source files |
| Confidentiality — names | No banned third-party names in any text field |

---

## 9. What Must Not Happen

> These are guardrails. Violating any of them compromises commercial integrity, data safety, or delivery clarity.

1. Do not add Phase 2/3 items without appropriate `phase` values in `phases` constant.
2. Do not store graduate names, CVs, personal details, or contact information in `tracker_items`.
3. Do not store credentials, API keys, or passwords anywhere in source files.
4. Do not use `phase = 'Retainer'` or `phase = 'Out of Scope'` for new records.
5. Do not confuse Package 3 (commercial arrangement) with Phase 3 (delivery phase).
6. Do not treat Separate Scope items as active deliverables.
7. Do not automatically turn future systems (CRM, ATS, GMS, WhatsApp API) into Phase 3 tasks.
8. Do not redesign the UI, change themes, or introduce new component libraries.
9. Do not truncate the `tracker_items` table on a live installation.
10. Do not update the `programme_review_outcome` to anything other than `Pending Review` until the client has explicitly made a decision.

---

## 10. Phase 2 Progress Calculation

Phase 2 Progress must be calculated from **finite actionable records only** to prevent distortion by ongoing noise.

**Formula:**
`Done Phase 2 finite actionable records` ÷ `Total active Phase 2 finite actionable records`

**Finite actionable record_type:**
- Deliverable
- Task
- Approval Gate
- Milestone

**Excluded record_type:**
- Risk
- Decision
- Context
- Recurring Activity

**Excluded status:**
- Deferred
- Separate Scope

---

## 11. Phase 3 Delivery Health Logic

Phase 3 Delivery Health must use controlled output values evaluated in strict precedence order (highest to lowest). Do not invent health states or blend rules.

| Output | Precedence | Rules |
|---|---|---|
| `Behind` | 1 (highest) | Any high-priority Phase 3 item is overdue by >3 days, **OR** ≥40% of assessed active recurring Phase 3 activities have cadence_status = `Behind` |
| `At Risk` | 2 | At least one active Phase 3 item has cadence_status = `At Risk`, **OR** any active Phase 3 item is overdue (any priority), **OR** ≥25% of active Phase 3 records are `Blocked` |
| `Awaiting Inputs` | 3 | Majority of constrained Phase 3 items are `Waiting on Client` / `Awaiting Approval` / cadence_status = `Awaiting Inputs` — and no Behind or At Risk rule triggered |
| `On Track` | 4 | Active Phase 3 records exist; no Behind rule; no material At Risk rule; majority of assessed recurring activities have cadence_status = `On Track` |
| `Not Yet Assessed` | 5 (default) | No active Phase 3 recurring activities have any cadence_status value set |
