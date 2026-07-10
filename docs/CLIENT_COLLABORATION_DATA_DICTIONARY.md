# Client Collaboration Data Dictionary

**Version:** 1.2 (V4A Architecture - Finalized)
**Date:** 2026-07-06

This document defines the schema extensions for the Client Delivery Assurance & Collaboration layer. These tables integrate with the master `tracker_items` register.

## 1. user_access_profiles
A strict mapping between authenticated Supabase Auth users (Magic Links) and their operational identity/entity scope.

| Field | Type | Description |
|---|---|---|
| `user_id` | uuid (PK) | Supabase auth.users ID |
| `role` | text | `admin`, `client_contributor`, `viewer` |
| `entity_scope` | text | `Chasm Bridge Charity`, `Filament`, or `Both` |
| `is_active` | boolean | Toggle access without deleting user |
| `display_name` | text | Human-readable name |
| `update_author_id` | text (FK) | Maps to `update_authors.id` to unify history |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

## 2. Template Architecture
Separates reusable definition from actual client answers.

### client_input_templates
Defines a reusable template.
| Field | Type | Description |
|---|---|---|
| `id` | text (PK) | Slug format (e.g., `template-presentation`) |
| `title` | text | Human-readable template name |
| `description` | text | Contextual help text |
| `created_at` | timestamptz | Auto |

### client_input_template_sections
Defines the questions/structure for a template.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `template_id` | text (FK) | Maps to `client_input_templates.id` |
| `section_key` | text | Programmatic key (e.g., `exact_copy`) |
| `section_label` | text | Human-readable prompt |
| `section_type` | text | `Short Text`, `Long Text`, `Exact Copy`, `Checklist`, `Yes / No`, `Select` |
| `help_text` | text | Additional instructions |
| `sort_order` | integer | UI display order |
| `is_required` | boolean | Must be completed |

## 3. Client Input Requests & Responses
Tracks the actual project instances and versioned client answers.

### client_input_requests
| Field | Type | Description |
|---|---|---|
| `id` | text (PK) | Slug format (e.g., `input-p3-social-july`) |
| `title` | text | Human-readable title |
| `entity` | text | `Chasm Bridge Charity`, `Filament`, `Both` |
| `linked_tracker_item_id` | text (FK) | Maps to `tracker_items.id` |
| `template_id` | text (FK) | Maps to `client_input_templates.id` |
| `status` | text | `Draft`, `Client Input Required`, `Ready for Embark Review`, `Requirements Confirmed`, `Client Review`, `Approved` |
| `assigned_contributor_user_id`| uuid (FK)| Maps to `user_access_profiles.user_id` (Who logs in) |
| `primary_approver_author_id`| text (FK) | Maps to `update_authors.id` (Who has authority) |
| `revision_number` | integer | Increments on major changes/rejections |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |
| `submitted_at` | timestamptz | Set when client finishes typing |
| `review_acknowledged_at` | timestamptz | Explicit admin acknowledgment |
| `confirmed_at` | timestamptz | Set when accepted for production |

### client_input_responses
The active Draft client answers mapping to a template section.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `input_request_id` | text (FK) | Maps to `client_input_requests.id` |
| `template_section_id` | uuid (FK) | Maps to `client_input_template_sections.id` |
| `content` | text | The active *Draft* client response |
| `updated_at` | timestamptz | Auto |
| `updated_by` | uuid | Auth user ID |

### client_input_response_revisions
Freezes submitted client copy to prevent destructive overwriting.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `response_id` | uuid (FK) | Maps to `client_input_responses.id` |
| `revision_number` | integer | Tracks iteration count |
| `content` | text | Frozen submitted text |
| `changed_by_user_id` | uuid | Who typed it |
| `changed_by_author_id`| text | Logical author attribution |
| `revision_reason` | text | E.g., `Requirement Misunderstood` |
| `created_at` | timestamptz | Timestamp of this revision |
| `is_current_confirmed`| boolean | Identifies the accepted canonical version |

