-- policies.sql
-- Enable Row-Level Security (RLS) on all tables and configure policies.
-- Run this in your Supabase SQL Editor after running schema.sql.

-- 1. Enable RLS on all tables
alter table user_roles enable row level security;
alter table tasks enable row level security;
alter table deliverables enable row level security;
alter table client_assets enable row level security;
alter table launch_items enable row level security;
alter table scope_groups enable row level security;
alter table retainer_items enable row level security;
alter table retainer_tiers enable row level security;
alter table future_phase_items enable row level security;

-- 2. Create the is_admin checker function
create or replace function is_admin()
returns boolean security definer as $$
begin
  return exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql;

-- 3. SELECT policies: Allow all authenticated users to read everything
create policy "Allow SELECT for authenticated users" on user_roles for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on tasks for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on deliverables for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on client_assets for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on launch_items for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on scope_groups for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on retainer_items for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on retainer_tiers for select to authenticated using (true);
create policy "Allow SELECT for authenticated users" on future_phase_items for select to authenticated using (true);

-- 4. ALL write/edit policies: Only allow admins to insert, update, or delete records
create policy "Allow ALL for admins" on user_roles for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on tasks for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on deliverables for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on client_assets for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on launch_items for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on scope_groups for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on retainer_items for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on retainer_tiers for all to authenticated using (is_admin()) with check (is_admin());
create policy "Allow ALL for admins" on future_phase_items for all to authenticated using (is_admin()) with check (is_admin());
