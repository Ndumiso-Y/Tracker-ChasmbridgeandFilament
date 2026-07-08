-- cohort_schema.sql
-- Graduates & Cohort — Database Schema (v2 — Spreadsheet-aligned)
-- Run this in your Supabase SQL Editor AFTER schema.sql.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS,
-- and CREATE OR REPLACE patterns throughout.
--
-- PRIVACY NOTE:
-- graduates, graduate_documents, and graduate_activity_notes are admin-only.
-- Do NOT expose individual graduate records to public or unauthenticated users.
-- cohorts supports an is_public_summary flag but the frontend hides all
-- personal data regardless. No AI scoring or ranking is used anywhere.
--
-- SPREADSHEET ALIGNMENT (v2):
-- The graduates table now mirrors the real cohort spreadsheet columns:
--   No | Sex | Name | Surname | Year Graduated | NQF Level | Degree |
--   University | Competent B | Blasting Certificate | Employment |
--   Filament Client / Filament | Lost to Attrition

-- ─────────────────────────────────────────────
-- Enable uuid-ossp (safe to re-run)
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Helper: is_admin()
-- Uses user_roles table already created in schema.sql
-- CREATE OR REPLACE is safe to re-run
-- ─────────────────────────────────────────────
create or replace function is_admin()
returns boolean security definer as $$
begin
  return exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────
-- 1. TABLE: cohorts
-- ─────────────────────────────────────────────
create table if not exists cohorts (
  id                       text primary key,
  cohort_name              text not null,
  programme_name           text,
  entity_owner             text,
  target_size              integer,
  start_date               date,
  end_date                 date,
  training_duration_label  text,
  status                   text not null default 'Planning'
    check (status in (
      'Planning',
      'Recruiting',
      'Applications Received',
      'Shortlisting',
      'Training',
      'Active',
      'Completed',
      'Placement / Project Readiness',
      'Closed',
      'Parked'
    )),
  description              text,
  is_active                boolean default true,
  is_public_summary        boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  last_changed_by          text,
  last_changed_at          timestamptz
);

-- ─────────────────────────────────────────────
-- 2. TABLE: graduates
-- Stores individual graduate records aligned to the real cohort spreadsheet.
-- ADMIN-ONLY. Personal data must never be public.
-- No AI scoring, ranking, or automated decision fields.
-- ─────────────────────────────────────────────
create table if not exists graduates (
  id                           text primary key,
  cohort_id                    text references cohorts(id) on delete set null,
  -- Spreadsheet: No
  cohort_number                integer,
  row_number                   integer,
  -- Spreadsheet: Sex
  sex                          text
    check (sex in ('Mr', 'Ms', 'MS', 'Other / Confirm') or sex is null),
  -- Spreadsheet: Name / Surname
  first_name                   text,
  surname                      text,
  -- Derived display name — maintained by application layer
  full_name                    text,
  -- Legacy fields kept for future admin coordination use
  preferred_name               text,
  email                        text,
  phone                        text,
  -- Spreadsheet: Year Graduated
  year_graduated               integer,
  -- Legacy alias kept for backwards-compat; use year_graduated
  graduation_year              integer,
  -- Spreadsheet: NQF Level
  nqf_level                    integer,
  -- Spreadsheet: Degree
  degree                       text,
  -- Legacy alias kept for backwards-compat; use degree
  qualification                text,
  -- Spreadsheet: University
  university                   text,
  -- Legacy alias kept for backwards-compat; use university
  institution                  text,
  -- Spreadsheet: Competent B
  competent_b                  text default 'Not Confirmed'
    check (competent_b in ('Yes', 'No', 'Pending', 'Not Confirmed') or competent_b is null),
  -- Spreadsheet: Blasting Certificate
  blasting_certificate         text default 'Not Confirmed'
    check (blasting_certificate in ('Yes', 'No', 'Pending', 'Not Confirmed') or blasting_certificate is null),
  -- Spreadsheet: Employment
  employment                   text default 'Not Confirmed'
    check (employment in ('Yes', 'No', 'Pending', 'Not Confirmed') or employment is null),
  -- Spreadsheet: Filament Client / Filament
  filament_status              text default 'Not Assigned'
    check (filament_status in (
      'Filament Client',
      'Filament',
      'Filament Permanent Staff',
      'Not Assigned',
      'Pending Confirmation'
    ) or filament_status is null),
  -- Spreadsheet: Lost to Attrition — administrative status only
  attrition_status             text default 'Active'
    check (attrition_status in (
      'Active',
      'Lost to Attrition',
      'Withdrawn',
      'Not Confirmed'
    ) or attrition_status is null),
  -- Legacy programme admin statuses — retained for backwards compatibility
  location                     text,
  application_status           text default 'Record Created'
    check (application_status in (
      'Record Created',
      'Application Received',
      'Missing Information',
      'Admin Review',
      'Invited to Training',
      'Not Proceeding',
      'Withdrawn',
      'Archived'
    ) or application_status is null),
  training_status              text default 'Not Started'
    check (training_status in (
      'Not Started',
      'In Training',
      'Attendance Concern',
      'Completed',
      'Not Completed',
      'Withdrawn'
    ) or training_status is null),
  document_status              text default 'Not Checked'
    check (document_status in (
      'Not Checked',
      'Missing Documents',
      'Partially Received',
      'Complete',
      'Needs Verification'
    ) or document_status is null),
  placement_readiness_status   text default 'Not Assessed'
    check (placement_readiness_status in (
      'Not Assessed',
      'Admin Pending',
      'Ready for Discussion',
      'In Discussion',
      'Placed on Project',
      'Not Currently Placed'
    ) or placement_readiness_status is null),
  notes_summary                text,
  is_active                    boolean default true,
  created_at                   timestamptz default now(),
  updated_at                   timestamptz default now(),
  last_changed_by              text,
  last_changed_at              timestamptz
);

