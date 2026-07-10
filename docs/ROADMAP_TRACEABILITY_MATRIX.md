# Roadmap Traceability Matrix
## Chasm Bridge & Filament — Package 3 Strategic Roadmap

**Source:** Chasm_Bridge_Filament_Strategic_Roadmap_Package3.pdf (19 pages, dated 27.06.2026)
**Created:** 2026-07-05
**Status:** Implementation in progress

---

## Column Definitions

| Column | Meaning |
|---|---|
| Roadmap Section | Section number and title from PDF |
| Roadmap Requirement / Context | What the roadmap says |
| Tracker Relevance | Does this affect the tracker? |
| Current Tracker Support | What already exists |
| Gap | What is missing |
| Proposed Treatment | What to do |
| Scope Treatment | Commercial classification |
| Implementation Location | Where in the code/data |
| Verification Status | Implementation state |

**Proposed Treatment values:** Already Supported · Implement Now · Extend Existing Feature · Seed as Context · Defer · Requires Ndumiso Decision · Not Relevant to Tracker

**Scope Treatment values:** Current Delivery · Current Delivery if Minor · Requires Client Approval · Separate Cost Likely · Separate Scope · Third-Party Cost · Future Context Only

---

## Section 1 — Executive Summary

| Field | Value |
|---|---|
| Roadmap Requirement | Phase 1 complete. Package 3 begins as one-month review. Project shifts from setup to visibility, content, communication, maintenance, and growth. Phase 2 operating foundations complete in parallel. |
| Tracker Relevance | High — determines the entire programme framing |
| Current Tracker Support | Dashboard still describes Phase 1 control room only. Phase taxonomy uses legacy labels. |
| Gap | Dashboard heading and sidebar description still say "Phase 1 Setup Control Room". Phases still say "Retainer" and "Out of Scope". |
| Proposed Treatment | Implement Now |
| Scope Treatment | Current Delivery |
| Implementation Location | `src/views/Dashboard.jsx`, `src/data/trackerData.js`, `src/App.jsx` sidebar text |
| Verification Status | Implemented |

---

## Section 2 — Where We Are Now

| Field | Value |
|---|---|
| Roadmap Requirement | Both websites complete. Domains complete. Emails complete. Social pages complete. Graphics in progress. Youth Day TBC. CV content TBC. Testimonial workflow in progress. Digital cards requires review. Recruitment in progress. Future systems out of current scope. |
| Tracker Relevance | High — directly maps to current Phase 1 completion status and active Phase 2/3 work |
| Current Tracker Support | Phase 1 tasks exist in tracker but many show old statuses (Not Started, Blocked). Does not reflect completion reality. |
| Gap | Phase 1 items in seed data do not reflect completed state. Phase 3 items (social graphics, testimonials, digital cards) exist only as vague legacy "retainer" items. |
| Proposed Treatment | Implement Now — seed new Phase 2/3 items. Phase 1 DB statuses are live-managed; do not overwrite in migration SQL. |
| Scope Treatment | Current Delivery |
| Implementation Location | `supabase/phase2_phase3_delivery_schema.sql` (new items insert), `tracker_items` |
| Verification Status | Partially Verified |

---

## Section 3 — What Phase 1 Delivered

| Field | Value |
|---|---|
| Roadmap Requirement | Phase 1 delivered: website setup, static pages, domain direction, SEO basics, social pages, social profile assets, launch graphics, public emails, recruitment email awareness, testimonial workflow idea, social posting flow, graduate communication support, strategic positioning. Websites are static — not CRM, not ATS, not GMS, not WhatsApp automation. |
| Tracker Relevance | Medium — confirms Phase 1 scope boundaries; prevents scope creep |
| Current Tracker Support | Phase 1 Scope view exists. PhaseScope component shows deliverables. |
| Gap | The "not included" list (CRM, ATS, GMS, WhatsApp automation) should inform Separate Scope seed items with scope_treatment field. |
| Proposed Treatment | Seed as Context — separate scope items seeded with scope_treatment = 'Separate Cost Likely' or 'Future Context Only' |
| Scope Treatment | Future Context Only |
| Implementation Location | `tracker_items` (Separate Scope phase items), `scope_treatment` column |
| Verification Status | Implemented |

---

## Section 4 — Why Package 3 Starts with a One-Month Review

