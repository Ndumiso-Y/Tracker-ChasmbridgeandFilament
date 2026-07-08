/**
 * cohortService.js
 * Supabase data access layer for the Graduates & Cohort section.
 * v2 — Spreadsheet-aligned fields (Cohort 1 / Cohort 2 structure)
 *
 * PRIVACY RULES:
 * - All graduate/document/activity functions require admin RLS to succeed.
 * - Never call these from public/viewer contexts.
 * - Email and phone fields are stored but must never be surfaced in public views.
 * - No AI scoring, ranking, or automated decision fields exist in this layer.
 *
 * SPREADSHEET FIELDS:
 *   row_number | sex | first_name | surname | year_graduated | nqf_level |
 *   degree | university | competent_b | blasting_certificate | employment |
 *   filament_status | attrition_status
 */

import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────
// COHORTS
// ─────────────────────────────────────────────────────────────

/**
 * Load all cohorts ordered by cohort name.
 */
export async function loadCohorts() {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from("cohorts")
    .select("*")
    .order("cohort_name", { ascending: true });
  return { data: data ?? [], error };
}

/**
 * Insert a new cohort and create an audit note.
 */
export async function insertCohort(cohort, authorId, authorLabel, orgLabel) {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cohorts")
    .insert({ ...cohort, created_at: now, updated_at: now, last_changed_by: authorLabel, last_changed_at: now })
    .select()
    .single();

  if (error) return { data: null, error };

  await supabase.from("graduate_activity_notes").insert({
    cohort_id: data.id,
    note_type: "admin_note",
    note_text: `Cohort record created: "${data.cohort_name}".`,
    changed_by_author_id: authorId,
    changed_by_label: authorLabel,
    changed_by_organisation_label: orgLabel,
  });

  return { data, error: null };
}

/**
 * Update a cohort and create field-level audit notes.
 */
export async function updateCohort(cohortId, updatedFields, oldCohort, authorId, authorLabel, orgLabel) {
  if (!supabase) return { error: new Error("Supabase not configured") };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("cohorts")
    .update({ ...updatedFields, updated_at: now, last_changed_by: authorLabel, last_changed_at: now })
    .eq("id", cohortId);

  if (error) return { error };

  const notesToInsert = [];
  const trackFields = [
    "status", "cohort_name", "target_size", "start_date",
    "end_date", "training_duration_label", "description", "is_public_summary",
  ];

  for (const key of trackFields) {
    if (updatedFields[key] !== undefined) {
      const oldVal = String(oldCohort?.[key] ?? "");
      const newVal = String(updatedFields[key] ?? "");
      if (oldVal !== newVal) {
        notesToInsert.push({
          cohort_id: cohortId,
          note_type: "cohort_update",
          changed_by_author_id: authorId,
          changed_by_label: authorLabel,
          changed_by_organisation_label: orgLabel,
          old_value: oldVal || null,
          new_value: newVal || null,
          field_changed: key,
        });
      }
    }
  }

  if (notesToInsert.length > 0) {
    await supabase.from("graduate_activity_notes").insert(notesToInsert);
  }

  return { error: null };
}

// ─────────────────────────────────────────────────────────────
// GRADUATES
// ─────────────────────────────────────────────────────────────

/**
 * Load graduates, ordered by cohort then row_number.
 * Admin RLS required — returns empty for non-admins.
 * @param {string|null} cohortId - optional filter
 */
export async function loadGraduates(cohortId = null) {
  if (!supabase) return { data: [], error: null };
  let query = supabase
    .from("graduates")
    .select("*")
    .order("cohort_number", { ascending: true })
    .order("row_number", { ascending: true })
    .order("full_name", { ascending: true });
  if (cohortId) query = query.eq("cohort_id", cohortId);
  const { data, error } = await query;
  return { data: data ?? [], error };
}

/**
 * Build a display full_name from first_name + surname.
 * If full_name is already set in the record, return it directly.
 */
