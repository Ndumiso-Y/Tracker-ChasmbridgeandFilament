-- schema.sql
-- Run this in your Supabase SQL Editor to set up the database structure.

-- Enable uuid-ossp extension
create extension if not exists "uuid-ossp";

-- 1. Table user_roles
create table if not exists user_roles (
  user_id uuid primary key,
  role text not null check (role in ('admin')),
  email text,
  created_at timestamptz default now()
);

-- 2. Table update_authors
create table if not exists update_authors (
  id text primary key,
  display_name text not null,
  role_label text,
  organisation_label text,
  is_active boolean default true,
  sort_order integer,
  created_at timestamptz default now()
);

-- 3. Table tracker_items
create table if not exists tracker_items (
  id text primary key,
  title text not null,
  entity text not null,
  phase text not null,
  category text not null,
  status text not null,
  priority text,
  owner_label text,
  due_date date,
  description text,
  next_action text,
  notes text,
  is_public boolean default true,
  sort_order integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_changed_by text,
  last_changed_at timestamptz
);

-- 4. Table tracker_item_notes
create table if not exists tracker_item_notes (
  id uuid primary key default gen_random_uuid(),
  tracker_item_id text not null references tracker_items(id) on delete cascade,
  note_type text not null default 'manual' check (note_type in ('manual', 'status_change', 'due_date_update', 'next_action_update', 'priority_update')),
  note_text text,
  changed_by_author_id text references update_authors(id),
  changed_by_label text not null,
  old_status text,
  new_status text,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_tracker_items_category on tracker_items(category);
create index if not exists idx_tracker_item_notes_item_id on tracker_item_notes(tracker_item_id);

-- Enable Row Level Security (RLS)
alter table user_roles enable row level security;
alter table update_authors enable row level security;
alter table tracker_items enable row level security;
alter table tracker_item_notes enable row level security;

-- Open policies to allow public read/write access (no sign-in required for editing)
create policy "Allow ALL user_roles for public" on user_roles for all using (true);
create policy "Allow ALL update_authors for public" on update_authors for all using (true);
create policy "Allow ALL tracker_items for public" on tracker_items for all using (true);
create policy "Allow ALL tracker_item_notes for public" on tracker_item_notes for all using (true);

-- Seed data for update_authors
insert into update_authors (id, display_name, role_label, organisation_label, is_active, sort_order)
values
  ('ndumiso-embark', 'Ndumiso / Embark Digitals', 'Delivery Owner', 'Embark Digitals', true, 1),
  ('dr-rudy-chasm-bridge', 'Dr. Rudy', 'Client Stakeholder', 'Chasm Bridge Charity', true, 2),
  ('monique-filament', 'Monique', 'Client Stakeholder', 'Filament (Pty) Ltd', true, 3),
  ('jazmin-chasm-bridge', 'Jazmin', 'Client Stakeholder / Role To Be Confirmed', 'Chasm Bridge Charity', true, 4)
on conflict (id) do update set
  display_name = excluded.display_name,
  role_label = excluded.role_label,
  organisation_label = excluded.organisation_label,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
