export const ORG_SLUGS = {
  Filament: "filament",
  "Chasm Bridge Charity": "chasm-bridge-charity",
};

export const ORG_LABELS = Object.fromEntries(Object.entries(ORG_SLUGS).map(([label, slug]) => [slug, label]));

export const PROGRAMME_SLUGS = {
  "template-filament-profile-review": "company-profile",
  "template-filament-slides-review": "presentation",
  "template-filament-slides-review-v2": "presentation",
  "template-filament-website-review-v1": "website",
  "template-filament-social-media-strategy-review-v1": "social-media-strategy",
  "template-chasm-bridge-website-review-v1": "website",
  "template-chasm-bridge-social-media-strategy-review-v1": "social-media-strategy",
};
export const ALLOWED_PROGRAMME_SLUGS = new Set(Object.values(PROGRAMME_SLUGS));
export const ORG_PROGRAMME_SLUGS = {
  filament: new Set(["company-profile", "presentation", "website", "social-media-strategy"]),
  "chasm-bridge-charity": new Set(["website", "social-media-strategy"]),
};

export const MAIN_ROUTES = {
  dashboard: "command-center",
  tasks: "task-command-center",
  delivery: "delivery-board",
  client_input: "requests",
  filament_reviews: "reviews",
  support: "support",
  weekly_review: "weekly-reviews",
  graduates: "graduates",
  client_access: "client-access",
  scope: "phase-1-scope",
  launch: "launch-readiness",
  later: "later-phases",
  assets: "client-assets",
  boundaries: "scope-boundaries",
  client_home: "attention",
};

export const ROUTE_TO_VIEW = Object.fromEntries(Object.entries(MAIN_ROUTES).map(([view, slug]) => [slug, view]));

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const ITEM_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,119}$/;

export function encodeRouteValue(value) {
  return encodeURIComponent(String(value || "").trim());
}

export function decodeRouteValue(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

export function isSafeRecordId(value) {
  return ID_RE.test(String(value || ""));
}

export function isSafeItemKey(value) {
  return ITEM_KEY_RE.test(String(value || ""));
}

export function routeForView(view) {
  return `/${MAIN_ROUTES[view] || MAIN_ROUTES.dashboard}`;
}

export function buildHashPath(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `#${cleanPath}`;
}

export function buildTrackerUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const base = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}`
    : "https://ndumiso-y.github.io/Tracker-ChasmbridgeandFilament/";
  return `${base}#${cleanPath}`;
}

export function isValidReviewProgrammeForOrg(organisationSlug, programmeSlug) {
  if (!organisationSlug || !programmeSlug) return true;
  return !!ORG_PROGRAMME_SLUGS[organisationSlug]?.has(programmeSlug);
}

export function buildMainSectionUrl(view) {
  return buildTrackerUrl(routeForView(view));
}

export function buildReviewOrganisationPath(organisation) {
  const slug = ORG_SLUGS[organisation] || organisation;
  return `/reviews/${slug}`;
}

export function buildReviewProgrammePath(organisation, programmeSlug) {
  return `${buildReviewOrganisationPath(organisation)}/${programmeSlug}`;
}

export function buildExactReviewPath(organisation, programmeSlug, requestId) {
  return `${buildReviewProgrammePath(organisation, programmeSlug)}/review/${encodeRouteValue(requestId)}`;
}

export function buildReviewItemPath(organisation, programmeSlug, requestId, itemKey) {
  return `${buildExactReviewPath(organisation, programmeSlug, requestId)}/item/${encodeRouteValue(itemKey)}`;
}

export function buildSupportIssuePath(ticketId) {
  return `/support/${encodeRouteValue(ticketId)}`;
}

export function buildClientRequestPath(requestId) {
  return `/requests/${encodeRouteValue(requestId)}`;
}

export function buildDeliveryItemPath(itemId) {
  return `/delivery/${encodeRouteValue(itemId)}`;
}