## 4. delivery_assurance_checklist_items
Stores individual line-items for Definition of Ready / Definition of Done.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `input_request_id` | text (FK) | Optional link to an input request |
| `linked_tracker_item_id` | text (FK) | Maps to `tracker_items.id` |
| `checklist_type` | text | `Ready for Production` or `Completion` |
| `item_key` | text | E.g., `objective_confirmed` |
| `item_label` | text | E.g., `Objective confirmed` |
| `is_required` | boolean | Must be completed for total readiness |
| `is_completed` | boolean | Completion state |
| `completed_by_user_id` | uuid | Auth user |
| `completed_by_author_id` | text | Logical author |
| `completed_at` | timestamptz | Timestamp of completion |
| `confirmation_source` | text | E.g., `Client Input Request`, `Admin Override` |
| `sort_order` | integer | UI display order |

## 5. client_input_comments
Contextual discussion attached to requests.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `input_request_id` | text (FK) | Maps to `client_input_requests.id` |
| `response_id` | uuid (FK) | Optional: if comment is about a specific section |
| `author_id` | text (FK) | Maps to `update_authors.id` |
| `comment` | text | Content |
| `created_at` | timestamptz | Auto |

## 6. support_tickets
Formal tracking for issues and bugs to enforce the "Silence is not Resolution" rule.
| Field | Type | Description |
|---|---|---|
| `id` | text (PK) | Slug format (e.g., `ticket-email-rudy`) |
| `title` | text | Short issue summary |
| `entity` | text | Context entity |
| `category` | text | `Email & Mailbox`, `Website`, `Access & Permissions`, `Content Correction`, etc. |
| `description` | text | Detailed issue description |
| `linked_tracker_item_id` | text (FK) | Optional: link to failing/related task |
| `reported_by_user_id` | uuid (FK) | Authenticated user who reported |
| `priority` | text | `High`, `Medium`, `Low` |
| `responsible_party` | text | Who is fixing it (e.g., `Embark Digitals`) |
| `status` | text | `New`, `Investigating`, `Waiting on Client`, `Resolution Proposed`, `Awaiting Client Confirmation`, `Resolved`, `Closed` |
| `investigation_summary` | text | Admin notes on the fix |
| `action_taken` | text | What was done |
| `resolution_proposed_at` | timestamptz | When Embark flagged it as resolved |
| `client_confirmed_at` | timestamptz | When client explicitly confirmed it is working |
| `acknowledged_at` | timestamptz | When Embark acknowledged the report |
| `closed_at` | timestamptz | Final closure timestamp |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

## 7. Weekly Reviews & Feedback Items
Formal structured feedback for the Package 3 / Tier 3 delivery sprints, tracking both the overall ratings and the individual normalised negative feedback items requiring disposition.

### weekly_delivery_reviews
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `review_period_start` | date | Start of reviewed week |
| `review_period_end` | date | End of reviewed week |
| `reviewer_user_id` | uuid (FK) | Maps to `user_access_profiles` |
| `entity` | text | `Chasm Bridge Charity` or `Filament` |
| `overall_delivery` | text | `Excellent`, `Good`, `Acceptable`, `Needs Improvement`, `Poor` |
| `requirement_understanding`| text | `Understood First Time`, `Multiple Revisions Required`, etc. |
| `submitted_at` | timestamptz | Locks the review |

### weekly_review_feedback_items
Normalises individual material feedback points requiring explicit disposition.
| Field | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Auto |
| `review_id` | uuid (FK) | Maps to `weekly_delivery_reviews.id` |
| `feedback_category` | text | `Worked Well`, `Did Not Meet Expectations`, `Timing`, `Communication` |
| `feedback_text` | text | The actual textual feedback |
| `sentiment` | text | `Positive`, `Neutral`, `Negative`, `Critical` |
| `disposition` | text | `Acknowledged — No Separate Action`, `Follow-Up Task Required`, `Support Ticket Required`, `Clarification Required`, `Process Improvement`, `Monitor Next Week` |
| `linked_tracker_item_id` | text (FK) | Link to created Follow-Up Task |
| `linked_support_ticket_id` | text (FK) | Link to created Support Ticket |
| `admin_response` | text | Internal reasoning for the disposition |
| `dispositioned_by` | text (FK) | Maps to `update_authors.id` |
| `dispositioned_at` | timestamptz | Timestamp of disposition |
| `created_at` | timestamptz | Auto |

## 8. RLS & Mutation Matrix
See the `CLIENT_DELIVERY_ASSURANCE_CONTEXT.md` and Implementation Plan V4A for the explicit mutation rights and Supabase RLS matrix governing the `user_access_profiles.entity_scope`.

*Note: `client_input_attachments` (File Uploads) is deferred to V4B.*
