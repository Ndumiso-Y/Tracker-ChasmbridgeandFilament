/**
 * validate-cohort-data.mjs
 * Safety and data-contract validation script for the Graduates & Cohort feature.
 * v2 — Spreadsheet-aligned field validation (Cohort 1 / Cohort 2 structure)
 *
 * Run: node scripts/validate-cohort-data.mjs
 * Or:  npm run validate:cohort
 *
 * CHECKS:
 * 1. Cohort seed data — status values, required fields, no unsafe language
 * 2. Graduate seed data — no real personal data, no unsafe patterns, no AI language
 * 3. Graduate field values within controlled vocabulary
 * 4. No SA ID number patterns (13-digit sequences)
 * 5. No banned third-party mine company names
 * 6. No AI scoring, ranking, or automated decision language
 * 7. No guaranteed placement language
 * 8. No bare integer IDs
 * 9. No duplicate IDs or duplicate row_number within the same cohort
 * 10. year_graduated and nqf_level within reasonable ranges
 * 11. Source file scan: GraduatesCohort.jsx, cohortService.js, cohort_schema.sql
 */

import fs from "fs";
import path from "path";

const errors = [];
const warnings = [];

function addError(msg) { errors.push(msg); }
function addWarning(msg) { warnings.push(msg); }

// ─────────────────────────────────────────────────────────────
// Regex patterns
// ─────────────────────────────────────────────────────────────

const jwtRegex = /eyJ[a-zA-Z0-9-_=]+\.eyJ[a-zA-Z0-9-_=]+\.[a-zA-Z0-9-_=]+/g;
const saIdPattern = /\b\d{13}\b/;
const bannedMineNames = ["BHP", "Harmony", "RB Plats", "Tranter", "Ingwe"];

