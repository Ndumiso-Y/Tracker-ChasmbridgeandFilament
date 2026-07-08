/**
 * GraduatesCohort.jsx
 * Graduates & Cohort section — Admin-only view.
 * v2 — Spreadsheet-aligned (Cohort 1 / Cohort 2 structure)
 *
 * PRIVACY & SAFETY RULES:
 * - This entire component must only render for userRole === "admin".
 * - Individual graduate records must never be exposed to public/viewer users.
 * - Email and phone are available in the edit modal only (admin context).
 * - No AI scoring, ranking, automated recommendations, or suitability decisions.
 * - No file upload or document storage is implemented in this pass.
 * - Update author must be selected before any save — all save handlers enforce this.
 *
 * SPREADSHEET COLUMNS (in order):
 *   No | Sex | Name | Surname | Year Graduated | NQF Level | Degree |
 *   University | Competent B | Blasting Certificate | Employment |
 *   Filament Client / Filament | Lost to Attrition
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  GraduationCap, Users, ClipboardList, Plus, Edit2, X,
  ChevronDown, FileText, Activity, BookOpen,
  CheckCircle2, Clock, AlertCircle, ShieldOff, Briefcase,
} from "lucide-react";
import { cx } from "../utils/cx";
import { Badge } from "../components/Badge";
import { SectionHeader } from "../components/SectionHeader";
import {
  loadCohorts, loadGraduates, loadGraduateDocuments, loadActivityNotes,
  insertGraduate, updateGraduate, updateCohort,
  upsertDocumentItem, insertManualNote, buildFullName,
} from "../services/cohortService";
import { validateGraduateWrite } from "../utils/validateGraduate";

// ─────────────────────────────────────────────────────────────
// Controlled vocabulary — spreadsheet-aligned
// ─────────────────────────────────────────────────────────────

const SEX_OPTIONS = ["Mr", "Ms", "MS", "Other / Confirm"];

const COMPETENT_B_OPTIONS      = ["Yes", "No", "Pending", "Not Confirmed"];
const BLASTING_CERT_OPTIONS    = ["Yes", "No", "Pending", "Not Confirmed"];
const EMPLOYMENT_OPTIONS       = ["Yes", "No", "Pending", "Not Confirmed"];

const FILAMENT_STATUS_OPTIONS  = [
  "Filament Client",
  "Filament",
  "Filament Permanent Staff",
  "Not Assigned",
  "Pending Confirmation",
];

const ATTRITION_STATUS_OPTIONS = [
  "Active",
  "Lost to Attrition",
  "Withdrawn",
  "Not Confirmed",
];

const COHORT_STATUSES = [
  "Planning", "Recruiting", "Applications Received", "Shortlisting",
  "Training", "Active", "Completed", "Placement / Project Readiness", "Closed", "Parked",
];

// Legacy statuses (kept for doc checklist and backwards compat)
const DOCUMENT_TYPES        = ["CV", "Certified ID Copy", "Qualification Certificate", "Academic Record", "Proof of Residence", "Other"];
const DOCUMENT_ITEM_STATUSES = ["Pending", "Received", "Missing", "Needs Replacement", "Verified", "Not Required"];

// ─────────────────────────────────────────────────────────────
// Badge colour maps
// ─────────────────────────────────────────────────────────────

const yesNoStyles = {
  "Yes":           "border-emerald-200 bg-emerald-50 text-emerald-700",
  "No":            "border-red-200 bg-red-50 text-red-700",
  "Pending":       "border-amber-200 bg-amber-50 text-amber-700",
  "Not Confirmed": "border-slate-200 bg-slate-50 text-slate-500",
};

const filamentStyles = {
  "Filament Client":          "border-gold/40 bg-gold/10 text-[#795000]",
  "Filament":                 "border-blue-200 bg-blue-50 text-blue-700",
  "Filament Permanent Staff": "border-violet-200 bg-violet-50 text-violet-700",
  "Not Assigned":             "border-slate-200 bg-slate-50 text-slate-500",
  "Pending Confirmation":     "border-amber-200 bg-amber-50 text-amber-700",
};

const attritionStyles = {
  "Active":            "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Lost to Attrition": "border-red-200 bg-red-50 text-red-700",
  "Withdrawn":         "border-zinc-300 bg-zinc-100 text-zinc-600",
  "Not Confirmed":     "border-slate-200 bg-slate-50 text-slate-500",
};

const cohortStatusStyles = {
  "Planning":                     "border-slate-200 bg-slate-50 text-slate-600",
  "Recruiting":                   "border-gold/40 bg-gold/10 text-[#795000]",
  "Applications Received":        "border-blue-200 bg-blue-50 text-blue-700",
  "Shortlisting":                 "border-amber-200 bg-amber-50 text-amber-700",
  "Training":                     "border-violet-200 bg-violet-50 text-violet-700",
  "Active":                       "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Completed":                    "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Placement / Project Readiness":"border-indigo-200 bg-indigo-50 text-indigo-700",
  "Closed":                       "border-zinc-300 bg-zinc-100 text-zinc-600",
  "Parked":                       "border-zinc-300 bg-zinc-100 text-zinc-500",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const NOTE_TYPE_LABELS = {
  manual:                     "Admin Note",
  status_change:              "Status Change",
  training_update:            "Training Update",
  document_update:            "Document Update",
  placement_readiness_update: "Placement Readiness Update",
  cohort_update:              "Cohort Update",
  admin_note:                 "Admin Note",
  graduate_update:            "Graduate Update",
};

function getDisplayName(g) {
  return buildFullName(g);
}

// ─────────────────────────────────────────────────────────────
// Reusable sub-components
// ─────────────────────────────────────────────────────────────

function InlineSelect({ value, options, onChange, disabled = false, className = "" }) {
  return (
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cx(
          "h-9 w-full rounded border border-slate-200 bg-white px-2 pr-7 text-xs font-bold text-slate-800 outline-none ring-gold/30 focus:border-gold focus:ring-2 appearance-none disabled:bg-slate-50 disabled:cursor-not-allowed",
          className
        )}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function FormField({ label, required, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function inputCls(disabled) {
  return cx(
    "w-full h-9 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none ring-gold/30 focus:border-gold focus:ring-2 transition-all",
    disabled && "bg-slate-50 cursor-not-allowed text-slate-400"
  );
}

function AuthorSelector({ selectedAuthorId, authors, onSelectAuthor }) {
  return (
    <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
        Active Editor {!selectedAuthorId && <span className="text-red-500">*</span>}
      </label>
      <select
        value={selectedAuthorId}
        onChange={(e) => onSelectAuthor(e.target.value)}
        className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 font-bold outline-none ring-gold/30 focus:border-gold focus:ring-2"
      >
        <option value="">Select active editor...</option>
        {authors.filter((a) => a.is_active).map((a) => (
          <option key={a.id} value={a.id}>{a.display_name} — {a.organisation_label}</option>
        ))}
      </select>
      {!selectedAuthorId && (
        <p className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          ⚠️ Select an Active Editor to enable saving.
        </p>
      )}
    </div>
  );
}

/** Activity log entry */
function ActivityEntry({ note }) {
  const typeLabel = NOTE_TYPE_LABELS[note.note_type] ?? note.note_type;
  const hasChange = note.old_value || note.new_value;
  return (
    <div className="relative pl-5">
      <div className="timeline-dot" />
      <div className="pb-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gold">{typeLabel}</span>
          {note.field_changed && <span className="text-[10px] text-slate-400 font-semibold">· {note.field_changed}</span>}
        </div>
        <p className="text-xs font-bold text-navy">
          {note.changed_by_label}
          {note.changed_by_organisation_label && (
            <span className="font-normal text-slate-500"> — {note.changed_by_organisation_label}</span>
          )}
        </p>
        {hasChange && (
          <p className="mt-0.5 text-xs text-slate-600">
            <span className="line-through text-red-400">{note.old_value || "—"}</span>
            {" → "}
            <span className="text-emerald-600 font-bold">{note.new_value || "—"}</span>
          </p>
        )}
        {note.note_text && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{note.note_text}</p>}
        <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(note.created_at)}</p>
      </div>
    </div>
  );
}