| Field | Value |
|---|---|
| Roadmap Requirement | Package 3 = R24,000/month, structured one-month review period, now commenced. Review tests working rhythm, confirms value, reviews priorities. Not a delay — a responsible evaluation. |
| Tracker Relevance | High — Package 3 review context must be visible |
| Current Tracker Support | None |
| Gap | No Package 3 review record or programme context item exists |
| Proposed Treatment | Seed as Context — programme_settings entry for review; context record in tracker_items |
| Scope Treatment | Current Delivery |
| Implementation Location | `programme_settings` table, `tracker_items` (Package 3 context record) |
| Verification Status | Implemented |

---

## Section 5 — Why Phase 2 Still Matters While Phase 3 Begins

| Field | Value |
|---|---|
| Roadmap Requirement | Phase 2 operational foundations (approvals, workflows, access, consent) must be completed in parallel with Phase 3 active delivery. This is normal for a project moving from launch to active management. No need to pause Phase 3 until Phase 2 is complete. |
| Tracker Relevance | High — defines the parallel delivery model |
| Current Tracker Support | None explicitly |
| Gap | No Phase 2 operational items exist in tracker. No parallel delivery framing on dashboard. |
| Proposed Treatment | Implement Now — seed Phase 2 items, add delivery window to dashboard |
| Scope Treatment | Current Delivery |
| Implementation Location | `tracker_items` Phase 2 items, `src/views/Dashboard.jsx` delivery window |
| Verification Status | Implemented |

---

## Section 6 — Package 3 R24,000 One-Month Review Scope

### 6.1 Website Care and Maintenance

| Field | Value |
|---|---|
| Roadmap Requirement | Monitor websites, minor content updates, image replacements, broken link checks, web forms/WhatsApp/social link review (increasing dynamic character), mobile checks, contact info updates, light SEO hygiene. Major redesigns, backend systems, portals require separate costing. |
| Current Tracker Support | Old "task-later-web-bugfixes", "task-later-web-updates" (Retainer phase) |
| Gap | No active Phase 3 website care items |
| Proposed Treatment | Implement Now — seed Phase 3 website care records |
| Scope Treatment | Current Delivery (minor updates); Separate Cost Likely (backend, dynamic forms) |
| Implementation Location | `tracker_items` p3- prefixed items, `category = 'Website Care'` |
| Verification Status | Implemented |

### 6.2 Social Media Management

| Field | Value |
|---|---|
| Roadmap Requirement | Content planning, design, caption writing, posting support, page consistency, platform updates, campaign support, visibility-building. Recommended 3–4 posts/week across both brands, subject to approvals. |
| Current Tracker Support | Old "task-later-social-posting", "task-later-social-graphics" (Retainer phase) |
| Gap | No active Phase 3 social media management records |
| Proposed Treatment | Implement Now — seed Phase 3 social media recurring activity records |
| Scope Treatment | Current Delivery |
| Implementation Location | `tracker_items` p3- prefixed items, `category = 'Social Media'`, `cadence_status` |
| Verification Status | Implemented |

### 6.3 Graphic Design and Content Creation

| Field | Value |
|---|---|
| Roadmap Requirement | Social media posters, updates/announcements, testimonial graphics, programme graphics, awareness graphics, milestone posts, branded templates. Large campaign packs, brochures, pitch decks, video, complex animation = additional cost. |
| Current Tracker Support | None active |
| Gap | No active Phase 3 content creation records |
| Proposed Treatment | Implement Now — seed Phase 3 content creation records |
| Scope Treatment | Current Delivery (standard graphics); Separate Cost Likely (video, brochures, pitch decks) |
| Implementation Location | `tracker_items` p3- prefixed items, `category = 'Content & Design'` |
| Verification Status | Implemented |

### 6.4 Communication and Coordination Support

| Field | Value |
|---|---|
| Roadmap Requirement | Content workflow support, testimonial workflow, posting calendar, content approval structure, message/caption drafting, coordination. NOT: direct daily admin, candidate screening, HR, applicant vetting, interview scheduling. |
| Current Tracker Support | None active |
| Gap | No communication/coordination records |
| Proposed Treatment | Implement Now — seed Phase 3 coordination records |
| Scope Treatment | Current Delivery |
| Implementation Location | `tracker_items` p3- prefixed items |
| Verification Status | Implemented |

### 6.5 Growth and Visibility Support

