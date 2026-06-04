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
