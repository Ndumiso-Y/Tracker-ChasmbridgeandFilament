# Client Delivery Assurance & Collaboration Context

**Version:** 1.2 (V4A Architecture - Finalized)
**Date:** 2026-07-06

## 1. Business Problem
During Phase 2 and Phase 3 delivery, real delivery experience has exposed several customer-service and project-control weaknesses:
- Deliverables technically complete from Embark Digitals' perspective do not always match the client's exact intended wording, structure, image direction, or expectation.
- Support issues are occasionally assumed resolved because the client or team member went quiet. Silence has historically been interpreted as satisfaction or resolution.
- Repeated revisions are extending delivery timelines and causing client frustration.
- Work is entering production before requirements are sufficiently defined or confirmed.

## 2. System Objective
The new system evolution is the **CLIENT DELIVERY ASSURANCE & COLLABORATION LAYER**. 

The goal is not to create a disconnected project management tool or a new task database. The objective is to embed a robust collaboration layer *inside* the existing Command Center that tracks:
1. What the client actually wants.
2. Exact supplied wording versus content Embark may professionally refine.
3. Order and structural expectations.
4. Active support issues and their true resolution state.
5. Revision causes.
6. Weekly delivery satisfaction with strict, normalised disposition rules.

## 3. Core Principles & Safeguards
- **Silence Rule:** Silence must NEVER be interpreted as approval, resolution, or delivery completion.
- **Resolution vs. Closure:** An issue is only "Resolved" when Embark Digitals believes it is fixed. It is only "Closed" when the affected user explicitly confirms resolution or an authorised closure process executes.
- **Readiness Definition:** A "Ready for Production" checklist acts as the Definition of Ready. Readiness status (e.g., Not Ready, Partially Ready, Ready for Production) is derived from individual `delivery_assurance_checklist_items`.
- **Completion Confirmation:** A "Completion Checklist" acts as the Definition of Done. Individual confirmation items are preserved. Technical completion does not automatically equal client-confirmed completion.
- **Revision Intelligence:** Revisions must track the *reason* for the revision (e.g., Scope Addition, Requirement Misunderstood) to improve future delivery templates and processes without acting as a blame system.
- **Role Permissions & Entity Scope:** Clients type and submit inputs using a strict `user_access_profiles` structure enforcing entity boundaries (Chasm Bridge vs Filament vs Both). Approval authority is specifically assigned.
- **Template Abstraction:** Template definitions are rigidly separated from actual client answers. Reusable templates define the questions; project instances capture the versioned responses.
- **Destructive Overwrite Protection:** Submitted client input must NEVER be destructively overwritten. Section revisions preserve the history of confirmed requirements.
- **Normalised Feedback Disposition:** Negative feedback in Weekly Reviews must receive an explicit disposition (e.g., Process Improvement, Support Ticket Required) via individual `weekly_review_feedback_items`. It cannot disappear.
- **Submission Acknowledgement:** Client submissions must track `acknowledged_at` to explicitly show the client that Embark Digitals has received their input.
- **Tier 3 Activation Context:** The activation of Tier 3 scope is an explicit programme decision overriding previous parked assumptions. Active scoping treatments are individually assessed.
- **Staged File Uploads (V4B):** File uploads are explicitly deferred to V4B to ensure auth and collaboration RLS are proven stable in V4A without risking private graduate storage leaks.

## 4. Auth vs. Identity Abstraction
- **Authenticated Identity (`user_id`):** Managed via Supabase Magic Links. This handles *who* is allowed into the system via `user_access_profiles`.
- **Author/Approver Identity (`update_author_id`):** Maps to the public `update_authors` table. This handles *who* has operational authority to approve a deliverable. 
Authentication alone does not grant contributor rights; a user must exist in the approved access profile model.

## 5. Client-Facing Workflow Guidance
To reduce confusion, the system provides lightweight UX workflow expectations:
**Client Input:**
1. Input Submitted
2. Embark Review
3. Clarification if Needed
4. Requirements Confirmed
5. Production / Revision
6. Client Review
7. Final Approval

**Support Issue:**
1. Issue Received
2. Acknowledged
3. Investigation
4. Resolution Proposed
5. Client Confirms Resolved / Still Not Resolved
6. Closed only after confirmation workflow