| Field | Value |
|---|---|
| Roadmap Requirement | Improve public presentation, social presence, milestone posts, page follows, testimonials, awareness campaigns. Paid ads, boosted posts, media buying, influencer campaigns, PR = additional costs. |
| Current Tracker Support | None active |
| Gap | No growth/visibility items |
| Proposed Treatment | Implement Now — seed growth records; separate scope for paid activities |
| Scope Treatment | Current Delivery (organic); Third-Party Cost (paid ads) |
| Implementation Location | `tracker_items` p3- prefixed items; Separate Scope items for paid |
| Verification Status | Implemented |

### 6.6 Strategic Support

| Field | Value |
|---|---|
| Roadmap Requirement | Monthly strategy input, content direction, campaign recommendations, roadmap updates, priority planning, next steps guidance. Major system design, advanced automation, CRM architecture, investor documents = separate costing. |
| Current Tracker Support | None active |
| Gap | No strategic coordination records |
| Proposed Treatment | Seed as Context |
| Scope Treatment | Current Delivery (monthly strategy); Separate Cost Likely (advanced systems) |
| Implementation Location | `tracker_items` context/decision records |
| Verification Status | Implemented |

---

## Section 7 — How the One-Month Review Will Be Evaluated

| Field | Value |
|---|---|
| Roadmap Requirement | 12 evaluation areas: content output, design quality, posting consistency, approval speed, platform readiness, website maintenance needs, social engagement, testimonial collection, communication workflow, additional system needs, client satisfaction, value of Package 3. |
| Tracker Relevance | High — review evidence must be trackable |
| Current Tracker Support | None |
| Gap | No review evidence records |
| Proposed Treatment | Implement Now — seed as recurring review/milestone records; dashboard evidence metrics |
| Scope Treatment | Current Delivery |
| Implementation Location | `tracker_items` p3-track- and p3-review- items, `record_type = 'Recurring Activity'` |
| Verification Status | Implemented |

---

## Section 8 — Phase 2 Foundations to Complete in Parallel

| Roadmap Item | Status in Roadmap | Extra Cost? | Proposed Treatment | Verification |
|---|---|---|---|---|
| Final approval workflow | In Progress | No | Implement Now (seed) | Implemented |
| Social media admin access | To Be Confirmed | No | Implement Now (seed) | Implemented |
| Content approval turnaround (48hr) | To Be Confirmed | No | Implement Now (seed) | Implemented |
| Testimonial consent + photo permission | In Progress | No | Implement Now (seed) | Implemented |
| Graduate testimonial template | In Progress | No | Implement Now (seed) | Implemented |
| Content calendar approval | To Be Confirmed | No | Implement Now (seed) | Implemented |
| Website update request process | To Be Confirmed | No | Implement Now (seed) | Implemented |
| Recruitment communication boundaries | To Be Confirmed | No | Implement Now (seed) | Implemented |
| Database/spreadsheet for CVs/testimonials | To Be Confirmed | Possibly | Seed as Context (requires decision) | Implemented |
| QR code / digital card finalisation | Requires Final Review | Possibly | Implement Now (seed active item) | Implemented |
| Email signature finalisation | Requires Final Review | No | Implement Now (seed active item) | Implemented |
| Analytics setup | To Be Confirmed | Possibly | Implement Now (seed, flag cost risk) | Implemented |
| Google Business Profile | To Be Confirmed | Possibly | Seed as Context (decision required) | Implemented |
| Future application form planning | Future Phase | Yes | Seed as Context (Separate Scope) | Implemented |
| Future CRM/applicant tracking planning | Future Phase | Yes | Seed as Context (Separate Scope) | Implemented |

---

## Section 9 — Proposed First 30-Day Roadmap

| Roadmap Requirement | Tracker Relevance | Proposed Treatment | Verification |
|---|---|---|---|
| Week 1: Stabilise and Confirm — confirm start date, access, approval workflow, priority announcements, urgent updates, social details | High — active delivery items | Implement Now — seed Week 1 items; delivery_week = 'Week 1: Stabilise & Confirm' | Implemented |
| Week 2: Organise and Publish — first posts batch, CBC updates, Filament updates, testimonial workflow, follow/awareness graphics, email signatures/digital cards | High | Implement Now — seed Week 2 items | Implemented |
| Week 3: Build Credibility — testimonial collection, testimonial template, training/programme updates, Filament operational content, engagement review, website updates | High | Implement Now — seed Week 3 items | Implemented |
| Week 4: Review and Recommend — one-month summary, delivery review, bottleneck identification, extra cost identification, continuation recommendation, Month 2 plan | High — review milestone | Implement Now — seed Week 4 milestone items | Implemented |

---

## Section 10 — Proposed 3-Month Roadmap If Package 3 Continues

