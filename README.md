# Chasm Bridge Charity & Filament Tracker

Project command center for the Embark Digitals Phase 1 Digital Foundation & Launch Setup.

## Run locally

```bash
npm install
npm run dev
```

The app uses Vite, React 19, Tailwind CSS, and `HashRouter` so static hosting does not break page navigation.

## Build

```bash
npm run build
npm run preview
```

---

## Supabase Setup (Postgres, Auth, RLS, & Realtime)

The command center uses Supabase as a persistent, collaborative backend.

### 1. Create a Supabase Project
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Note your **Project API URL** and **Anon public API key** (found in Project Settings -> API).

### 2. Configure Database Schema & Seed Data
1. Open the **SQL Editor** in the Supabase Dashboard.
2. Create a new query, paste the contents of [supabase/schema.sql](file:///d:/Digital%20Agency/Filiament/Tracker/supabase/schema.sql), and run it. This will create the tables, enable RLS, set up policies, and seed the update authors.
3. Create a second query, paste the contents of [supabase/seed.sql](file:///d:/Digital%20Agency/Filiament/Tracker/supabase/seed.sql), and run it to populate the tracker items (Tasks, Deliverables, Client Assets, Launch Checklist).

### 3. Setup Environment Variables
1. In the project root, copy `.env.example` to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your actual Supabase URL and Anon key.
3. Configure these exact env variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) in your deployment environment (Vercel, GitHub Actions, etc.).
4. **IMPORTANT**: Only the anon key is used in the client. The service_role key must never be used in the client or committed to the repository.

---

## Access Control & Roles

The system operates under a two-role security architecture:
1. **admin**: Can read all tables, and update tracker items and add notes via the Edit Modal.
2. **viewer / public**: Can read all public data, but cannot write or modify anything.

Logged-out users view the dashboard in standard, static, read-only mode (identical to the original release).

### Creating the First Admin User
1. Go to your Supabase Dashboard, click **Authentication** (in the sidebar), and select **Users**.
2. Click **Add User** -> **Create User** and enter their email address and password.
3. Once the user is created, copy their **User UID** (a string of letters, numbers, and dashes).
4. Go to the **SQL Editor** and run the following command to grant them the `admin` role:
   ```sql
   insert into user_roles (user_id, role, email) 
   values ('<user-uuid-copied-from-dashboard>', 'admin', 'admin@embarkdigitals.co.za');
   ```

---

## Testing Modes

### How to Test Viewer Mode
1. Open the application in an incognito window or log out.
2. Confirm you can view all tasks, deliverables, client assets, and launch checklist items.
3. Confirm that **no edit buttons**, **dropdown selects**, **date inputs**, or **note input fields** are visible anywhere in the UI.

### How to Test Admin Edit Mode
1. Click **Admin Sign In** in the sidebar footer and log in with your admin credentials.
2. Open the edit controls by clicking the dashed status badges or the edit pencil icon next to any item.
3. Try to change a status or add a manual note without selecting a person in the **Changed By** dropdown.
4. Verify that clicking **Save Update** is blocked and displays:
   `"Please select who is making this update before saving."`
5. Select a valid author, perform the status change or add notes, and verify that:
   - The status updates correctly.
   - A new note is created under the item's **History** list log.
   - Changes sync instantly if you have another browser tab open (via Realtime).

---

## RLS Verification Checklist

Verify that the Supabase setup meets these security requirements:

- [x] RLS enabled on `tracker_items`
- [x] RLS enabled on `tracker_item_notes`
- [x] RLS enabled on `update_authors`
- [x] RLS enabled on `user_roles`
- [x] Anon user can read public tracker items (`is_public = true`)
- [x] Anon user can read public item notes (notes linked to public items)
- [x] Anon user cannot insert tracker items
- [x] Anon user cannot update tracker items
- [x] Anon user cannot delete tracker items
- [x] Anon user cannot insert notes
- [x] Authenticated non-admin cannot update tracker items
- [x] Authenticated non-admin cannot insert notes
- [x] Admin can update tracker items
- [x] Admin can insert notes
- [x] User cannot self-escalate into admin
- [x] `service_role` key is not present in frontend code
- [x] `service_role` key is not present in `.env.example`
- [x] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used in the client

---

## Safety & Compliance Guidelines

> [!WARNING]
> **Confidentiality Rule**: Do not place credentials, passwords, private contact details, personal/private biographical data, named mines, or confidential third-party company names in the tracker items or note content.
> Treat all notes as potentially visible to the public or client.

> [!IMPORTANT]
> **Design Freeze**: The visual styling, colors, layout, spacing, and typography of this tracker are completely frozen. Additive functional updates must reuse existing styles and classes. Do not redesign the interface.

---

## Graduates & Cohort Section (v2 — Spreadsheet-aligned)

The Graduates & Cohort section is an **admin-only** feature for programme coordination.  
It is **not** a screening tool, ranking system, or automated decision engine.

### Structure

The section tracks graduates aligned to the real cohort spreadsheet:

| Spreadsheet Column | App Field |
|---|---|
| No | `row_number` |
| Sex | `sex` |
| Name | `first_name` |
| Surname | `surname` |
| Year Graduated | `year_graduated` |
| NQF Level | `nqf_level` |
| Degree | `degree` |
| University | `university` |
| Competent B | `competent_b` |
| Blasting Certificate | `blasting_certificate` |
| Employment | `employment` |
| Filament Client / Filament | `filament_status` |
| Lost to Attrition | `attrition_status` |

### Cohorts

Two cohorts are pre-seeded:

| ID | Name | Status |
|---|---|---|
| `cohort-1` | Cohort 1 | Completed |
| `cohort-2` | Cohort 2 | Active |

The cohort tab filter at the top of the section lets admins switch between:
- **All Cohorts** — all graduates
- **Cohort 1** — Cohort 1 graduates only
- **Cohort 2** — Cohort 2 graduates only

### Controlled Field Values

**Sex:** `Mr` | `Ms` | `MS` | `Other / Confirm`  
**Competent B:** `Yes` | `No` | `Pending` | `Not Confirmed`  
**Blasting Certificate:** `Yes` | `No` | `Pending` | `Not Confirmed`  
**Employment:** `Yes` | `No` | `Pending` | `Not Confirmed`  
**Filament Client / Filament:** `Filament Client` | `Filament` | `Filament Permanent Staff` | `Not Assigned` | `Pending Confirmation`  
**Lost to Attrition (attrition_status):** `Active` | `Lost to Attrition` | `Withdrawn` | `Not Confirmed`

> **attrition_status** is an administrative status only. It does not reflect on a graduate's performance or character.

### Access Control

| User Type | Access |
|---|---|
| Admin (`user_roles` table) | Full read/write access to all cohort/graduate data |
| Authenticated non-admin | No access (RLS blocks all graduate table reads) |
| Unauthenticated / public | No access — section is hidden from nav and blocked by RLS |

The **"Graduates & Cohort"** nav item only appears in the sidebar when `userRole === "admin"`.  
Non-admin users see an "Admin Access Required" message — no graduate data is exposed.

### Supabase Tables

| Table | Purpose | Admin | Public |
|---|---|---|---|
| `cohorts` | Cohort-level records | Full CRUD | SELECT if `is_public_summary=true` (not used in this pass) |
| `graduates` | Individual graduate admin records (spreadsheet-aligned) | Full CRUD | None |
| `graduate_documents` | Document checklist (status only, no files) | Full CRUD | None |
| `graduate_activity_notes` | Full audit trail for all updates | Full CRUD | None |

### Setting Up the Cohort Schema

1. Open the **SQL Editor** in your Supabase Dashboard.
2. Paste the contents of [`supabase/cohort_schema.sql`](./supabase/cohort_schema.sql) and run it.
3. The script creates all tables, adds new columns safely with `ALTER TABLE IF NOT EXISTS`, enables RLS, drops/re-creates policies (idempotent), and seeds both cohorts with placeholder graduates.

> Must run `supabase/schema.sql` first (for `user_roles` and `update_authors` tables).

### How to Filter by Cohort

1. Log in as admin.
2. Navigate to **Graduates & Cohort**.
3. Click **Cohort 1**, **Cohort 2**, or **All Cohorts** in the tab bar at the top.
4. The graduate table and metrics update to show only the selected cohort's graduates.

### How to Add a Graduate

1. Log in as admin.
2. Navigate to **Graduates & Cohort**.
3. Select an **Active Editor** from the sidebar dropdown (required before saving).
4. Click **Add Graduate** (top right).
5. Fill in: Cohort, No (row), Sex, Name, Surname, Year Graduated, NQF Level, Degree, University.
6. Set Competent B, Blasting Certificate, Employment, Filament status, Attrition status.
7. Click **Add Graduate**. An audit note is created automatically.

### How to Edit Competent B / Blasting / Employment / Filament / Attrition

1. Navigate to **Graduates & Cohort**.
2. Select an **Active Editor** from the sidebar dropdown.
3. Click **Edit** on any graduate row.
4. Update the relevant status dropdown in the **Programme Statuses** column of the modal.
5. Click **Save Changes**.
6. Each changed status field creates an individual `graduate_activity_notes` record:
   - Field name (e.g. "Competent B")
   - Old value → New value
   - Author name and organisation
   - Timestamp

### How to Edit a Cohort

1. Select a cohort from the tab filter (not "All Cohorts").
2. Click **Edit Cohort** next to the cohort badge.
3. Update cohort name, status, target size, dates, or description.
4. Click **Save Cohort**.

### How Audit Logs Work

Every meaningful update creates a `graduate_activity_notes` row recording:
- Who made the change (selected author + organisation)
- Which field changed
- Old value → new value
- A note text (for manual notes)
- Timestamp

The **Activity Log** tab inside each graduate's edit modal shows all notes for that graduate in reverse chronological order.

The cohort edit modal includes a collapsible **Cohort Activity Log**.

### Validation

```bash
npm run validate          # existing tracker data safety validation
npm run validate:cohort   # cohort/graduate data safety validation (v2)
npm run build             # runs both validators before building
```

`validate:cohort` checks:
- No duplicate cohort or graduate IDs
- No bare integer IDs
- No duplicate `row_number` within the same cohort
- No real personal data in seed records (email, phone, non-placeholder names)
- `cohort_id` references a known seed cohort
- `year_graduated` within reasonable range (1990–current year+5)
- `nqf_level` within range 1–10
- `sex`, `competent_b`, `blasting_certificate`, `employment`, `filament_status`, `attrition_status` use controlled values
- No AI scoring/ranking/decision language
- No guaranteed placement language
- No SA ID number patterns
- No banned third-party mine names
- Source files free of JWTs and service-role key references

### CSV Import

> CSV import is planned for a future iteration and is not included in this implementation pass.  
> Records can be added individually using the **Add Graduate** button.

### File Upload

> File upload is planned for a future iteration and is not included in this implementation pass.  
> The document checklist tracks status only (received / missing / verified).

---

## Privacy & Data Safety Rules (Graduates & Cohort)

> [!CAUTION]
> Graduate records may contain personal information. Follow these rules strictly.

**DO NOT store:**
- South African ID numbers
- Home addresses or full residential details
- CV content or academic record text
- Medical, demographic, political, or religious information
- Private documents of any kind
- File uploads (not implemented — future iteration only)

**DO NOT imply:**
- Guaranteed job placement or employment
- Guaranteed absorption by Filament (Pty) Ltd
- AI-based scoring, ranking, or candidate selection
- Automated applicant decisions of any kind

**DO NOT expose:**
- Individual graduate records to public/viewer users
- Email or phone fields outside admin-authenticated views
- Graduate names or personal notes in public dashboard summaries or exports

**The section exists for:**
- Administrative coordination
- Programme progress tracking
- Document readiness monitoring
- Audit history

> [!WARNING]
> **No AI Decision-Making**: This tracker does not and must not use AI to score, rank, recommend, accept, or reject any graduate. Any such feature would violate the programme's ethical guardrails and must never be added without explicit governance approval.

> [!WARNING]
> **No Placement Guarantee**: Filament (Pty) Ltd placement or project assignment may occur after training completion and is not guaranteed. Do not add language implying otherwise.



