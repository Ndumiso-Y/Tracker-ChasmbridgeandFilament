# Project Context Manifest
## Chasm Bridge Charity & Filament — Command Center

**Version:** 2.0 (Phase 2 + Phase 3 Delivery Period)
**Date:** 2026-07-05
**Programme Target:** 31 July 2026
**Prepared by:** Embark Digitals (Ndumiso Yedwa)
**Authority:** This document supersedes all legacy tracker labels, old seed data, and historical assumptions where they conflict with this manifest, the roadmap PDF, or the latest project-owner instruction.

---

## 1. What the Tracker Is

The **Chasm Bridge Charity & Filament Command Center** is a live, Supabase-backed project management and accountability system for Embark Digitals' digital engagement with two client organisations:

- **Chasm Bridge Charity** — a South African youth-development charity focused on graduate training and employment in the mining sector.
- **Filament (Pty) Ltd)** — a mining-sector operational-excellence company that hosts and employs graduates developed through Chasm Bridge Charity.

The tracker is not a generic task management product. It is a purpose-built command center that:
- Encodes the commercial delivery agreement in structured data
- Makes phase boundaries, scope exclusions, and client dependencies explicit
- Provides a live audit trail of all changes
- Supports multi-stakeholder visibility with admin-only secure editing

---

## 2. Why the Tracker Was Originally Created

Phase 1 established the digital foundation for both organisations. The tracker was built to:

1. Prevent scope creep — making Phase 1 boundaries explicit
2. Surface client dependencies before they silently blocked delivery
3. Provide a professional, stakeholder-facing accountability view
4. Keep future-phase and separate-scope work visible without treating it as included
5. Replace ad-hoc spreadsheet tracking with an audited, persistent command center

---

## 3. Current Project State (as of 2026-07-05)

**Phase 1 is complete.** Per the strategic roadmap (Section 2), the following are done:
- Both websites live (static landing pages)
- Domains in place and managed
- Public emails configured and handed over
- Social media pages live (Facebook, Instagram, LinkedIn — both brands)
- Social media graphics (initial launch complete)
- Testimonial workflow being finalised
- Digital cards / email signatures in final review

**Package 3 has begun.** The one-month review period is in progress. The tracker must now support active delivery of Phase 2 and Phase 3 work in parallel through **31 July 2026**.

---

## 4. Phase Definitions — Authoritative

> These definitions supersede ALL legacy tracker labels including "Phase 2: Public Growth", "Phase 3: Systems & Automation", "Retainer: Keep It Running", and similar historical placeholders.

### Phase 1: Digital Foundation
The setup phase. Websites, emails, branding, social account creation, and handover. **Phase 1 is complete.** Its records are preserved historically in the tracker. Phase 1 history must not be erased.

### Phase 2: Operating Foundations
The operational-strengthening layer. Approval workflows, consent processes, access structures, analytics setup, content calendar processes, recruitment communication boundaries, graduate data governance. Phase 2 runs **in parallel** with Phase 3 during the current delivery period. Phase 2 has a finite set of completion items — a percentage-complete metric is appropriate.

### Phase 3: Active Growth & Management
Active, ongoing delivery. Social media management, content creation, website care and maintenance, communication support, testimonial collection, growth visibility, and strategic coordination. Phase 3 work is largely recurring in nature. A delivery-health metric is more appropriate than a percentage.

### Separate Scope / Future Systems
Items that require separate costing, technical development beyond current scope, third-party platforms, or future-phase planning. Includes CRM, applicant tracking, Graduate Management System, WhatsApp Business API, email automation, advanced analytics dashboards, backend development, paid advertising, professional video/photography, and AI-supported systems. These items must not be treated as current committed delivery.

> [!IMPORTANT]
> **Package 3 is NOT a phase and must not appear in the `phases` array.** Package 3 (R24,000/month one-month review arrangement) is a commercial arrangement. It is represented in the tracker through the `delivery_context` field (value: `Package 3 Review`) and the `programme_settings` table. Phase 3 (Active Growth & Management) is the delivery phase. These are distinct concepts.

### delivery_context field
A separate field on `tracker_items` that carries commercial/programme context alongside the phase:
- `Package 3 Review` — Phase 2 and Phase 3 items within the current review period
- `Historical Foundation` — Phase 1 items (applied on all Phase 1 records)
- `Future / Separate Scope` — Separate Scope items
- `Phase Delivery` — ongoing Phase 2/3 work beyond the current review period