| Roadmap Requirement | Tracker Relevance | Proposed Treatment | Verification |
|---|---|---|---|
| Month 2: Credibility and Engagement — testimonials, training updates, Filament thought leadership, CBC graduate content, website improvements, basic reporting | Medium — future scope | Seed as Context — not active delivery until Package 3 continues | Implemented |
| Month 3: Growth and System Readiness — structured themes, performance review, stakeholder campaigns, application forms scoping, database/CRM scoping, paid campaign readiness | Medium — future scope | Seed as Context — separate scope items for systems; future delivery for content | Implemented |

---

## Section 11 — Proposed 6-Month Strategic View

| Roadmap Requirement | Tracker Relevance | Proposed Treatment | Verification |
|---|---|---|---|
| Months 1–2: Stabilise and publish consistently | High — current period | Current delivery — covered by Phase 3 items | Implemented |
| Months 3–4: Build credibility through testimonials, programme updates, stakeholder content | Medium — near future | Seed as Context — milestone direction | Implemented |
| Months 5–6: Stronger systems — application flows, database, CRM, reporting, paid growth | Low — future only | Seed as Context — Separate Scope items | Implemented |

---

## Section 12 — Content Pillars

### Chasm Bridge Charity Content Pillars

| Pillar | Tracker Treatment | content_pillar value |
|---|---|---|
| Graduate opportunity and support | taxonomy for content items | Graduate Opportunity |
| Training updates | taxonomy | Training Updates |
| Testimonials and success stories | taxonomy | Testimonials |
| Youth development and inspiration | taxonomy | Youth Development |
| Stakeholder awareness | taxonomy | Stakeholder Awareness |
| CV/application updates | taxonomy | CV & Applications |
| Social impact storytelling | taxonomy | Social Impact |
| Programme milestones | taxonomy | Programme Milestones |

### Filament Content Pillars

| Pillar | Tracker Treatment | content_pillar value |
|---|---|---|
| Productivity transformation | taxonomy | Productivity Transformation |
| Operational excellence | taxonomy | Operational Excellence |
| Mining-sector improvement | taxonomy | Mining Sector |
| People-centred transformation | taxonomy | People & Culture |
| Graduate exposure through operations | taxonomy | Graduate Exposure |
| Leadership and technical credibility | taxonomy | Leadership & Credibility |
| Process improvement thinking | taxonomy | Process Improvement |
| Field observation and practical learning | taxonomy | Field Learning |

**Note:** Content pillars are taxonomy/context only. They are not deliverables. They are applied via `content_pillar` field on relevant content/social tracker items.

---

## Section 13 — Approval and Workflow Recommendation

| Roadmap Requirement | Tracker Relevance | Proposed Treatment | Verification |
|---|---|---|---|
| General content workflow: 6-step (client shares info → draft → review → approve → post → track) | High — approval tracking is a key review metric | Extend Existing Feature — workflow_type='Content', workflow_stage field, approval_status field | Implemented |
| Testimonial workflow: 7-step (graduate submits → permission confirmed → client review → design → final approval → post → graduate shares) | High | Extend Existing Feature — workflow_type='Testimonial', workflow_stage field | Implemented |
| Written consent required before publishing graduate name/photo/story | High — legal/reputational risk | Seed as context requirement note; consent tracker items in Phase 2 | Implemented |

---

## Section 14 — Items That May Require Additional Costs

| Item | scope_treatment | Seeded in Tracker? |
|---|---|---|
| Paid advertising budget | Third-Party Cost | Context record |
| Boosted posts | Third-Party Cost | Context record |
| Professional video production | Separate Cost Likely | Context record |
| Advanced animations/reels | Separate Cost Likely | Context record |
| Full brochure/company profile design | Separate Cost Likely | Not seeded (low priority) |
| Pitch decks / investor presentations | Separate Cost Likely | Not seeded |
| Backend website development | Separate Scope | Separate Scope record |
| Application forms | Separate Scope | Separate Scope record |
| Applicant tracking system | Separate Scope | Separate Scope record |
| CRM/database system | Separate Scope | Separate Scope record |
| WhatsApp Business API | Separate Scope | Separate Scope record |
| Email automation | Separate Scope | Separate Scope record |
| Advanced analytics dashboard | Separate Scope | Context record |
| Professional photography/videography | Third-Party Cost | Not seeded |
| Printing | Third-Party Cost | Not seeded |
| Domain/email renewals | Third-Party Cost | Not seeded |
| Premium plugins/software | Third-Party Cost | Not seeded |
| Google Ads / Meta Ads management | Third-Party Cost | Separate Scope record |
| SEO campaigns beyond basic hygiene | Separate Cost Likely | Context record |
| Emergency turnaround work | Requires Client Approval | Not seeded |

