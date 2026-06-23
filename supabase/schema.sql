create extension if not exists pgcrypto;

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  meeting_date timestamptz not null,
  location text,
  registration_deadline timestamptz,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,

  inviter_name text not null,
  hall text not null,
  district text not null,

  meal_required boolean not null default false,
  attendee_count integer not null default 1,
  meat_meal_count integer not null default 0,
  vegetarian_meal_count integer not null default 0,

  guest_names text,
  note text,

  edit_token text not null unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendee_count_positive check (attendee_count > 0),
  constraint meal_count_non_negative check (
    meat_meal_count >= 0 and vegetarian_meal_count >= 0
  ),
  constraint meal_count_valid check (
    (
      meal_required = true
      and meat_meal_count + vegetarian_meal_count between 1 and attendee_count
    )
    or (
      meal_required = false
      and meat_meal_count = 0
      and vegetarian_meal_count = 0
    )
  )
);

create table if not exists admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),

  constraint admin_profiles_username_format check (username ~ '^[a-zA-Z0-9_-]{3,32}$')
);

create table if not exists location_options (
  id uuid primary key default gen_random_uuid(),
  hall text not null,
  district text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint location_options_hall_district_unique unique (hall, district),
  constraint location_options_hall_not_blank check (length(trim(hall)) > 0),
  constraint location_options_district_not_blank check (length(trim(district)) > 0)
);

drop index if exists location_options_active_sort_idx;

alter table location_options
drop column if exists sort_order;

create index if not exists admin_profiles_username_idx on admin_profiles (username);
create index if not exists location_options_active_name_idx on location_options (is_active, hall, district);

alter table registrations
add column if not exists meal_required boolean not null default false;

update registrations
set meal_required = true
where meat_meal_count + vegetarian_meal_count > 0;

alter table registrations
drop constraint if exists meal_count_valid;

alter table registrations
add constraint meal_count_valid check (
  (
    meal_required = true
    and meat_meal_count + vegetarian_meal_count between 1 and attendee_count
  )
  or (
    meal_required = false
    and meat_meal_count = 0
    and vegetarian_meal_count = 0
  )
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_registrations_updated_at on registrations;

create trigger update_registrations_updated_at
before update on registrations
for each row
execute function update_updated_at_column();

create index if not exists meetings_open_date_idx on meetings (is_open, meeting_date);
create index if not exists registrations_meeting_id_idx on registrations (meeting_id);
create index if not exists registrations_edit_lookup_idx on registrations (id, edit_token);

create or replace function create_registration(
  new_meeting_id uuid,
  new_inviter_name text,
  new_hall text,
  new_district text,
  new_meal_required boolean,
  new_attendee_count integer,
  new_meat_meal_count integer,
  new_vegetarian_meal_count integer,
  new_guest_names text,
  new_note text,
  new_edit_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_registration jsonb;
begin
  if not exists (
    select 1
    from meetings
    where id = new_meeting_id
      and is_open = true
      and (registration_deadline is null or registration_deadline > now())
  ) then
    raise exception 'meeting is not open for registration';
  end if;

  insert into registrations (
    meeting_id,
    inviter_name,
    hall,
    district,
    meal_required,
    attendee_count,
    meat_meal_count,
    vegetarian_meal_count,
    guest_names,
    note,
    edit_token
  ) values (
    new_meeting_id,
    trim(new_inviter_name),
    trim(new_hall),
    trim(new_district),
    new_meal_required,
    new_attendee_count,
    new_meat_meal_count,
    new_vegetarian_meal_count,
    nullif(trim(coalesce(new_guest_names, '')), ''),
    nullif(trim(coalesce(new_note, '')), ''),
    new_edit_token
  )
  returning jsonb_build_object('id', id, 'edit_token', edit_token)
  into created_registration;

  return created_registration;
end;
$$;

create or replace function get_registration_by_token(
  registration_id uuid,
  token text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'meeting_id', r.meeting_id,
    'inviter_name', r.inviter_name,
    'hall', r.hall,
    'district', r.district,
    'meal_required', r.meal_required,
    'attendee_count', r.attendee_count,
    'meat_meal_count', r.meat_meal_count,
    'vegetarian_meal_count', r.vegetarian_meal_count,
    'guest_names', r.guest_names,
    'note', r.note,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'meeting', jsonb_build_object(
      'title', m.title,
      'meeting_date', m.meeting_date,
      'location', m.location,
      'registration_deadline', m.registration_deadline,
      'is_open', m.is_open
    )
  )
  from registrations r
  join meetings m on m.id = r.meeting_id
  where r.id = registration_id
    and r.edit_token = token;
$$;

create or replace function update_registration_by_token(
  registration_id uuid,
  token text,
  new_inviter_name text,
  new_hall text,
  new_district text,
  new_meal_required boolean,
  new_attendee_count integer,
  new_meat_meal_count integer,
  new_vegetarian_meal_count integer,
  new_guest_names text,
  new_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_registration jsonb;
begin
  update registrations r
  set
    inviter_name = trim(new_inviter_name),
    hall = trim(new_hall),
    district = trim(new_district),
    meal_required = new_meal_required,
    attendee_count = new_attendee_count,
    meat_meal_count = new_meat_meal_count,
    vegetarian_meal_count = new_vegetarian_meal_count,
    guest_names = nullif(trim(coalesce(new_guest_names, '')), ''),
    note = nullif(trim(coalesce(new_note, '')), '')
  from meetings m
  where r.meeting_id = m.id
    and r.id = registration_id
    and r.edit_token = token
    and m.is_open = true
    and (m.registration_deadline is null or m.registration_deadline > now())
  returning jsonb_build_object('id', r.id, 'updated_at', r.updated_at)
  into updated_registration;

  return updated_registration;
end;
$$;

create or replace function create_admin_profile(
  new_user_id uuid,
  new_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text;
  created_profile jsonb;
begin
  normalized_username := lower(trim(new_username));

  if normalized_username !~ '^[a-zA-Z0-9_-]{3,32}$' then
    raise exception 'invalid username';
  end if;

  insert into admin_profiles (id, username)
  values (new_user_id, normalized_username)
  returning jsonb_build_object('id', id, 'username', username)
  into created_profile;

  return created_profile;
end;
$$;

create or replace function find_registration_for_success(
  search_meeting_id uuid,
  search_inviter_name text,
  search_hall text,
  search_district text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'edit_token', r.edit_token
  )
  from registrations r
  join meetings m on m.id = r.meeting_id
  where r.meeting_id = search_meeting_id
    and m.is_open = true
    and (m.registration_deadline is null or m.registration_deadline > now())
    and lower(trim(r.inviter_name)) = lower(trim(search_inviter_name))
    and trim(r.hall) = trim(search_hall)
    and trim(r.district) = trim(search_district)
  order by r.updated_at desc, r.created_at desc
  limit 1;
$$;

create or replace function public.health_check()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok');
$$;