---

## 5. Programme Statement

> **Phase 1 established the digital foundation. Phase 2 operating foundations and Phase 3 active delivery are now being managed in parallel through 31 July 2026.**

The delivery target is **31 July 2026**. Both Phase 2 and Phase 3 work must be tracked, reported, and reviewed against this target.

---

## 6. Technical Architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Vite + React 19 | SPA with HashRouter |
| Styling | Tailwind CSS + custom `styles.css` | Design frozen — no redesign |
| Database | Supabase (Postgres) | Primary data store |
| Auth | Supabase Auth | Admin role only |
| RLS | Supabase Row Level Security | All tables RLS-enabled |
| Realtime | Supabase Postgres Changes | tracker_items + tracker_item_notes |
| Static fallback | `src/data/trackerData.js` | Used when Supabase is unavailable |
| Hosting | GitHub Pages (HashRouter + base path) | Vercel also supported |

### Supabase Tables

| Table | Purpose | Public Access |
|---|---|---|
| `tracker_items` | Master project register | Public read (is_public=true) |
| `tracker_item_notes` | Audit trail / history | Public read (linked to public items) |
| `update_authors` | Approved editor list | Public read |
| `user_roles` | Admin role grants | Admin only |
| `cohorts` | Graduate cohort records | Admin only |
| `graduates` | Individual graduate records | Admin only |
| `graduate_documents` | Document checklist | Admin only |
| `graduate_activity_notes` | Graduate audit trail | Admin only |
| `programme_settings` | Programme-level context | Admin read where is_public=true; Admin full CRUD |

---

## 7. Task Command Center — Master Register

The **Task Command Center** is the master project register. All tracked work items live here, drawn from `tracker_items` in Supabase. No second task database should be created. Any new execution views (e.g., Delivery Board) must read from the same `tracker_items` source.

### tracker_items Record Contract

| Field | Role |
|---|---|
| `id` | Stable slug-format primary key |
| `title` | Task/deliverable title |
| `entity` | Chasm Bridge Charity / Filament / Both |
| `phase` | **Phase 1 / Phase 2 / Phase 3 / Separate Scope only** — never "Package 3" |
| `delivery_context` | Package 3 Review / Historical Foundation / Future / Separate Scope / Phase Delivery (new) |
| `category` | Workflow category for filtering |
| `status` | Operational status |
| `priority` | High / Medium / Low |
| `owner_label` | Responsible party |
| `due_date` | Target date |
| `description` | Client input needed / context |
| `next_action` | Immediate next step |
| `notes` | Current notes snapshot |
| `is_public` | Whether visible to viewer/public |
| `record_type` | Type classification (new) |
| `workstream` | Programme workstream (new) |
| `delivery_lane` | Delivery Board lane (new) |
| `delivery_week` | 30-day roadmap week (new) |
| `workflow_type` | General / Content / Testimonial (new) |
| `workflow_stage` | Contextual stage within workflow_type (new) |
| `blocked_by` | Blocker description if status = Blocked (new) |
| `blocked_since` | Date blocked (new) |
| `scope_treatment` | Scope classification (new) |
| `content_pillar` | Content taxonomy for social/content items (new) |
| `requires_approval` | Whether client approval is required (new) |
| `approval_status` | Approval workflow status (new) |
| `cadence_status` | Health for recurring activities (new) |

---

## 8. Notes & History — Audit Backbone

`tracker_item_notes` is the audit trail for all changes. Every meaningful update to a tracker item must create a note record. The note records:
- Who made the change (Active Editor — selected from approved authors)
- What changed (note_type)
- Old and new values for status changes
- Timestamp

**No update is permitted without an Active Editor being selected.** If no editor is selected, the system displays: *"Please select who is making this update before saving."*

### Approved Authors

| Display Name | Role | Organisation |
|---|---|---|
| Ndumiso / Embark Digitals | Delivery Owner | Embark Digitals |
| Dr. Rudy | Client Stakeholder | Chasm Bridge Charity |
| Monique | Client Stakeholder | Filament (Pty) Ltd |
| Jazmin | Client Stakeholder / Role TBC | Chasm Bridge Charity |

---

## 9. Design Freeze

The visual styling, colours (navy/gold palette), layout, spacing, typography, and overall design system are **frozen**. All additions must reuse existing styles, classes, and patterns. No new design systems, no Tailwind overrides, no replacement component libraries.