const aiDecisionPatterns = [
  { regex: /ai\s*(score|rank|rated?|recommend|accept|reject|suitability|decision)/i, label: "AI scoring/decision language" },
  { regex: /accepted\s+by\s+ai/i, label: "AI acceptance language" },
  { regex: /rejected\s+by\s+ai/i, label: "AI rejection language" },
  { regex: /ai\s+recommended/i, label: "AI recommendation language" },
  { regex: /\branked\s+#?\d+/i, label: "Ranking language" },
  { regex: /\bbest\s+candidate\b/i, label: "Best candidate language" },
  { regex: /\bpoor\s+candidate\b/i, label: "Poor candidate language" },
  { regex: /automated?\s+(decision|accept|reject|screening)/i, label: "Automated decision language" },
];

const placementGuaranteePatterns = [
  { regex: /guaranteed?\s*(placement|job|employment|absorption)/i, label: "Guaranteed placement language" },
  { regex: /will\s+be\s+(placed|employed|absorbed)/i, label: "Guaranteed employment language" },
  { regex: /confirmed\s+placement/i, label: "Confirmed placement language" },
  { regex: /guaranteed\s+absorption/i, label: "Guaranteed absorption language" },
];

// ─────────────────────────────────────────────────────────────
// Controlled vocabulary — spreadsheet-aligned
// ─────────────────────────────────────────────────────────────

const VALID_COHORT_STATUSES = [
  "Planning", "Recruiting", "Applications Received", "Shortlisting",
  "Training", "Active", "Completed", "Placement / Project Readiness", "Closed", "Parked",
];

const VALID_SEX = ["Mr", "Ms", "MS", "Other / Confirm"];

const VALID_COMPETENT_B      = ["Yes", "No", "Pending", "Not Confirmed"];
const VALID_BLASTING_CERT    = ["Yes", "No", "Pending", "Not Confirmed"];
const VALID_EMPLOYMENT       = ["Yes", "No", "Pending", "Not Confirmed"];

const VALID_FILAMENT_STATUS  = [
  "Filament Client",
  "Filament",
  "Filament Permanent Staff",
  "Not Assigned",
  "Pending Confirmation",
];

const VALID_ATTRITION_STATUS = [
  "Active",
  "Lost to Attrition",
  "Withdrawn",
  "Not Confirmed",
];

const YEAR_MIN = 1990;
const YEAR_MAX = new Date().getFullYear() + 5;
const NQF_MIN  = 1;
const NQF_MAX  = 10;

// ─────────────────────────────────────────────────────────────
// Seed data (mirrors cohort_schema.sql seed)
// ─────────────────────────────────────────────────────────────

const seedCohorts = [
  {
    id: "cohort-1",
    cohort_name: "Cohort 1",
    programme_name: "Chasm Bridge / Filament Graduate Cohort",
    entity_owner: "Chasm Bridge Charity / Filament (Pty) Ltd",
    status: "Completed",
    is_public_summary: false,
    is_active: true,
  },
  {
    id: "cohort-2",
    cohort_name: "Cohort 2",
    programme_name: "Chasm Bridge / Filament Graduate Cohort",
    entity_owner: "Chasm Bridge Charity / Filament (Pty) Ltd",
    status: "Active",
    is_public_summary: false,
    is_active: true,
  },
];

const seedGraduates = [
  {
    id: "graduate-001",
    cohort_id: "cohort-1",
    cohort_number: 1,
    row_number: 1,
    sex: "Mr",
    first_name: "Graduate",
    surname: "001",
    year_graduated: 2025,
    nqf_level: 8,
    degree: "B.Sc Eng (Mining)",
    university: "Wits",
    competent_b: "Yes",
    blasting_certificate: "No",
    employment: "Yes",
    filament_status: "Filament Client",
    attrition_status: "Active",
    is_active: true,
  },
  {
    id: "graduate-002",
    cohort_id: "cohort-1",
    cohort_number: 1,
    row_number: 2,
    sex: "Ms",
    first_name: "Graduate",
    surname: "002",
    year_graduated: 2024,
    nqf_level: 8,
    degree: "B.Tech Engineering Mining",
    university: "UKZN",
    competent_b: "Yes",
    blasting_certificate: "Yes",
    employment: "Yes",
    filament_status: "Filament",
    attrition_status: "Active",
    is_active: true,
  },
  {
    id: "graduate-003",
    cohort_id: "cohort-1",
    cohort_number: 1,
    row_number: 3,
    sex: "Mr",
    first_name: "Graduate",
    surname: "003",
    year_graduated: 2023,
    nqf_level: 7,
    degree: "B.Eng Mining",
    university: "UP",
    competent_b: "No",
    blasting_certificate: "No",
    employment: "No",
    filament_status: "Not Assigned",
    attrition_status: "Lost to Attrition",
    is_active: true,
  },
  {
    id: "graduate-004",
    cohort_id: "cohort-2",
    cohort_number: 2,
    row_number: 1,
    sex: "Mr",
    first_name: "Graduate",
    surname: "004",
    year_graduated: 2025,
    nqf_level: 8,
    degree: "B.Sc Eng (Mining)",
    university: "UCT",
    competent_b: "Pending",
    blasting_certificate: "Pending",
    employment: "Pending",
    filament_status: "Not Assigned",
    attrition_status: "Active",
    is_active: true,
  },
  {
    id: "graduate-005",
    cohort_id: "cohort-2",
    cohort_number: 2,
    row_number: 2,
    sex: "Ms",
    first_name: "Graduate",
    surname: "005",
    year_graduated: 2025,
    nqf_level: 8,
    degree: "B.Tech Engineering Mining",
    university: "TUT",
    competent_b: "Not Confirmed",
    blasting_certificate: "Not Confirmed",
    employment: "Not Confirmed",
    filament_status: "Not Assigned",
    attrition_status: "Active",
    is_active: true,
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function checkString(str, ctx) {
  if (typeof str !== "string") return;
  if (jwtRegex.test(str)) addError(`JWT token detected at ${ctx}`);
  if (saIdPattern.test(str)) addError(`SA ID number pattern (13 digits) at ${ctx}: "${str}"`);
  for (const name of bannedMineNames) {
    const r = new RegExp(`\\b${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (r.test(str)) addError(`Banned third-party name "${name}" at ${ctx}`);
  }
  for (const { regex, label } of aiDecisionPatterns) {
    if (regex.test(str)) addError(`${label} at ${ctx}`);
  }
  for (const { regex, label } of placementGuaranteePatterns) {
    if (regex.test(str)) addError(`${label} at ${ctx}`);
  }
}

function deepScan(obj, ctx) {
  if (typeof obj === "string") checkString(obj, ctx);
  else if (Array.isArray(obj)) obj.forEach((v, i) => deepScan(v, `${ctx}[${i}]`));
  else if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) deepScan(obj[k], `${ctx}.${k}`);
  }
}

function checkEnumField(val, allowed, fieldName, ctx) {
  if (val !== undefined && val !== null && !allowed.includes(val)) {
    addError(`Invalid ${fieldName} value "${val}" at ${ctx}. Allowed: [${allowed.join(", ")}]`);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Validate cohort seed data
// ─────────────────────────────────────────────────────────────

console.log("Checking cohort seed data...");
const seenCohortIds = new Set();

seedCohorts.forEach((cohort, i) => {
  const ctx = `seedCohorts[${i}] (${cohort.id})`;
  if (!cohort.id) addError(`Missing id in ${ctx}`);
  else {
    if (seenCohortIds.has(cohort.id)) addError(`Duplicate cohort id "${cohort.id}"`);
    if (/^\d+$/.test(cohort.id)) addError(`Bare integer ID "${cohort.id}" — use descriptive IDs`);
    seenCohortIds.add(cohort.id);
  }
  if (!cohort.cohort_name) addError(`Missing cohort_name in ${ctx}`);
  if (!cohort.status) addError(`Missing status in ${ctx}`);
  else checkEnumField(cohort.status, VALID_COHORT_STATUSES, "status", ctx);
  if (cohort.is_public_summary === true) {
    addWarning(`Cohort "${cohort.id}" has is_public_summary=true — ensure frontend does not expose personal data`);
  }
  deepScan(cohort, ctx);
});

// ─────────────────────────────────────────────────────────────
// 2. Validate graduate seed data
// ─────────────────────────────────────────────────────────────

console.log("Checking graduate seed data...");
const seenGraduateIds = new Set();
// Track row_number per cohort for duplicate check
const rowNumbersByCohort = {};

seedGraduates.forEach((grad, i) => {
  const ctx = `seedGraduates[${i}] (${grad.id})`;

  // ID checks
  if (!grad.id) addError(`Missing id in ${ctx}`);
  else {
    if (seenGraduateIds.has(grad.id)) addError(`Duplicate graduate id "${grad.id}"`);
    if (/^\d+$/.test(grad.id)) addError(`Bare integer ID "${grad.id}" — use descriptive IDs`);
    seenGraduateIds.add(grad.id);
  }

  // No real personal data in seed
  if (grad.email) addError(`Seed graduate "${grad.id}" has email — do not seed personal contact data`);
  if (grad.phone) addError(`Seed graduate "${grad.id}" has phone — do not seed personal contact data`);

  // Placeholder name check
  if (grad.first_name && grad.surname) {
    const combined = `${grad.first_name} ${grad.surname}`;
    if (!/^Graduate\s+\d+$/i.test(combined.trim())) {
      addWarning(`Seed graduate "${grad.id}" has non-placeholder name: "${combined}". Confirm this is not real personal data.`);
    }
  }

  // Cohort reference
  if (grad.cohort_id && !seenCohortIds.has(grad.cohort_id)) {
    addError(`Graduate "${grad.id}" references unknown cohort_id "${grad.cohort_id}"`);
  }

  // Duplicate row_number within cohort
  if (grad.cohort_id && grad.row_number !== undefined && grad.row_number !== null) {
    const key = `${grad.cohort_id}::${grad.row_number}`;
    if (rowNumbersByCohort[key]) {
      addError(`Duplicate row_number ${grad.row_number} in cohort "${grad.cohort_id}" (graduate ids: ${rowNumbersByCohort[key]} and ${grad.id})`);
    }
    rowNumbersByCohort[key] = grad.id;
  }

  // Controlled vocab
  checkEnumField(grad.sex,                  VALID_SEX,            "sex",                  ctx);
  checkEnumField(grad.competent_b,          VALID_COMPETENT_B,    "competent_b",          ctx);
  checkEnumField(grad.blasting_certificate, VALID_BLASTING_CERT,  "blasting_certificate", ctx);
  checkEnumField(grad.employment,           VALID_EMPLOYMENT,     "employment",           ctx);
  checkEnumField(grad.filament_status,      VALID_FILAMENT_STATUS, "filament_status",     ctx);
  checkEnumField(grad.attrition_status,     VALID_ATTRITION_STATUS, "attrition_status",  ctx);

  // Year range
  if (grad.year_graduated !== undefined && grad.year_graduated !== null) {
    const y = Number(grad.year_graduated);
    if (isNaN(y) || y < YEAR_MIN || y > YEAR_MAX) {
      addError(`year_graduated "${grad.year_graduated}" out of range [${YEAR_MIN}–${YEAR_MAX}] at ${ctx}`);
    }
  }

  // NQF range
  if (grad.nqf_level !== undefined && grad.nqf_level !== null) {
    const n = Number(grad.nqf_level);
    if (isNaN(n) || n < NQF_MIN || n > NQF_MAX) {
      addError(`nqf_level "${grad.nqf_level}" out of range [${NQF_MIN}–${NQF_MAX}] at ${ctx}`);
    }
  }

  // No AI fields
  for (const field of ["ai_score", "ai_rank", "ai_recommendation", "score", "rank", "suitability_score"]) {
    if (grad[field] !== undefined) addError(`Forbidden field "${field}" in ${ctx} — AI scoring is not permitted`);
  }

  deepScan(grad, ctx);
});

// ─────────────────────────────────────────────────────────────
// 3. Source file scan
// ─────────────────────────────────────────────────────────────

console.log("Scanning source files...");

const srcFilesToScan = [
  "./src/views/GraduatesCohort.jsx",
  "./src/services/cohortService.js",
  // validateGraduate.js is the validator itself — legitimately references banned
  // phrases in error messages. Do not scan it for string literal content.
  // "./src/utils/validateGraduate.js",
  "./supabase/cohort_schema.sql",
];

for (const filePath of srcFilesToScan) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    addWarning(`Expected file not found: ${filePath}`);
    continue;
  }
  const content = fs.readFileSync(resolved, "utf8");

  if (jwtRegex.test(content)) addError(`JWT token in source file: ${filePath}`);

  // service_role check — split to avoid self-flagging
  const srKw = "service" + "_" + "role";
  if (content.includes(srKw)) addError(`"${srKw}" keyword in source file: ${filePath}`);

  // Placement guarantee in string literals only
  const stringLiterals = content.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
  for (const lit of stringLiterals) {
    for (const { regex, label } of placementGuaranteePatterns) {
      if (regex.test(lit)) addError(`${label} in string literal in ${filePath}: ${lit.substring(0, 60)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Report
// ─────────────────────────────────────────────────────────────

console.log("");

if (warnings.length > 0) {
  console.warn("Cohort validation WARNINGS:");
  warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
  console.log("");
}

if (errors.length > 0) {
  console.error("Cohort data safety validation FAILED:");
  errors.forEach((e) => console.error(`  ✖  ${e}`));
  process.exit(1);
} else {
  const cohortCount = seedCohorts.length;
  const gradCount   = seedGraduates.length;
  const c1Count     = seedGraduates.filter((g) => g.cohort_id === "cohort-1").length;
  const c2Count     = seedGraduates.filter((g) => g.cohort_id === "cohort-2").length;
  console.log(
    `✅ Cohort data safety validation PASSED.` +
    ` (${cohortCount} cohort(s): Cohort 1: ${c1Count} grad(s), Cohort 2: ${c2Count} grad(s), total: ${gradCount})`
  );
  if (warnings.length > 0) console.log(`   (${warnings.length} warning(s) noted above — review before production use)`);
  process.exit(0);
}
