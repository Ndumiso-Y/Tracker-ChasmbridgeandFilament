# Tier 3 Scope Reclassification Matrix

**Version:** 1.2 (V4A Architecture - Finalized)
**Date:** 2026-07-06

## Rationale & Programme Decision Context
The latest project-owner instruction from Ndumiso Yedwa / Embark Digitals confirms that Tier 3 delivery is actively paid for and ongoing. This decision supersedes previous assumptions that these systems and deeper setups were "parked for later" or merely "Future Systems".

**Decision Record:**
- **Title:** Tier 3 Paid Delivery Scope Activated
- **Record Type:** Decision
- **Context:** Latest project-owner instruction confirms Tier 3 has been paid for. Previously parked Tier 2/Tier 3/system items must be audited individually for active delivery. Historical parked classifications remain part of the audit context.

These items must be brought into active Phase 2/Phase 3 delivery, assigned the `Tier 3 Active Delivery` context (or similar active treatments), and mapped to concrete Client Input requirements. 

*Note: This is not a blanket migration. Each item is individually audited. Some items (like "System Build") are too vague and are marked `Requires Scope Definition`, while items like "Graduate Management System" are marked `Already Partially Implemented`.*

## Reclassification Matrix

| Task ID | Current Title | Old State (Phase / Status / Context) | Latest Implementation Evidence / Rationale | New Recommended Treatment (Phase / Status / Context / Scope) | Migration Impact / Linked Input Requirement |
|---|---|---|---|---|---|
| `task-later-google-profile` | Google Profile setup | Phase 2 / Deferred / Package 3 Review | Setup is a foundational operating task. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs GBP setup template. Client must provide core business facts and approve verification method. |
| `task-later-meta-pixel` | Meta Pixel integration | Phase 2 / Deferred / Package 3 Review | Setup is foundational tracking. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs Meta Pixel template (Objective, Portfolio ownership). Embark executes. |
| `task-later-seo-hygiene` | Basic SEO hygiene (Tier 2) | Phase 3 / Not Started / Package 3 Review | Ongoing execution hygiene. | **Phase 3** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs SEO template (Priority services, target regions). |
| `task-later-whatsapp-setup` | WhatsApp setup | Phase 2 / Deferred / Package 3 Review | Operating foundation for comms. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs WhatsApp Setup template (Number, welcome message, ownership). |
| `task-later-comms-tier2` | Comms structures (Tier 2) | Phase 3 / Not Started / Package 3 Review | Ongoing management workflow. | **Phase 3** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs Communication Structure template (Approval channel, cadence). |
| `task-later-web-forms` | Web form integration | Separate Scope / Separate Scope / Future | Was treated as separate technical work. Now active. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs Web Form template (Fields, target email, follow-up owner). |
| `task-later-ai-kb` | AI knowledge base build | Separate Scope / Separate Scope / Future | Client paid for Tier 3 implementation. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs AI KB template (Source docs, restricted topics, intended users). |
| `task-later-system-build` | System build | Separate Scope / Separate Scope / Future | Vague scope. Requires explicit definition before moving to active. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Requires Scope Definition** | Needs System Build template (Objective, core workflow, admin roles). Must be defined before work. |
| `task-later-gms` | Graduate Management System | Separate Scope / Separate Scope / Future | Partially implemented inside current Cohort UI. | **Phase 2** / In Progress / Tier 3 Active Delivery / **Already Partially Implemented** | Will utilize Cohort privacy boundaries. Needs definition of next breakaway steps if required. |
| `task-later-ai-docs` | AI-supported docs (Tier 3) | Separate Scope / Separate Scope / Future | Active drafting support task. | **Phase 3** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs AI-supported Docs template (Purpose, exact facts, human approver). |
| `task-later-system-planning` | System planning (Tier 3) | Separate Scope / Separate Scope / Future | Planning phase for future systems. | **Phase 2** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Planning** | Needs System Planning template (Problem, current manual process, budget). |
| `task-later-seo-deep` | SEO deeper execution (Tier 3) | Separate Scope / Separate Scope / Future | Deeper content/technical SEO. | **Phase 3** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs Deeper SEO template (Conversion goal, target service themes). |
| `task-later-comms-tier3` | Comms structures (Tier 3) | Separate Scope / Separate Scope / Future | Advanced stakeholder comms. | **Phase 3** / Not Started / Tier 3 Active Delivery / **Active Tier 3 Delivery** | Needs Tier 3 Comms template (Stakeholders, reporting expectation). |

## Dependencies
- The `delivery_context` enum must be expanded to include `Tier 3 Active Delivery`.
- A migration script must safely run `UPDATE tracker_items` to apply the New Recommended Treatment for these specific 13 items without destroying historical audit trails.
- `record_type` for the Separate Scope items must be updated from `Context` to `Task` or `Deliverable` where appropriate, while preserving the historical context through `scope_treatment` and audit trails.