export function buildFullName(graduate) {
  if (graduate.full_name) return graduate.full_name;
  const parts = [graduate.first_name, graduate.surname].filter(Boolean);
  return parts.join(" ") || "Unnamed Graduate";
}

/**
 * Insert a new graduate and create an audit note.
 * Automatically maintains full_name from first_name + surname.
 */
export async function insertGraduate(graduate, authorId, authorLabel, orgLabel) {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };

  const now = new Date().toISOString();
  const fullName = graduate.full_name
    || [graduate.first_name, graduate.surname].filter(Boolean).join(" ")
    || "Unnamed Graduate";

  const { data, error } = await supabase
    .from("graduates")
    .insert({
      ...graduate,
      full_name: fullName,
      created_at: now,
      updated_at: now,
      last_changed_by: authorLabel,
      last_changed_at: now,
    })
    .select()
    .single();

  if (error) return { data: null, error };

  await supabase.from("graduate_activity_notes").insert({
    graduate_id: data.id,
    cohort_id: data.cohort_id ?? null,
    note_type: "admin_note",
    note_text: `Graduate record created by ${authorLabel}.`,
    changed_by_author_id: authorId,
    changed_by_label: authorLabel,
    changed_by_organisation_label: orgLabel,
  });

  return { data, error: null };
}

/**
 * Update a graduate and create field-level audit notes.
 * Key status fields get individual notes. Text/admin fields get one summary note.
 */
export async function updateGraduate(graduateId, updatedFields, oldGraduate, authorId, authorLabel, orgLabel) {
  if (!supabase) return { error: new Error("Supabase not configured") };

  const now = new Date().toISOString();

  // Maintain full_name if first_name or surname changed
  const newFirstName = updatedFields.first_name ?? oldGraduate?.first_name ?? "";
  const newSurname = updatedFields.surname ?? oldGraduate?.surname ?? "";
  const derivedFullName = [newFirstName, newSurname].filter(Boolean).join(" ");
  if (derivedFullName) {
    updatedFields.full_name = derivedFullName;
  }

  const { error } = await supabase
    .from("graduates")
    .update({ ...updatedFields, updated_at: now, last_changed_by: authorLabel, last_changed_at: now })
    .eq("id", graduateId);

  if (error) return { error };

  const notesToInsert = [];

  // ── Important status fields — individual audit notes ──
  const keyStatusFields = [
    { key: "competent_b",          label: "Competent B",          type: "graduate_update" },
    { key: "blasting_certificate", label: "Blasting Certificate", type: "graduate_update" },
    { key: "employment",           label: "Employment",           type: "graduate_update" },
    { key: "filament_status",      label: "Filament Status",      type: "graduate_update" },
    { key: "attrition_status",     label: "Lost to Attrition",    type: "graduate_update" },
    // Legacy status fields
    { key: "application_status",   label: "Application Status",   type: "status_change" },
    { key: "training_status",      label: "Training Status",      type: "training_update" },
    { key: "document_status",      label: "Document Status",      type: "document_update" },
    { key: "placement_readiness_status", label: "Placement Readiness", type: "placement_readiness_update" },
  ];

  for (const { key, label, type } of keyStatusFields) {
    if (updatedFields[key] !== undefined) {
      const oldVal = String(oldGraduate?.[key] ?? "");
      const newVal = String(updatedFields[key] ?? "");
      if (oldVal !== newVal) {
        notesToInsert.push({
          graduate_id: graduateId,
          cohort_id: oldGraduate?.cohort_id ?? null,
          note_type: type,
          changed_by_author_id: authorId,
          changed_by_label: authorLabel,
          changed_by_organisation_label: orgLabel,
          old_value: oldVal || null,
          new_value: newVal || null,
          field_changed: label,
        });
      }
    }
  }

  // ── Text / admin fields — single summary note ──
  const textFields = [
    "first_name", "surname", "full_name", "sex",
    "year_graduated", "nqf_level", "degree", "university",
    "row_number", "cohort_number", "notes_summary",
    // Legacy
    "preferred_name", "qualification", "institution", "graduation_year", "location",
  ];

  const changedTextFields = [];
  for (const key of textFields) {
    if (updatedFields[key] !== undefined) {
      const oldVal = String(oldGraduate?.[key] ?? "");
      const newVal = String(updatedFields[key] ?? "");
      if (oldVal !== newVal && key !== "full_name") { // skip derived full_name from summary
        changedTextFields.push(`${key}: "${oldVal || "—"}" → "${newVal || "—"}"`);
      }
    }
  }

  // Contact fields — log that they changed without exposing values
  for (const key of ["email", "phone"]) {
    if (updatedFields[key] !== undefined) {
      const oldVal = oldGraduate?.[key] ?? "";
      const newVal = updatedFields[key] ?? "";
      if (String(oldVal) !== String(newVal)) {
        changedTextFields.push(`${key}: [updated]`);
      }
    }
  }

  if (changedTextFields.length > 0) {
    notesToInsert.push({
      graduate_id: graduateId,
      cohort_id: oldGraduate?.cohort_id ?? null,
      note_type: "admin_note",
      note_text: `Admin fields updated: ${changedTextFields.join("; ")}`,
      changed_by_author_id: authorId,
      changed_by_label: authorLabel,
      changed_by_organisation_label: orgLabel,
      field_changed: "admin_fields",
    });
  }

  if (notesToInsert.length > 0) {
    await supabase.from("graduate_activity_notes").insert(notesToInsert);
  }

  return { error: null };
}

