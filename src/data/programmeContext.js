/**
 * Programme Context - RELEASE-CONTROLLED CANONICAL CONFIG
 * 
 * This file serves as the single source of truth for static, release-controlled
 * programme definitions (enums, standard selector options) across the system.
 * 
 * DO NOT place dynamic database records (e.g. users, dynamic items) here.
 * Active Editors remain sourced from update_authors.
 * Client Contributors remain sourced from user_access_profiles.
 * Delivery Items remain sourced from tracker_items.
 */

export const PROGRAMME_PHASES = [
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Separate Scope"
];

export const PROGRAMME_ENTITIES = [
  "Chasm Bridge Charity",
  "Filament",
  "Both"
];

export const PROGRAMME_PRIORITIES = [
  "High",
  "Medium",
  "Low"
];

export const TICKET_URGENCY = [
  "Normal",
  "Urgent",
];

// Per-template contextual action labels for the guided review continuous
// wizard entry point. Displayed on the submit button of each request-creation
// path when a guided template is selected.
// Key = template_id (must match client_input_templates.id exactly).
export const GUIDED_REVIEW_ACTION_LABELS = {
  'template-filament-profile-review': 'Next: Review Company Profile',
  'template-filament-slides-review': 'Next: Review Presentation',
  'template-filament-slides-review-v2': 'Next: Review Presentation',
  'template-filament-website-review-v1': 'Next: Review Website',
  'template-chasm-bridge-website-review-v1': 'Next: Review Website',
};

// Retired templates (V4A.16): kept in the database for historical persisted
// reviews, but never offered for NEW request creation. The 43-slide
// presentation inventory was superseded by the physical 61-slide deck
// (template-filament-slides-review-v2). The generic 'template-presentation'
// ("Presentation Review") is retired too: it sat beside "Filament
// Presentation Review" in the same picker, and the guided 61-slide programme
// under Filament Reviews is the one true way to review the deck.
export const RETIRED_TEMPLATE_IDS = [
  'template-filament-slides-review',
  'template-presentation',
];

// Secure Sign In (Magic Link client/admin sessions) is HIDDEN for now by
// product owner decision (2026-07-10): the workflow runs entirely on the
// no-session Active Editor persona until client sign-ins are called up
// again. Flip to true to restore the sidebar Secure Sign In entry, the
// Client Access admin surface, and the sign-in-oriented helper copy.
// Nothing is deleted — routes, views, RPCs and RLS all stay intact.
export const SECURE_SIGN_IN_ENABLED = false;

export const INPUT_URGENCY = [
  "Normal",
  "Time Sensitive",
  "Urgent"
];

// Re-export common utilities if necessary for shared Programme Context.