---

## 10. Graduate Data Restrictions

The Graduates & Cohort section is **admin-only**. Graduate records are:
- Protected by RLS (no public access)
- Hidden from the nav for non-admin users
- Not duplicated in tracker_items
- Not subject to AI scoring, ranking, or automated decisions
- Not to contain guaranteed placement language

CSV import and file upload are deferred. Graduate records are managed individually via the Add Graduate UI.

---

## 11. Future Systems — Scope Treatment Principles

The following systems are NOT part of current delivery unless separately approved and scoped:
- CRM / Applicant Tracking System
- Graduate Management System
- WhatsApp Business API integration
- Email automation platforms
- Advanced analytics dashboards
- Backend development / dynamic web forms
- Professional video / photography
- Paid advertising (any platform)
- Deep SEO campaigns

Their appearance in the roadmap is strategic context, not committed delivery. They must be classified with `scope_treatment = 'Separate Cost Likely'` or `'Future Context Only'` in the tracker.

---

## 12. Authority Order

When sources conflict:

1. **Latest explicit instruction from Ndumiso Yedwa / Embark Digitals** (highest authority)
2. **Chasm_Bridge_Filament_Strategic_Roadmap_Package3.pdf**
3. **Current working tracker architecture + this manifest**
4. **Legacy tracker labels, old seed data, historical assumptions** (lowest authority)

---

## 13. Package 3 Review Context

Package 3 is a one-month review period (R24,000/month) that has commenced. At the end of the review month, the client will decide from three options:
1. Continue Package 3 at R24,000/month
2. Adjust Package 3 scope
3. Move to a lighter support arrangement

The tracker must preserve evidence for the review report (Section 17 of roadmap) without building an unnecessary separate reporting engine.

---

## 14. Historical Phase 1 Context — Preservation Principle

> **Historical context must be preserved, but it must not remain the primary operational focus.**

Phase 1 is the completed digital foundation. It is historical evidence, not current delivery. The following rules govern its treatment in the tracker.

### What Must Be Preserved

- All Phase 1 `tracker_items` records
- All `tracker_item_notes` linked to Phase 1 items (full audit trail)
- All original completion statuses, due dates, client input notes, and change history
- The Phase 1 Scope view
- The Launch Readiness view (as a historical record, not a current metric)

### What Must Never Happen to Phase 1 Records

- Do not delete Phase 1 tracker items
- Do not truncate the `tracker_items` table on a live installation
- Do not overwrite existing `tracker_item_notes` entries
- Do not reset Phase 1 item statuses to defaults
- Do not alter the text content of Phase 1 notes to match new terminology
- Do not apply new taxonomy fields (record_type, delivery_lane, cadence_status) to Phase 1 items unless a Phase 1 item genuinely needs to be reopened for current action

### What May Be Corrected

- The `phase` field display label context: Phase 1 items remain `phase = 'Phase 1'` in the database. The UI may display this as "Phase 1: Digital Foundation" in headers and badges.
- New columns added to `tracker_items` by the migration SQL will have `NULL` values for Phase 1 records — this is correct. Phase 1 items do not need to be backfilled with new field values unless actively reopened.

### Operational View Hierarchy

The tracker's views are ordered to reflect current priority:

| Priority | View/Panel | Content |
|---|---|---|
| 1 (Primary) | Programme Delivery Window (Dashboard) | Phase 2 + Phase 3 current metrics |
| 2 | Current Focus / Blockers / Approvals | Phase 2 + Phase 3 active items |
| 3 (Review) | Package 3 Review Context banner | Review period status |
| 4 (Historical) | Phase 1 Digital Foundation — Established | Compact summary, link to Phase 1 history |
| 5 (Historical) | Launch Readiness — Historical Record | De-emphasised foundation record |

### Access to Phase 1 History

Phase 1 is never permanently hidden. It is accessible via:
- Task Command Center → "Phase 1 History" filter preset
- Task Command Center → "All Records" filter
- Phase 1 Scope view (unchanged)
- Launch Readiness view (preserved, de-emphasised)
- Notes & History modal on any Phase 1 item (unchanged)

The goal is to reduce operational noise on current-delivery views while preserving full traceability.

---

*This manifest was created as part of the Phase 2 + Phase 3 maturation implementation. It must be updated if the programme direction changes.*