/** Document checklist panel */
function DocumentChecklist({ graduateId, isAdmin, authorId, authorLabel, orgLabel, onError }) {
  const [docs, setDocs] = useState([]);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!graduateId) return;
    loadGraduateDocuments(graduateId).then(({ data }) => setDocs(data));
  }, [graduateId]);

  const getDoc = (type) => docs.find((d) => d.document_type === type);

  const handleChange = async (docType, newStatus) => {
    if (!authorId) { onError("Please select who is making this update before saving."); return; }
    setSaving(docType);
    const existing = getDoc(docType);
    const item = existing ? { ...existing, status: newStatus } : { graduate_id: graduateId, document_type: docType, status: newStatus };
    const { data, error } = await upsertDocumentItem(item, existing?.status ?? null, authorId, authorLabel, orgLabel);
    if (error) onError(`Document update failed: ${error.message}`);
    else if (data) setDocs((prev) => existing ? prev.map((d) => d.id === data.id ? data : d) : [...prev, data]);
    setSaving(null);
  };

  return (
    <div className="space-y-2">
      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
        Document Checklist <span className="text-slate-400 font-normal">(status tracker — no file upload)</span>
      </h5>
      <div className="space-y-1.5">
        {DOCUMENT_TYPES.map((type) => {
          const doc = getDoc(type);
          const currentStatus = doc?.status ?? "Pending";
          return (
            <div key={type} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-bold text-slate-700 flex-1">{type}</span>
              {isAdmin ? (
                <div className="w-40"><InlineSelect value={currentStatus} options={DOCUMENT_ITEM_STATUSES} onChange={(v) => handleChange(type, v)} disabled={saving === type || !authorId} /></div>
              ) : (
                <Badge className="border-slate-200 bg-slate-50 text-slate-600">{currentStatus}</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Graduate Add / Edit Modal
// ─────────────────────────────────────────────────────────────

function GraduateModal({ graduate, cohorts, isAdmin, onSave, onClose, selectedAuthorId, authors, onSelectAuthor, onError }) {
  const isEditing = !!graduate?.id;

  const [form, setForm] = useState({
    cohort_id:            graduate?.cohort_id ?? (cohorts.find(c => c.id === "cohort-1")?.id ?? cohorts[0]?.id ?? ""),
    cohort_number:        graduate?.cohort_number ?? "",
    row_number:           graduate?.row_number ?? "",
    sex:                  graduate?.sex ?? "Mr",
    first_name:           graduate?.first_name ?? "",
    surname:              graduate?.surname ?? "",
    year_graduated:       graduate?.year_graduated ?? graduate?.graduation_year ?? "",
    nqf_level:            graduate?.nqf_level ?? "",
    degree:               graduate?.degree ?? graduate?.qualification ?? "",
    university:           graduate?.university ?? graduate?.institution ?? "",
    competent_b:          graduate?.competent_b ?? "Not Confirmed",
    blasting_certificate: graduate?.blasting_certificate ?? "Not Confirmed",
    employment:           graduate?.employment ?? "Not Confirmed",
    filament_status:      graduate?.filament_status ?? "Not Assigned",
    attrition_status:     graduate?.attrition_status ?? "Active",
    notes_summary:        graduate?.notes_summary ?? "",
    // Contact — admin coordination only
    email:                graduate?.email ?? "",
    phone:                graduate?.phone ?? "",
  });

  const [activeTab, setActiveTab] = useState("details");
  const [activityNotes, setActivityNotes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditing && activeTab === "activity") {
      loadActivityNotes(graduate.id, null).then(({ data }) => setActivityNotes(data));
    }
  }, [isEditing, activeTab, graduate?.id]);

  const field = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  // Derive cohort_number from selected cohort
  useEffect(() => {
    const c = cohorts.find((c) => c.id === form.cohort_id);
    if (c) {
      const num = c.cohort_name === "Cohort 1" ? 1 : c.cohort_name === "Cohort 2" ? 2 : null;
      if (num) setForm((prev) => ({ ...prev, cohort_number: num }));
    }
  }, [form.cohort_id, cohorts]);

  const handleSave = async () => {
    if (!selectedAuthorId) { onError("Please select who is making this update before saving."); return; }
    if (!form.first_name.trim()) { onError("Name is required."); return; }
    if (!form.surname.trim()) { onError("Surname is required."); return; }
    if (!form.cohort_id) { onError("Cohort is required."); return; }

    // Validate text fields
    for (const val of [form.first_name, form.surname, form.degree, form.university, form.notes_summary]) {
      if (val) { const err = validateGraduateWrite(val); if (err) { onError(err); return; } }
    }

    if (form.row_number && isNaN(Number(form.row_number))) { onError("Row number must be a number."); return; }
    if (form.year_graduated && isNaN(Number(form.year_graduated))) { onError("Year graduated must be a number."); return; }
    if (form.nqf_level && isNaN(Number(form.nqf_level))) { onError("NQF Level must be a number."); return; }

    setSaving(true);
    const author = authors.find((a) => a.id === selectedAuthorId);
    const authorLabel = author ? `${author.display_name} — ${author.organisation_label}` : "Unknown Editor";
    const orgLabel = author?.organisation_label ?? "";

    const payload = {
      ...form,
      cohort_number:  form.cohort_number ? parseInt(form.cohort_number, 10) : null,
      row_number:     form.row_number    ? parseInt(form.row_number, 10)    : null,
      year_graduated: form.year_graduated ? parseInt(form.year_graduated, 10) : null,
      nqf_level:      form.nqf_level     ? parseInt(form.nqf_level, 10)     : null,
    };

    const success = await onSave(payload, selectedAuthorId, authorLabel, orgLabel);
    setSaving(false);
    if (success) onClose();
  };

  const tabs = [
    { id: "details",   label: "Details",        icon: BookOpen },
    ...(isEditing ? [
      { id: "documents", label: "Documents",    icon: FileText },
      { id: "activity",  label: "Activity Log", icon: Activity },
    ] : []),
  ];

  const author   = authors.find((a) => a.id === selectedAuthorId);
  const authorLabel = author ? `${author.display_name} — ${author.organisation_label}` : "";
  const orgLabel    = author?.organisation_label ?? "";
  const disableInputs = !isAdmin || !selectedAuthorId;

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-premium border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col animate-scaleUp z-10">
        {/* Header */}
        <div className="bg-navy px-6 py-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">
              {isEditing ? "Edit Graduate Record" : "Add Graduate"}
            </span>
            <h3 className="text-lg font-black mt-0.5">
              {isEditing ? getDisplayName(graduate) : "New Graduate Record"}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab nav */}
        {isEditing && (
          <div className="flex border-b border-slate-100 bg-slate-50 shrink-0 px-6 pt-2 gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={cx(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t transition-all",
                activeTab === id ? "bg-white text-navy border border-b-white border-slate-200 -mb-px" : "text-slate-500 hover:text-navy"
              )}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* ── DETAILS ── */}
          {activeTab === "details" && (
            <div className="p-6 space-y-5">
              {isAdmin && (
                <AuthorSelector selectedAuthorId={selectedAuthorId} authors={authors} onSelectAuthor={onSelectAuthor} />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left column */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                    Identity &amp; Academic
                  </h4>

                  {/* Cohort + Row No */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Cohort *" required>
                      <div className="relative">
                        <select value={form.cohort_id} onChange={(e) => field("cohort_id")(e.target.value)} disabled={disableInputs}
                          className={cx("appearance-none pr-7", inputCls(disableInputs))}>
                          <option value="">Select cohort...</option>
                          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.cohort_name}</option>)}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                    </FormField>
                    <FormField label="No (Row)">
                      <input type="number" value={form.row_number} onChange={(e) => field("row_number")(e.target.value)}
                        disabled={disableInputs} placeholder="e.g. 1" min="1" className={inputCls(disableInputs)} />
                    </FormField>
                  </div>

                  {/* Sex + Name + Surname */}
                  <FormField label="Sex">
                    <InlineSelect value={form.sex} options={SEX_OPTIONS} onChange={field("sex")} disabled={disableInputs} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Name *" required>
                      <input type="text" value={form.first_name} onChange={(e) => field("first_name")(e.target.value)}
                        disabled={disableInputs} placeholder="First name" className={inputCls(disableInputs)} />
                    </FormField>
                    <FormField label="Surname *" required>
                      <input type="text" value={form.surname} onChange={(e) => field("surname")(e.target.value)}
                        disabled={disableInputs} placeholder="Surname" className={inputCls(disableInputs)} />
                    </FormField>
                  </div>

                  {/* Year + NQF */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Year Graduated">
                      <input type="number" value={form.year_graduated} onChange={(e) => field("year_graduated")(e.target.value)}
                        disabled={disableInputs} placeholder="e.g. 2025" min="1990" max="2035" className={inputCls(disableInputs)} />
                    </FormField>
                    <FormField label="NQF Level">
                      <input type="number" value={form.nqf_level} onChange={(e) => field("nqf_level")(e.target.value)}
                        disabled={disableInputs} placeholder="e.g. 8" min="1" max="10" className={inputCls(disableInputs)} />
                    </FormField>
                  </div>

                  {/* Degree + University */}
                  <FormField label="Degree">
                    <input type="text" value={form.degree} onChange={(e) => field("degree")(e.target.value)}
                      disabled={disableInputs} placeholder="e.g. B.Sc Eng (Mining)" className={inputCls(disableInputs)} />
                  </FormField>
                  <FormField label="University">
                    <input type="text" value={form.university} onChange={(e) => field("university")(e.target.value)}
                      disabled={disableInputs} placeholder="University name" className={inputCls(disableInputs)} />
                  </FormField>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                    Programme Statuses
                  </h4>

                  <FormField label="Competent B">
                    <InlineSelect value={form.competent_b} options={COMPETENT_B_OPTIONS} onChange={field("competent_b")} disabled={disableInputs} />
                  </FormField>
                  <FormField label="Blasting Certificate">
                    <InlineSelect value={form.blasting_certificate} options={BLASTING_CERT_OPTIONS} onChange={field("blasting_certificate")} disabled={disableInputs} />
                  </FormField>
                  <FormField label="Employment">
                    <InlineSelect value={form.employment} options={EMPLOYMENT_OPTIONS} onChange={field("employment")} disabled={disableInputs} />
                  </FormField>
                  <FormField label="Filament Client / Filament">
                    <InlineSelect value={form.filament_status} options={FILAMENT_STATUS_OPTIONS} onChange={field("filament_status")} disabled={disableInputs} />
                  </FormField>
                  <FormField label="Lost to Attrition" hint="Administrative status only. Not a performance judgment.">
                    <InlineSelect value={form.attrition_status} options={ATTRITION_STATUS_OPTIONS} onChange={field("attrition_status")} disabled={disableInputs} />
                  </FormField>

                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 pt-2">
                    Admin Contact (protected)
                  </h4>
                  <FormField label="Email" hint="Admin coordination only — not visible publicly.">
                    <input type="email" value={form.email} onChange={(e) => field("email")(e.target.value)}
                      disabled={disableInputs} placeholder="admin-use only" className={inputCls(disableInputs)} />
                  </FormField>
                  <FormField label="Phone" hint="Admin coordination only — not visible publicly.">
                    <input type="tel" value={form.phone} onChange={(e) => field("phone")(e.target.value)}
                      disabled={disableInputs} placeholder="admin-use only" className={inputCls(disableInputs)} />
                  </FormField>
                </div>
              </div>

              {/* Notes */}
              <FormField label="Admin Notes">
                <textarea value={form.notes_summary} onChange={(e) => field("notes_summary")(e.target.value)}
                  disabled={disableInputs} placeholder="General admin notes for coordination..."
                  rows={3} className={cx("resize-y", inputCls(disableInputs))} />
              </FormField>

              <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-3 leading-relaxed">
                ⚠️ This record is for administrative coordination only. No automated decisions, scoring, or ranking is applied.
                No placement is guaranteed. Email and phone are admin-only and protected by RLS.
              </p>
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {activeTab === "documents" && isEditing && (
            <div className="p-6">
              <DocumentChecklist graduateId={graduate.id} isAdmin={isAdmin}
                authorId={selectedAuthorId} authorLabel={authorLabel} orgLabel={orgLabel} onError={onError} />
            </div>
          )}

          {/* ── ACTIVITY LOG ── */}
          {activeTab === "activity" && isEditing && (
            <div className="p-6">
              <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Activity History</h5>
              {activityNotes.length === 0
                ? <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
                : <div className="timeline">{activityNotes.map((note) => <ActivityEntry key={note.id} note={note} />)}</div>
              }
            </div>
          )}
        </div>

        {/* Footer */}
        {isAdmin && activeTab === "details" && (
          <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-4 shrink-0 bg-slate-50">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all">Cancel</button>
            <button onClick={handleSave} disabled={saving || !selectedAuthorId}
              className={cx("px-6 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
                saving || !selectedAuthorId ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-navy text-white hover:bg-navy/80")}>
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Graduate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cohort Edit Modal
// ─────────────────────────────────────────────────────────────

function CohortModal({ cohort, onSave, onClose, isAdmin, selectedAuthorId, authors, onSelectAuthor, onError }) {
  const [form, setForm] = useState({
    cohort_name:             cohort?.cohort_name ?? "",
    programme_name:          cohort?.programme_name ?? "",
    entity_owner:            cohort?.entity_owner ?? "",
    target_size:             cohort?.target_size ?? "",
    start_date:              cohort?.start_date ?? "",
    end_date:                cohort?.end_date ?? "",
    training_duration_label: cohort?.training_duration_label ?? "",
    status:                  cohort?.status ?? "Planning",
    description:             cohort?.description ?? "",
    is_public_summary:       cohort?.is_public_summary ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [cohortNotes, setCohortNotes] = useState([]);
  const field = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  useEffect(() => {
    if (showActivity && cohort?.id) {
      loadActivityNotes(null, cohort.id).then(({ data }) => setCohortNotes(data));
    }
  }, [showActivity, cohort?.id]);

  const handleSave = async () => {
    if (!selectedAuthorId) { onError("Please select who is making this update before saving."); return; }
    if (!form.cohort_name.trim()) { onError("Cohort name is required."); return; }
    setSaving(true);
    const author = authors.find((a) => a.id === selectedAuthorId);
    const authorLabel = author ? `${author.display_name} — ${author.organisation_label}` : "Unknown Editor";
    const success = await onSave(form, selectedAuthorId, authorLabel, author?.organisation_label ?? "");
    setSaving(false);
    if (success) onClose();
  };

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-premium border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleUp z-10">
        <div className="bg-navy px-6 py-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">Edit Cohort</span>
            <h3 className="text-lg font-black mt-0.5">{cohort?.cohort_name ?? "Cohort"}</h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <AuthorSelector selectedAuthorId={selectedAuthorId} authors={authors} onSelectAuthor={onSelectAuthor} />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FormField label="Cohort Name *" required>
                <input type="text" value={form.cohort_name} onChange={(e) => field("cohort_name")(e.target.value)}
                  disabled={!isAdmin || !selectedAuthorId} className={inputCls(!isAdmin || !selectedAuthorId)} />
              </FormField>
            </div>
            <FormField label="Programme Name">
              <input type="text" value={form.programme_name} onChange={(e) => field("programme_name")(e.target.value)}
                disabled={!isAdmin || !selectedAuthorId} className={inputCls(!isAdmin || !selectedAuthorId)} />
            </FormField>
            <FormField label="Status">
              <InlineSelect value={form.status} options={COHORT_STATUSES} onChange={field("status")} disabled={!isAdmin || !selectedAuthorId} />
            </FormField>
            <FormField label="Target Size">
              <input type="number" value={form.target_size} onChange={(e) => field("target_size")(e.target.value)}
                disabled={!isAdmin || !selectedAuthorId} min="1" className={inputCls(!isAdmin || !selectedAuthorId)} />
            </FormField>
            <FormField label="Training Duration">
              <input type="text" value={form.training_duration_label} onChange={(e) => field("training_duration_label")(e.target.value)}
                disabled={!isAdmin || !selectedAuthorId} placeholder="e.g. 6 weeks" className={inputCls(!isAdmin || !selectedAuthorId)} />
            </FormField>
            <FormField label="Start Date">
              <input type="date" value={form.start_date} onChange={(e) => field("start_date")(e.target.value)}
                disabled={!isAdmin || !selectedAuthorId} className={inputCls(!isAdmin || !selectedAuthorId)} />
            </FormField>
            <FormField label="End Date">
              <input type="date" value={form.end_date} onChange={(e) => field("end_date")(e.target.value)}
                disabled={!isAdmin || !selectedAuthorId} className={inputCls(!isAdmin || !selectedAuthorId)} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Description">
                <textarea value={form.description} onChange={(e) => field("description")(e.target.value)}
                  disabled={!isAdmin || !selectedAuthorId} rows={3}
                  className={cx("resize-y", inputCls(!isAdmin || !selectedAuthorId))} />
              </FormField>
            </div>
          </div>
          <div>
            <button onClick={() => setShowActivity((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy transition-all">
              <Activity size={13} /> {showActivity ? "Hide" : "Show"} Cohort Activity Log
            </button>
            {showActivity && (
              <div className="mt-3 timeline max-h-56 overflow-y-auto custom-scrollbar">
                {cohortNotes.length === 0
                  ? <p className="text-xs text-slate-400 italic">No cohort activity yet.</p>
                  : cohortNotes.map((n) => <ActivityEntry key={n.id} note={n} />)
                }
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving || !selectedAuthorId}
            className={cx("px-6 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
              saving || !selectedAuthorId ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-navy text-white hover:bg-navy/80")}>
            {saving ? "Saving…" : "Save Cohort"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Metric card
// ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, colourClass }) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      <div className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", colourClass)}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-2xl font-black text-navy leading-none">{value}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compact yes/no badge for table cells
// ─────────────────────────────────────────────────────────────

function YesNoBadge({ value }) {
  const cls = yesNoStyles[value] ?? "border-slate-200 bg-slate-50 text-slate-500";
  return <Badge className={cls}>{value ?? "—"}</Badge>;
}

// ─────────────────────────────────────────────────────────────
// Main GraduatesCohort view
// ─────────────────────────────────────────────────────────────

export default function GraduatesCohort({
  userRole = null,
  selectedAuthorId = "",
  authors = [],
  onSelectAuthor = null,
}) {
  const isAdmin = userRole === "admin";

  const [cohorts, setCohorts] = useState([]);
  const [graduates, setGraduates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // "all" | cohort.id
  const [activeCohortFilter, setActiveCohortFilter] = useState("all");
  const [graduateModal, setGraduateModal] = useState(null);
  const [cohortModal, setCohortModal] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }, []);

  // ── Load data ──
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      const [{ data: cohortsData }, { data: gradsData }] = await Promise.all([
        loadCohorts(),
        loadGraduates(),
      ]);
      setCohorts((cohortsData ?? []).filter((c) => c.is_active !== false));
      setGraduates(gradsData ?? []);
      setLoading(false);
    }
    load();
  }, [isAdmin]);

  // ── Active cohort object ──
  const activeCohort = useMemo(
    () => cohorts.find((c) => c.id === activeCohortFilter) ?? null,
    [cohorts, activeCohortFilter]
  );

  // ── Filtered graduates ──
  const displayGraduates = useMemo(
    () => activeCohortFilter === "all"
      ? graduates
      : graduates.filter((g) => g.cohort_id === activeCohortFilter),
    [graduates, activeCohortFilter]
  );

  // ── Metrics ──
  const metrics = useMemo(() => ({
    total:             displayGraduates.length,
    employed:          displayGraduates.filter((g) => g.employment === "Yes").length,
    competentB:        displayGraduates.filter((g) => g.competent_b === "Yes").length,
    blasting:          displayGraduates.filter((g) => g.blasting_certificate === "Yes").length,
    filamentClient:    displayGraduates.filter((g) => g.filament_status === "Filament Client").length,
    filament:          displayGraduates.filter((g) => g.filament_status === "Filament").length,
    filamentPermanent: displayGraduates.filter((g) => g.filament_status === "Filament Permanent Staff").length,
    attrition:         displayGraduates.filter((g) => g.attrition_status === "Lost to Attrition").length,
  }), [displayGraduates]);

  // ── Graduate save ──
  const handleGraduateSave = async (payload, authorId, authorLabel, orgLabel) => {
    try {
      const existing = graduateModal?.graduate;
      if (existing?.id) {
        const { error } = await updateGraduate(existing.id, payload, existing, authorId, authorLabel, orgLabel);
        if (error) throw error;
        const fullName = [payload.first_name, payload.surname].filter(Boolean).join(" ") || payload.full_name;
        setGraduates((prev) => prev.map((g) => g.id === existing.id
          ? { ...g, ...payload, full_name: fullName, updated_at: new Date().toISOString() }
          : g
        ));
      } else {
        const newId = `graduate-${Date.now()}`;
        const { data, error } = await insertGraduate({ id: newId, ...payload }, authorId, authorLabel, orgLabel);
        if (error) throw error;
        if (data) setGraduates((prev) => [...prev, data]);
      }
      return true;
    } catch (err) {
      showToast(`Save failed: ${err.message}`);
      return false;
    }
  };

  // ── Cohort save ──
  const handleCohortSave = async (payload, authorId, authorLabel, orgLabel) => {
    if (!activeCohort) return false;
    try {
      const { error } = await updateCohort(activeCohort.id, payload, activeCohort, authorId, authorLabel, orgLabel);
      if (error) throw error;
      setCohorts((prev) => prev.map((c) => c.id === activeCohort.id ? { ...c, ...payload } : c));
      return true;
    } catch (err) {
      showToast(`Cohort save failed: ${err.message}`);
      return false;
    }
  };

  // ── Access guard ──
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
          <ShieldOff size={28} className="text-slate-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-navy">Admin Access Required</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-sm">
            The Graduates &amp; Cohort section contains sensitive administrative data
            and is only accessible to authorised administrators.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────
  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 rounded-md border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700 shadow-premium max-w-sm lg:top-4 animate-pulse">
          {toast}
        </div>
      )}

      {/* Modals */}
      {graduateModal !== null && (
        <GraduateModal
          graduate={graduateModal.graduate}
          cohorts={cohorts}
          isAdmin={isAdmin}
          onSave={handleGraduateSave}
          onClose={() => setGraduateModal(null)}
          selectedAuthorId={selectedAuthorId}
          authors={authors}
          onSelectAuthor={onSelectAuthor}
          onError={showToast}
        />
      )}
      {cohortModal !== null && (
        <CohortModal
          cohort={cohortModal.cohort}
          isAdmin={isAdmin}
          onSave={handleCohortSave}
          onClose={() => setCohortModal(null)}
          selectedAuthorId={selectedAuthorId}
          authors={authors}
          onSelectAuthor={onSelectAuthor}
          onError={showToast}
        />
      )}

      {/* Page header */}
      <SectionHeader
        eyebrow="Programme Coordination"
        title="Graduates &amp; Cohort"
        copy="Administrative records for cohort management and graduate programme coordination. Admin-only. No placement guarantee is implied. No automated decisions are made."
      />

      {/* ── Cohort tab filter + actions ── */}
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Cohort tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setActiveCohortFilter("all")}
            className={cx(
              "px-3 py-1.5 rounded text-xs font-bold transition-all border",
              activeCohortFilter === "all"
                ? "bg-navy text-white border-navy"
                : "text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            All Cohorts
            <span className="ml-1.5 text-[10px] opacity-70">({graduates.length})</span>
          </button>

          {cohorts.map((c) => {
            const count = graduates.filter((g) => g.cohort_id === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCohortFilter(c.id)}
                className={cx(
                  "px-3 py-1.5 rounded text-xs font-bold transition-all border",
                  activeCohortFilter === c.id
                    ? "bg-navy text-white border-navy"
                    : "text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                {c.cohort_name}
                <span className="ml-1.5 text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}

          {activeCohort && (
            <>
              <Badge className={cohortStatusStyles[activeCohort.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}>
                {activeCohort.status}
              </Badge>
              <button onClick={() => setCohortModal({ cohort: activeCohort })}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider border border-slate-200 rounded hover:bg-slate-50 transition-all text-slate-600">
                <Edit2 size={10} /> Edit Cohort
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setGraduateModal({ graduate: null })}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider bg-navy text-white rounded-lg hover:bg-navy/80 transition-all"
        >
          <Plus size={14} /> Add Graduate
        </button>
      </div>

      {/* ── Cohort detail (if a specific cohort selected) ── */}
      {activeCohort && (
        <div className="mt-4 panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{activeCohort.entity_owner ?? "Programme"}</p>
              <h2 className="mt-1 text-xl font-black text-navy">{activeCohort.cohort_name}</h2>
              {activeCohort.programme_name && (
                <p className="mt-0.5 text-sm text-slate-500 font-semibold">{activeCohort.programme_name}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-right">
              {activeCohort.target_size && (
                <div>
                  <p className="text-2xl font-black text-navy">{activeCohort.target_size}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Target Size</p>
                </div>
              )}
              {activeCohort.training_duration_label && (
                <div>
                  <p className="text-2xl font-black text-navy">{activeCohort.training_duration_label}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Training</p>
                </div>
              )}
            </div>
          </div>
          {activeCohort.description && (
            <p className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
              {activeCohort.description}
            </p>
          )}
        </div>
      )}

      {/* ── Summary metrics ── */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <MetricCard label="Total"            value={metrics.total}             icon={Users}        colourClass="bg-navy/10 text-navy" />
        <MetricCard label="Employed"         value={metrics.employed}          icon={Briefcase}    colourClass="bg-emerald-50 text-emerald-600" />
        <MetricCard label="Competent B"      value={metrics.competentB}        icon={CheckCircle2} colourClass="bg-blue-50 text-blue-600" />
        <MetricCard label="Blasting Cert"    value={metrics.blasting}          icon={CheckCircle2} colourClass="bg-violet-50 text-violet-600" />
        <MetricCard label="Filament Client"  value={metrics.filamentClient}    icon={GraduationCap} colourClass="bg-gold/10 text-[#795000]" />
        <MetricCard label="Filament"         value={metrics.filament}          icon={GraduationCap} colourClass="bg-blue-50 text-blue-700" />
        <MetricCard label="Perm Staff"       value={metrics.filamentPermanent} icon={GraduationCap} colourClass="bg-violet-50 text-violet-700" />
        <MetricCard label="Lost to Attrition" value={metrics.attrition}        icon={AlertCircle}  colourClass="bg-red-50 text-red-500" />
      </div>

      {/* ── Graduate table ── */}
      <div className="mt-4 panel overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-black text-navy flex items-center gap-2">
            <GraduationCap size={16} className="text-gold" />
            Graduate Records
            <span className="text-slate-400 font-normal text-xs">
              ({displayGraduates.length}{activeCohortFilter !== "all" ? ` in ${activeCohort?.cohort_name}` : ""})
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-xs text-slate-400">Loading graduate records…</div>
        ) : displayGraduates.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <GraduationCap size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">No graduate records found.</p>
            <button onClick={() => setGraduateModal({ graduate: null })}
              className="mt-3 text-xs font-bold text-navy border border-navy/20 px-3 py-1.5 rounded hover:bg-navy hover:text-white transition-all">
              Add First Graduate
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table — horizontally scrollable to match spreadsheet width */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-max w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {/* Mirror spreadsheet column order exactly */}
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-10">No</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-12">Sex</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500">Name</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500">Surname</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-20">Year Grad.</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-16">NQF</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500">Degree</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500">University</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-24">Competent B</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-24">Blasting</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-20">Employed</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-32">Filament</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 w-28">Attrition</th>
                    <th className="px-3 py-3 font-black text-[10px] uppercase tracking-wider text-slate-500 text-right w-16">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayGraduates.map((g, idx) => {
                    const isAttrition = g.attrition_status === "Lost to Attrition";
                    return (
                      <tr key={g.id} className={cx("hover:bg-slate-50 transition-colors", isAttrition && "opacity-60")}>
                        <td className="px-3 py-2.5 text-slate-500 text-[10px] font-semibold">{g.row_number ?? idx + 1}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-semibold">{g.sex ?? "—"}</td>
                        <td className="px-3 py-2.5 font-bold text-navy">{g.first_name || "—"}</td>
                        <td className="px-3 py-2.5 font-bold text-navy">{g.surname || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{g.year_graduated ?? g.graduation_year ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{g.nqf_level ? `NQF ${g.nqf_level}` : "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate" title={g.degree ?? g.qualification ?? ""}>{g.degree ?? g.qualification ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[120px] truncate" title={g.university ?? g.institution ?? ""}>{g.university ?? g.institution ?? "—"}</td>
                        <td className="px-3 py-2.5"><YesNoBadge value={g.competent_b} /></td>
                        <td className="px-3 py-2.5"><YesNoBadge value={g.blasting_certificate} /></td>
                        <td className="px-3 py-2.5"><YesNoBadge value={g.employment} /></td>
                        <td className="px-3 py-2.5">
                          {g.filament_status && g.filament_status !== "Not Assigned"
                            ? <Badge className={filamentStyles[g.filament_status] ?? "border-slate-200 bg-slate-50 text-slate-500"}>{g.filament_status}</Badge>
                            : <span className="text-slate-400 text-[10px]">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          {isAttrition
                            ? <Badge className={attritionStyles["Lost to Attrition"]}>Lost</Badge>
                            : <span className="text-slate-400 text-[10px]">Active</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setGraduateModal({ graduate: g })}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border border-slate-200 rounded hover:bg-navy hover:text-white hover:border-navy transition-all">
                            <Edit2 size={9} /> Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {displayGraduates.map((g) => (
                <div key={g.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-navy text-sm">{getDisplayName(g)}</p>
                      {g.degree && <p className="text-xs text-slate-500">{g.degree}</p>}
                      {g.university && <p className="text-xs text-slate-400">{g.university}</p>}
                      {g.year_graduated && <p className="text-[10px] text-slate-400">{g.year_graduated}{g.nqf_level ? ` · NQF ${g.nqf_level}` : ""}</p>}
                    </div>
                    <button onClick={() => setGraduateModal({ graduate: g })}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider border border-slate-200 rounded hover:bg-navy hover:text-white hover:border-navy transition-all">
                      <Edit2 size={10} /> Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <YesNoBadge value={g.competent_b} />
                    <YesNoBadge value={g.blasting_certificate} />
                    <YesNoBadge value={g.employment} />
                    {g.filament_status && g.filament_status !== "Not Assigned" && (
                      <Badge className={filamentStyles[g.filament_status] ?? "border-slate-200 bg-slate-50 text-slate-500"}>{g.filament_status}</Badge>
                    )}
                    {g.attrition_status === "Lost to Attrition" && (
                      <Badge className={attritionStyles["Lost to Attrition"]}>Lost to Attrition</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Privacy notice ── */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 flex items-start gap-2">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <span>
          <strong>Admin-only data:</strong> Graduate records are protected by RLS and are not visible to public or viewer users.
          No placement is guaranteed. No automated decisions or scoring are used.
          Do not store ID numbers, medical details, or private documents in this tracker.
        </span>
      </div>

      {/* ── CSV / file upload notice ── */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
        <ClipboardList size={13} className="shrink-0 mt-0.5 text-slate-400" />
        <span>
          <strong>CSV import</strong> and <strong>file uploads</strong> are planned for future iterations and are not included in this pass.
          Records can be added individually using the &quot;Add Graduate&quot; button above.
        </span>
      </div>
    </>
  );
}