export function buildReviewProgrammeUrl(organisation, programmeSlug) {
  return buildTrackerUrl(buildReviewProgrammePath(organisation, programmeSlug));
}

export function buildExactReviewUrl(organisation, programmeSlug, requestId) {
  return buildTrackerUrl(buildExactReviewPath(organisation, programmeSlug, requestId));
}

export function buildReviewItemUrl(organisation, programmeSlug, requestId, itemKey) {
  return buildTrackerUrl(buildReviewItemPath(organisation, programmeSlug, requestId, itemKey));
}

export function buildSupportIssueUrl(ticketId) {
  return buildTrackerUrl(buildSupportIssuePath(ticketId));
}

export function buildClientRequestUrl(requestId) {
  return buildTrackerUrl(buildClientRequestPath(requestId));
}

export function buildDeliveryItemUrl(itemId) {
  return buildTrackerUrl(buildDeliveryItemPath(itemId));
}

export function programmeSlugForRequest(request) {
  return PROGRAMME_SLUGS[request?.template_id] || null;
}

export function organisationSlugForRequest(request) {
  return ORG_SLUGS[request?.entity] || null;
}

export function parseTrackerRoute(pathname = "/") {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(decodeRouteValue);
  if (parts.length === 0) return { type: "main", view: "dashboard", valid: true };

  if (parts[0] === "reviews") {
    const organisationSlug = parts[1] || null;
    const programmeSlug = parts[2] || null;
    const marker = parts[3] || null;
    const recordId = parts[4] || null;
    const itemMarker = parts[5] || null;
    const itemKey = parts[6] || null;
    if (organisationSlug && !ORG_LABELS[organisationSlug]) return { type: "invalid", message: "You do not have access to this area.", view: "filament_reviews" };
    if (programmeSlug && !ALLOWED_PROGRAMME_SLUGS.has(programmeSlug)) return { type: "invalid", message: "This item could not be found.", view: "filament_reviews" };
    if (!isValidReviewProgrammeForOrg(organisationSlug, programmeSlug)) return { type: "invalid", message: "This item could not be found.", view: "filament_reviews" };
    if (recordId && !isSafeRecordId(recordId)) return { type: "invalid", message: "This item could not be found.", view: "filament_reviews" };
    if (itemKey && !isSafeItemKey(itemKey)) return { type: "invalid", message: "This review section could not be found.", view: "filament_reviews" };
    if (marker && marker !== "review" && marker !== "group") return { type: "invalid", message: "This item could not be found.", view: "filament_reviews" };
    if (itemMarker && itemMarker !== "item" && itemMarker !== "compare") return { type: "invalid", message: "This review section could not be found.", view: "filament_reviews" };
    return { type: "reviews", view: "filament_reviews", organisationSlug, programmeSlug, recordId, itemKey, groupId: marker === "group" ? recordId : null, compare: itemMarker === "compare", valid: true };
  }

  if (parts[0] === "requests") {
    const recordId = parts[1] || null;
    return recordId && !isSafeRecordId(recordId)
      ? { type: "invalid", message: "This item could not be found.", view: "client_input" }
      : { type: "record", view: "client_input", recordId, valid: true };
  }

  if (parts[0] === "support") {
    const recordId = parts[1] || null;
    return recordId && !isSafeRecordId(recordId)
      ? { type: "invalid", message: "This item could not be found.", view: "support" }
      : { type: "record", view: "support", recordId, valid: true };
  }

  if (parts[0] === "delivery") {
    const recordId = parts[1] || null;
    return recordId && !isSafeRecordId(recordId)
      ? { type: "invalid", message: "This item could not be found.", view: "delivery" }
      : { type: "record", view: "delivery", recordId, valid: true };
  }

  const view = ROUTE_TO_VIEW[parts[0]];
  return view
    ? { type: "main", view, valid: true }
    : { type: "invalid", message: "This section could not be found.", view: "dashboard" };
}