// ─────────────────────────────────────────────────────────────
// GRADUATE DOCUMENTS (checklist — no file upload)
// ─────────────────────────────────────────────────────────────

export async function loadGraduateDocuments(graduateId) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from("graduate_documents")
    .select("*")
    .eq("graduate_id", graduateId)
    .order("document_type");
  return { data: data ?? [], error };
}

export async function upsertDocumentItem(docItem, oldStatus, authorId, authorLabel, orgLabel) {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };

  const now = new Date().toISOString();
  const isNew = !docItem.id;

  const resp = isNew
    ? await supabase.from("graduate_documents").insert({ ...docItem, created_at: now, updated_at: now }).select().single()
    : await supabase.from("graduate_documents").update({ ...docItem, updated_at: now }).eq("id", docItem.id).select().single();

  if (resp.error) return { data: null, error: resp.error };

  await supabase.from("graduate_activity_notes").insert({
    graduate_id: docItem.graduate_id,
    note_type: "document_update",
    note_text: isNew
      ? `Document checklist item added: ${docItem.document_type} — ${docItem.status}.`
      : `Document status updated: ${docItem.document_type}`,
    changed_by_author_id: authorId,
    changed_by_label: authorLabel,
    changed_by_organisation_label: orgLabel,
    old_value: oldStatus ?? null,
    new_value: docItem.status,
    field_changed: "document_status",
  });

  return { data: resp.data, error: null };
}

// ─────────────────────────────────────────────────────────────
// GRADUATE ACTIVITY NOTES
// ─────────────────────────────────────────────────────────────

export async function loadActivityNotes(graduateId = null, cohortId = null) {
  if (!supabase) return { data: [], error: null };

  let query = supabase
    .from("graduate_activity_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (graduateId) query = query.eq("graduate_id", graduateId);
  else if (cohortId) query = query.eq("cohort_id", cohortId);

  const { data, error } = await query;
  return { data: data ?? [], error };
}

export async function insertManualNote({ graduateId, cohortId, noteText, authorId, authorLabel, orgLabel }) {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.from("graduate_activity_notes").insert({
    graduate_id: graduateId ?? null,
    cohort_id: cohortId ?? null,
    note_type: "manual",
    note_text: noteText,
    changed_by_author_id: authorId,
    changed_by_label: authorLabel,
    changed_by_organisation_label: orgLabel,
  });
  return { error };
}