-- ─────────────────────────────────────────────
-- ALTER TABLE: add new columns if they do not exist
-- (safe to run on an existing graduates table)
-- ─────────────────────────────────────────────
do $$
begin
  -- cohort_number
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'cohort_number'
  ) then
    alter table graduates add column cohort_number integer;
  end if;

  -- row_number
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'row_number'
  ) then
    alter table graduates add column row_number integer;
  end if;

  -- sex
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'sex'
  ) then
    alter table graduates add column sex text;
  end if;

  -- first_name
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'first_name'
  ) then
    alter table graduates add column first_name text;
  end if;

  -- surname
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'surname'
  ) then
    alter table graduates add column surname text;
  end if;

  -- year_graduated
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'year_graduated'
  ) then
    alter table graduates add column year_graduated integer;
  end if;

  -- nqf_level
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'nqf_level'
  ) then
    alter table graduates add column nqf_level integer;
  end if;

  -- degree
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'degree'
  ) then
    alter table graduates add column degree text;
  end if;

  -- university
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'university'
  ) then
    alter table graduates add column university text;
  end if;

  -- competent_b
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'competent_b'
  ) then
    alter table graduates add column competent_b text default 'Not Confirmed';
  end if;

  -- blasting_certificate
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'blasting_certificate'
  ) then
    alter table graduates add column blasting_certificate text default 'Not Confirmed';
  end if;

  -- employment
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'employment'
  ) then
    alter table graduates add column employment text default 'Not Confirmed';
  end if;

  -- filament_status
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'filament_status'
  ) then
    alter table graduates add column filament_status text default 'Not Assigned';
  end if;

  -- attrition_status
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'graduates' and column_name = 'attrition_status'
  ) then
    alter table graduates add column attrition_status text default 'Active';
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 3. TABLE: graduate_documents
-- ─────────────────────────────────────────────
create table if not exists graduate_documents (
  id             uuid primary key default gen_random_uuid(),
  graduate_id    text not null references graduates(id) on delete cascade,
  document_type  text not null
    check (document_type in (
      'CV',
      'Certified ID Copy',
      'Qualification Certificate',
      'Academic Record',
      'Proof of Residence',
      'Other'
    )),
  status         text not null default 'Pending'
    check (status in (
      'Pending',
      'Received',
      'Missing',
      'Needs Replacement',
      'Verified',
      'Not Required'
    )),
  received_date  date,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 4. TABLE: graduate_activity_notes
-- ─────────────────────────────────────────────
create table if not exists graduate_activity_notes (
  id                            uuid primary key default gen_random_uuid(),
  graduate_id                   text references graduates(id) on delete cascade,
  cohort_id                     text references cohorts(id) on delete cascade,
  note_type                     text not null default 'manual'
    check (note_type in (
      'manual',
      'status_change',
      'training_update',
      'document_update',
      'placement_readiness_update',
      'cohort_update',
      'admin_note',
      'graduate_update'
    )),
  note_text                     text,
  changed_by_author_id          text references update_authors(id),
  changed_by_label              text not null,
  changed_by_organisation_label text,
  old_value                     text,
  new_value                     text,
  field_changed                 text,
  created_at                    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index if not exists idx_graduates_cohort_id         on graduates(cohort_id);
create index if not exists idx_graduates_cohort_row        on graduates(cohort_id, row_number);
create index if not exists idx_grad_docs_graduate_id       on graduate_documents(graduate_id);
create index if not exists idx_grad_notes_graduate_id      on graduate_activity_notes(graduate_id);
create index if not exists idx_grad_notes_cohort_id        on graduate_activity_notes(cohort_id);
create index if not exists idx_grad_notes_created_at       on graduate_activity_notes(created_at desc);

-- ─────────────────────────────────────────────
-- Enable RLS
-- ─────────────────────────────────────────────
alter table cohorts                 enable row level security;
alter table graduates               enable row level security;
alter table graduate_documents      enable row level security;
alter table graduate_activity_notes enable row level security;

-- ─────────────────────────────────────────────
-- RLS POLICIES
-- Drop existing policies first (safe re-run pattern)
-- ─────────────────────────────────────────────
drop policy if exists "cohorts_admin_all"               on cohorts;
drop policy if exists "cohorts_public_summary_select"   on cohorts;
drop policy if exists "graduates_admin_all"             on graduates;
drop policy if exists "graduate_documents_admin_all"    on graduate_documents;
drop policy if exists "graduate_activity_notes_admin_all" on graduate_activity_notes;

-- cohorts — admin full access
create policy "cohorts_admin_all"
  on cohorts for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- cohorts — anon SELECT only where is_public_summary = true
-- (frontend does NOT expose public cohort data in this pass)
create policy "cohorts_public_summary_select"
  on cohorts for select
  to anon
  using (is_public_summary = true);

-- graduates — admin only
create policy "graduates_admin_all"
  on graduates for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- graduate_documents — admin only
create policy "graduate_documents_admin_all"
  on graduate_documents for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- graduate_activity_notes — admin only
create policy "graduate_activity_notes_admin_all"
  on graduate_activity_notes for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ─────────────────────────────────────────────
-- SEED DATA — SAFE PLACEHOLDER RECORDS ONLY
-- No real graduate names, emails, ID numbers, or personal data.
-- Seed two cohorts + 5 placeholder graduates across both cohorts.
-- ─────────────────────────────────────────────

-- Cohort 1
insert into cohorts (
  id, cohort_name, programme_name, entity_owner,
  status, description, is_active, is_public_summary
)
values (
  'cohort-1',
  'Cohort 1',
  'Chasm Bridge / Filament Graduate Cohort',
  'Chasm Bridge Charity / Filament (Pty) Ltd',
  'Completed',
  'First graduate cohort. Administrative tracker only. No placement is guaranteed. Filament project assignment may occur after training completion.',
  true,
  false
)
on conflict (id) do update set
  cohort_name    = excluded.cohort_name,
  programme_name = excluded.programme_name,
  entity_owner   = excluded.entity_owner,
  description    = excluded.description,
  is_active      = excluded.is_active;

-- Cohort 2
insert into cohorts (
  id, cohort_name, programme_name, entity_owner,
  status, description, is_active, is_public_summary
)
values (
  'cohort-2',
  'Cohort 2',
  'Chasm Bridge / Filament Graduate Cohort',
  'Chasm Bridge Charity / Filament (Pty) Ltd',
  'Active',
  'Second graduate cohort. Administrative tracker only. No placement is guaranteed.',
  true,
  false
)
on conflict (id) do update set
  cohort_name    = excluded.cohort_name,
  programme_name = excluded.programme_name,
  entity_owner   = excluded.entity_owner,
  description    = excluded.description,
  is_active      = excluded.is_active;

-- Also keep the original seed cohort for backwards compat (no-op if already exists)
insert into cohorts (
  id, cohort_name, programme_name, entity_owner,
  status, is_active, is_public_summary
)
values (
  'chasm-filament-cohort-001',
  'Cohort 001 (Legacy)',
  'Chasm Bridge / Filament Graduate Cohort',
  'Chasm Bridge Charity / Filament (Pty) Ltd',
  'Planning',
  false,
  false
)
on conflict (id) do nothing;

-- Placeholder graduates — Cohort 1
insert into graduates (
  id, cohort_id, cohort_number, row_number,
  sex, first_name, surname, full_name,
  year_graduated, nqf_level, degree, university,
  competent_b, blasting_certificate, employment,
  filament_status, attrition_status, is_active
)
values
  (
    'graduate-001', 'cohort-1', 1, 1,
    'Mr', 'Graduate', '001', 'Graduate 001',
    2025, 8, 'B.Sc Eng (Mining)', 'Wits',
    'Yes', 'No', 'Yes',
    'Filament Client', 'Active', true
  ),
  (
    'graduate-002', 'cohort-1', 1, 2,
    'Ms', 'Graduate', '002', 'Graduate 002',
    2024, 8, 'B.Tech Engineering Mining', 'UKZN',
    'Yes', 'Yes', 'Yes',
    'Filament', 'Active', true
  ),
  (
    'graduate-003', 'cohort-1', 1, 3,
    'Mr', 'Graduate', '003', 'Graduate 003',
    2023, 7, 'B.Eng Mining', 'UP',
    'No', 'No', 'No',
    'Not Assigned', 'Lost to Attrition', true
  )
on conflict (id) do update set
  cohort_id       = excluded.cohort_id,
  cohort_number   = excluded.cohort_number,
  row_number      = excluded.row_number,
  sex             = excluded.sex,
  first_name      = excluded.first_name,
  surname         = excluded.surname,
  full_name       = excluded.full_name,
  year_graduated  = excluded.year_graduated,
  nqf_level       = excluded.nqf_level,
  degree          = excluded.degree,
  university      = excluded.university,
  competent_b     = excluded.competent_b,
  blasting_certificate = excluded.blasting_certificate,
  employment      = excluded.employment,
  filament_status = excluded.filament_status,
  attrition_status = excluded.attrition_status;

-- Placeholder graduates — Cohort 2
insert into graduates (
  id, cohort_id, cohort_number, row_number,
  sex, first_name, surname, full_name,
  year_graduated, nqf_level, degree, university,
  competent_b, blasting_certificate, employment,
  filament_status, attrition_status, is_active
)
values
  (
    'graduate-004', 'cohort-2', 2, 1,
    'Mr', 'Graduate', '004', 'Graduate 004',
    2025, 8, 'B.Sc Eng (Mining)', 'UCT',
    'Pending', 'Pending', 'Pending',
    'Not Assigned', 'Active', true
  ),
  (
    'graduate-005', 'cohort-2', 2, 2,
    'Ms', 'Graduate', '005', 'Graduate 005',
    2025, 8, 'B.Tech Engineering Mining', 'TUT',
    'Not Confirmed', 'Not Confirmed', 'Not Confirmed',
    'Not Assigned', 'Active', true
  )
on conflict (id) do update set
  cohort_id       = excluded.cohort_id,
  cohort_number   = excluded.cohort_number,
  row_number      = excluded.row_number,
  sex             = excluded.sex,
  first_name      = excluded.first_name,
  surname         = excluded.surname,
  full_name       = excluded.full_name,
  year_graduated  = excluded.year_graduated,
  nqf_level       = excluded.nqf_level,
  degree          = excluded.degree,
  university      = excluded.university,
  competent_b     = excluded.competent_b,
  blasting_certificate = excluded.blasting_certificate,
  employment      = excluded.employment,
  filament_status = excluded.filament_status,
  attrition_status = excluded.attrition_status;

-- Seed initial cohort activity notes
insert into graduate_activity_notes (
  cohort_id, note_type, note_text, changed_by_label, changed_by_organisation_label
)
values
  (
    'cohort-1',
    'admin_note',
    'Cohort 1 record initialised. Administrative tracker for the first graduate cohort.',
    'Ndumiso / Embark Digitals',
    'Embark Digitals'
  ),
  (
    'cohort-2',
    'admin_note',
    'Cohort 2 record initialised. Administrative tracker for the second graduate cohort.',
    'Ndumiso / Embark Digitals',
    'Embark Digitals'
  );