---

## Section 15 — Risks and Dependencies

| Risk | Impact | Tracker Treatment | Record Type | Verification |
|---|---|---|---|---|
| Delayed client approvals | Slows publishing; reduces value | Seeded as Risk record | Risk | Implemented |
| Unclear content ownership | Confusion over messaging sign-off | Seeded as Risk record | Risk | Implemented |
| Missing photos/testimonials | Limits credibility-building content | Seeded as Risk record | Risk | Implemented |
| Unapproved public claims | Reputational / factual risk | Seeded as Risk record | Risk | Implemented |
| Access limitations | Delays platform updates | Seeded as Risk record | Risk | Implemented |
| Late content submission | Reduces planning/publishing consistency | Seeded as Risk record | Risk | Implemented |
| Unclear recruitment boundaries | Scope confusion | Seeded as Risk record | Risk | Implemented |
| No consent for graduate photos/stories | Legal and reputational risk | Seeded as Risk record | Risk | Implemented |
| Scope changes without approval | Work expands beyond agreed allowance | Seeded as Risk record | Risk | Implemented |
| Unclear decision-maker | Approval slowdowns | Seeded as Risk record | Risk | Implemented |
| Reliance on unpaid organic reach | Slower visibility growth | Seed as Context | Context | Implemented |

---

## Section 16 — Recommended Immediate Next Steps

| Next Step | Already In Tracker? | Proposed Treatment | Verification |
|---|---|---|---|
| Confirm Package 3 review start date in writing | No | Implement Now (Approval Gate) | Implemented |
| Confirm main approval contact person | No | Implement Now (Approval Gate) | Implemented |
| Confirm monthly deliverable expectations | No | Implement Now (Decision) | Implemented |
| Confirm admin access for all social pages | Partially (Phase 2 access items) | Implement Now (Task) | Implemented |
| Finalise social follow posters | No | Implement Now (Deliverable) | Implemented |
| Publish CV submission / training update | No | Implement Now (Deliverable) | Implemented |
| Finalise testimonial request workflow | Partially (Phase 2 item) | Implement Now (Deliverable) | Implemented |
| Collect first testimonials and photo permissions | No | Implement Now (Task) | Implemented |
| Finalise email signatures and digital cards | In tracker as Phase 2 item | Implement Now (Deliverable) | Implemented |
| Prepare first 30-day content calendar | No | Implement Now (Deliverable) | Implemented |
| Confirm Phase 2 priority items | No | Implement Now (Decision) | Implemented |
| Confirm items requiring separate costing | No | Seed as Context (Scope records) | Implemented |
| Set review date before end of month | No | Implement Now (Milestone) | Implemented |

---

## Section 17 — Suggested One-Month Review Report

| Report Section | Tracker Support | Implementation |
|---|---|---|
| Content created | Phase 3 tracking records | p3-track-content-output record |
| Content published | Phase 3 posting cadence records | cadence_status tracking |
| Platforms updated | Phase 3 website care records | p3-monitor- records |
| Website updates completed | Phase 3 website care records | p3-implement-minor-updates |
| Graphics completed | Phase 3 content records | p3-social-poster-production etc. |
| Testimonials collected | Phase 3 testimonial records | p3-track-testimonial-collection |
| Audience growth | Engagement observation record | p3-engagement-observation |
| Engagement highlights | Engagement observation record | p3-engagement-observation |
| Pending approvals | approval_status field on items | Tracked via approval_status |
| Workflow issues | Blocker records + risk records | blocked_by, risk- records |
| Recommended improvements | Week 4 review items | p3-identify-workflow-bottlenecks |
| Items requiring separate costing | Separate Scope records | scope- records |
| Recommendation for month two | Package 3 continuation decision | decision-package3-continuation |

---

## Section 18 — Continuation Options After One-Month Review

| Option | Tracker Treatment | Implementation |
|---|---|---|
| Continue Package 3 at R24,000/month | programme_settings key | `programme_review_outcome` field |
| Adjust Package 3 scope | programme_settings key | `programme_review_outcome` field |
| Move to lighter support arrangement | programme_settings key | `programme_review_outcome` field |

**Note:** The final decision remains with the client. The tracker preserves context without pre-selecting an outcome. The `programme_review_outcome` field is initialised as 'Pending Review'. It must not be updated until the client decides.

