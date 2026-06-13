alter table meetings enable row level security;
alter table registrations enable row level security;
alter table admin_profiles enable row level security;

drop policy if exists "Open meetings are readable" on meetings;
create policy "Open meetings are readable"
on meetings for select
to anon, authenticated
using (is_open = true or auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage meetings" on meetings;
create policy "Authenticated users can manage meetings"
on meetings for all
to authenticated
using (true)
with check (true);

drop policy if exists "Anyone can create registrations" on registrations;
create policy "Anyone can create registrations"
on registrations for insert
to anon, authenticated
with check (
  exists (
    select 1
    from meetings
    where meetings.id = registrations.meeting_id
      and meetings.is_open = true
      and (
        meetings.registration_deadline is null
        or meetings.registration_deadline > now()
      )
  )
);

drop policy if exists "Authenticated users can read registrations" on registrations;
create policy "Authenticated users can read registrations"
on registrations for select
to authenticated
using (true);

drop policy if exists "Authenticated users can update registrations" on registrations;
create policy "Authenticated users can update registrations"
on registrations for update
to authenticated
using (true)
with check (true);

grant execute on function get_registration_by_token(uuid, text) to anon, authenticated;
grant execute on function create_registration(uuid, text, text, text, boolean, integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function update_registration_by_token(uuid, text, text, text, text, boolean, integer, integer, integer, text, text) to anon, authenticated;
grant execute on function create_admin_profile(uuid, text) to anon, authenticated;
grant execute on function find_registration_for_success(uuid, text, text, text) to anon, authenticated;

drop policy if exists "Anyone can check admin usernames" on admin_profiles;
create policy "Anyone can check admin usernames"
on admin_profiles for select
to anon, authenticated
using (true);

drop policy if exists "Users can create own admin profile" on admin_profiles;
create policy "Users can create own admin profile"
on admin_profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users can read own admin profile" on admin_profiles;
create policy "Users can read own admin profile"
on admin_profiles for select
to authenticated
using (id = auth.uid());