---

## Section 19 — Closing Programme Context

| Roadmap Requirement | Tracker Relevance | Proposed Treatment | Verification |
|---|---|---|---|
| Purpose: move from launch activity into structured growth | High — frames the entire Phase 3 delivery | Seed as Context — programme context record | Implemented |
| If review confirms value, continuing Package 3 moves from short-term support to sustained momentum | Medium | Seed as Context — programme review outcome record | Implemented |
| Signature block / final confirmation | Low | Not relevant to tracker | Not Relevant to Tracker |

---

## Phase Taxonomy Migration Map

| Old Phase | Old Status | New Phase | New Status | Rationale |
|---|---|---|---|---|
| Phase 1 | (any) | Phase 1 | (preserve) | Historical foundation work |
| Retainer | Moved to Retainer | Phase 3 | Recurring — Active | Retainer items are now active Phase 3 |
| Phase 2 | Moved to Phase 2 | Phase 2 | Not Started | Phase 2 is now active |
| Phase 3 (legacy systems) | Moved to Phase 3 | Separate Scope | Separate Scope | Old "Phase 3: Systems & Automation" was incorrectly named |
| Out of Scope | Out of Scope | Separate Scope | Separate Scope | Clearer terminology |

**Important:** "Phase 3" in the NEW taxonomy refers to Active Growth & Management (content, social, website care). The OLD "Phase 3: Systems & Automation" items are now correctly classified as Separate Scope.

---

## Historical Preservation Traceability Checks

These checks verify the implementation honours the historical preservation principle. All must pass.

| Check | Expected State | Verification Method |
|---|---|---|
| Phase 1 records preserved | All Phase 1 items (task-, social-, del-, asset-, launch-) present in tracker | Query `tracker_items WHERE phase = 'Phase 1'` — expect 30+ records |
| Phase 1 audit trail preserved | `tracker_item_notes` for Phase 1 items intact — no deletions | Query `tracker_item_notes` linked to Phase 1 item IDs |
| Phase 1 accessible via filter | "Phase 1 History" preset in TCC returns Phase 1 items | Manual TCC filter test |
| Phase 1 excluded from default delivery view | TCC "Current Delivery" default shows 0 Phase 1 items | Manual TCC load test |
| Dashboard current-delivery panel first | Programme Delivery Window appears before Phase 1 historical card | Manual Dashboard load test |
| Phase 1 historical card present | Compact Phase 1 summary appears below current-delivery panels | Manual Dashboard visual check |
| Launch Readiness preserved | View navigable; not deleted | Manual nav test |
| Launch Readiness de-emphasised | Not a primary metric on Dashboard | Visual inspection |
| Delivery Board excludes Phase 1 by default | No Phase 1 items in active lanes on initial load | Manual Delivery Board test |
| No Phase 1 notes overwritten | Historical note_text values unchanged | Manual spot-check on known items |
| No Phase 1 statuses reset | Phase 1 statuses as-recorded in DB | Query spot-check |
| Separate Scope items out of active lanes | No Separate Scope items with a non-null delivery_lane | SQL query check |

---

## Roadmap Coverage Summary

| Category | Count |
|---|---|
| Tracker-relevant roadmap requirements identified | 45 |
| Already Supported | 8 |
| Implemented Now | 28 |
| Seeded as Context | 9 |
| Not Relevant to Tracker | 2 |
| Deferred | 0 |
| Requires Ndumiso Decision | 3 |

### Requires Ndumiso Decision

1. **48-hour approval turnaround** — Roadmap recommends this as a standard window. It has been seeded in the tracker as a Phase 2 task but must be explicitly agreed with the client before being marked approved.
2. **Database/spreadsheet structure for CVs/testimonials** — Roadmap flags this as "possibly" extra cost. Seeded as context; scope decision pending.
3. **Google Business Profile** — Roadmap flags as "possibly" extra cost. Seeded; priority confirmation needed.

### Separate Scope / Potential Extra Cost

- Paid advertising (all platforms)
- Boosted posts
- Professional video/photography
- Advanced animations/reels
- Backend development / dynamic web forms
- Application forms (structured form build)
- CRM / Applicant Tracking System
- Graduate Management System
- WhatsApp Business API integration
- Email automation platforms
- Advanced analytics dashboards
- Google Ads / Meta Ads management
- SEO campaigns beyond basic hygiene
- Full brochures / pitch decks / investor presentations
- Emergency turnaround work
