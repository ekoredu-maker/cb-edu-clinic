-- V14 Realtime Operations / Supabase schema
-- Live baseline synchronized with cb-edu-clinic Supabase project.
-- Public client uses a publishable key; authorization is enforced by Auth + RLS.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_staff_id text,
  display_name text not null,
  phone text,
  roles text[] not null default array['supporter']::text[]
    check (cardinality(roles) >= 1 and roles <@ array['supporter','counselor','admin','supervisor']::text[]),
  identity_verified boolean not null default false,
  identity_verified_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_legacy_staff_id_uq
  on public.profiles(legacy_staff_id) where legacy_staff_id is not null;

create table if not exists public.program_settings (
  id integer primary key default 1 check (id = 1),
  org_name text not null default '○○교육지원청',
  coach_rate integer not null default 40000 check (coach_rate >= 0),
  class_rate integer not null default 30000 check (class_rate >= 0),
  travel_long_rate integer not null default 20000 check (travel_long_rate >= 0),
  travel_short_rate integer not null default 10000 check (travel_short_rate >= 0),
  tax_pct numeric(5,2) not null default 3.30 check (tax_pct between 0 and 100),
  default_location_radius_m integer not null default 250 check (default_location_radius_m between 10 and 5000),
  max_location_accuracy_m integer not null default 150 check (max_location_accuracy_m between 10 and 5000),
  start_window_before_min integer not null default 60 check (start_window_before_min between 0 and 720),
  start_window_after_min integer not null default 90 check (start_window_after_min between 0 and 720),
  min_duration_ratio numeric(5,2) not null default 0.50 check (min_duration_ratio between 0 and 2),
  updated_at timestamptz not null default now()
);

insert into public.program_settings(id, org_name)
values (1, '제천교육지원청')
on conflict (id) do nothing;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  legacy_school_code text,
  name text not null,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  radius_m integer check (radius_m is null or radius_m between 10 and 5000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists schools_legacy_school_code_uq
  on public.schools(legacy_school_code) where legacy_school_code is not null;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  legacy_student_id text,
  school_id uuid references public.schools(id),
  full_name text not null,
  alias text,
  school_type text,
  grade integer check (grade is null or grade between 1 and 12),
  class_no integer check (class_no is null or class_no between 1 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_legacy_student_id_uq
  on public.students(legacy_student_id) where legacy_student_id is not null;
create index if not exists students_school_id_idx on public.students(school_id);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_matching_id text,
  supporter_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id),
  kind text not null default 'coach' check (kind in ('coach','class')),
  status text not null default 'active' check (status in ('active','paused','ended')),
  started_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create unique index if not exists assignments_legacy_matching_id_uq
  on public.assignments(legacy_matching_id) where legacy_matching_id is not null;
create index if not exists assignments_supporter_idx on public.assignments(supporter_id);
create index if not exists assignments_student_idx on public.assignments(student_id);

create table if not exists public.schedule_plans (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  school_id uuid references public.schools(id),
  specific_date date,
  weekday smallint check (weekday between 1 and 7),
  planned_start time not null,
  planned_end time not null,
  place text,
  effective_from date,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end > planned_start),
  check (specific_date is not null or weekday is not null),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists schedule_plans_assignment_idx on public.schedule_plans(assignment_id);
create index if not exists schedule_plans_school_idx on public.schedule_plans(school_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_plan_id uuid not null references public.schedule_plans(id),
  assignment_id uuid not null references public.assignments(id),
  supporter_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id),
  work_date date not null,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  session_status text not null default 'planned'
    check (session_status in ('planned','in_progress','completed','absent','cancelled','makeup')),
  verification_state text not null default 'pending'
    check (verification_state in ('pending','auto_verified','review_required','confirmed','rejected')),
  settlement_state text not null default 'pending'
    check (settlement_state in ('pending','approved','paid')),
  verification_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_plan_id, work_date),
  check (end_at is null or start_at is null or end_at > start_at)
);

create index if not exists sessions_supporter_date_idx on public.sessions(supporter_id, work_date);
create index if not exists sessions_student_date_idx on public.sessions(student_id, work_date);
create index if not exists sessions_verification_idx on public.sessions(verification_state, work_date);
create index if not exists sessions_settlement_idx on public.sessions(settlement_state, work_date);

create table if not exists public.session_locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  point_type text not null check (point_type in ('start','end')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  distance_m double precision check (distance_m is null or distance_m >= 0),
  within_radius boolean,
  captured_at timestamptz not null default now(),
  unique(session_id, point_type)
);

create table if not exists public.lesson_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  supporter_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id),
  subject_area text,
  topic text,
  content text,
  student_response text,
  next_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_records_student_idx on public.lesson_records(student_id);

create table if not exists public.counseling_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  assignment_id uuid references public.assignments(id),
  author_id uuid not null references public.profiles(id),
  counseling_type text not null default 'student'
    check (counseling_type in ('student','guardian','teacher','school','other')),
  occurred_at timestamptz not null default now(),
  content text not null,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists counseling_student_idx on public.counseling_records(student_id, occurred_at desc);
create index if not exists counseling_author_idx on public.counseling_records(author_id, occurred_at desc);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  assignment_id uuid references public.assignments(id),
  schedule_plan_id uuid references public.schedule_plans(id),
  request_type text not null
    check (request_type in ('schedule','assignment','student','school','end_support','other')),
  requested_value jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','applied')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists change_requests_status_idx on public.change_requests(status, created_at desc);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_roles text[] not null default array['supporter','counselor','admin','supervisor']::text[],
  published boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (target_roles <@ array['supporter','counselor','admin','supervisor']::text[])
);

create table if not exists public.notice_reads (
  notice_id uuid not null references public.notices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.program_settings;
create trigger settings_touch_updated_at before update on public.program_settings
for each row execute function private.touch_updated_at();

drop trigger if exists schools_touch_updated_at on public.schools;
create trigger schools_touch_updated_at before update on public.schools
for each row execute function private.touch_updated_at();

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students
for each row execute function private.touch_updated_at();

drop trigger if exists assignments_touch_updated_at on public.assignments;
create trigger assignments_touch_updated_at before update on public.assignments
for each row execute function private.touch_updated_at();

drop trigger if exists plans_touch_updated_at on public.schedule_plans;
create trigger plans_touch_updated_at before update on public.schedule_plans
for each row execute function private.touch_updated_at();

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at before update on public.sessions
for each row execute function private.touch_updated_at();

drop trigger if exists lesson_touch_updated_at on public.lesson_records;
create trigger lesson_touch_updated_at before update on public.lesson_records
for each row execute function private.touch_updated_at();

drop trigger if exists counseling_touch_updated_at on public.counseling_records;
create trigger counseling_touch_updated_at before update on public.counseling_records
for each row execute function private.touch_updated_at();

create or replace function private.has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.active = true
         and role_name = any(p.roles)
     );
$$;

create or replace function private.is_office_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.has_role('counselor')
      or private.has_role('admin')
      or private.has_role('supervisor');
$$;

revoke all on function private.has_role(text) from public;
revoke all on function private.is_office_user() from public;
grant execute on function private.has_role(text) to authenticated;
grant execute on function private.is_office_user() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, display_name, roles)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name',''), split_part(coalesce(new.email,''),'@',1), '사용자'),
    array['supporter']::text[]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.distance_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 6371000 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1))
        + sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  end;
$$;

create or replace function public.start_session(
  p_schedule_plan_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.schedule_plans;
  v_assignment public.assignments;
  v_school public.schools;
  v_session public.sessions;
  v_session_id uuid;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_distance double precision;
  v_radius integer;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception '위치값이 올바르지 않습니다.';
  end if;

  select * into v_plan
  from public.schedule_plans
  where id = p_schedule_plan_id and active = true;

  if v_plan.id is null then raise exception '활성 시간표를 찾을 수 없습니다.'; end if;

  select * into v_assignment
  from public.assignments
  where id = v_plan.assignment_id and status = 'active';

  if v_assignment.id is null or v_assignment.supporter_id <> v_uid then
    raise exception '이 수업을 시작할 권한이 없습니다.';
  end if;

  if v_plan.specific_date is not null and v_plan.specific_date <> v_today then
    raise exception '오늘 수업이 아닙니다.';
  end if;

  if v_plan.specific_date is null
     and v_plan.weekday <> extract(isodow from v_today)::smallint then
    raise exception '오늘 수업이 아닙니다.';
  end if;

  if v_plan.effective_from is not null and v_today < v_plan.effective_from then
    raise exception '아직 운영기간이 아닙니다.';
  end if;

  if v_plan.effective_to is not null and v_today > v_plan.effective_to then
    raise exception '운영기간이 종료되었습니다.';
  end if;

  select * into v_session
  from public.sessions
  where schedule_plan_id = v_plan.id and work_date = v_today;

  if v_session.id is not null then
    if v_session.session_status = 'completed' or v_session.end_at is not null then
      raise exception '이미 종료된 수업입니다.';
    end if;
    if v_session.start_at is not null then
      raise exception '이미 시작된 수업입니다.';
    end if;
  end if;

  insert into public.sessions(
    schedule_plan_id, assignment_id, supporter_id, student_id, work_date,
    planned_start_at, planned_end_at, start_at, session_status
  )
  values(
    v_plan.id,
    v_assignment.id,
    v_assignment.supporter_id,
    v_assignment.student_id,
    v_today,
    (v_today + v_plan.planned_start) at time zone 'Asia/Seoul',
    (v_today + v_plan.planned_end) at time zone 'Asia/Seoul',
    v_now,
    'in_progress'
  )
  on conflict(schedule_plan_id, work_date)
  do update set
    start_at = excluded.start_at,
    session_status = 'in_progress',
    updated_at = v_now
  returning id into v_session_id;

  select * into v_school from public.schools where id = v_plan.school_id;

  select coalesce(v_school.radius_m, ps.default_location_radius_m)
  into v_radius
  from public.program_settings ps where ps.id = 1;

  v_distance := public.distance_meters(
    p_latitude, p_longitude, v_school.latitude, v_school.longitude
  );

  insert into public.session_locations(
    session_id, point_type, latitude, longitude, accuracy_m,
    distance_m, within_radius, captured_at
  )
  values(
    v_session_id, 'start', p_latitude, p_longitude, p_accuracy_m,
    v_distance,
    case when v_distance is null then null else v_distance <= v_radius end,
    v_now
  )
  on conflict(session_id, point_type) do nothing;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail)
  values(
    v_uid,
    'session_start',
    'session',
    v_session_id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m)
  );

  return v_session_id;
end;
$$;

create or replace function public.end_session(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_plan public.schedule_plans;
  v_school public.schools;
  v_start_loc public.session_locations;
  v_now timestamptz := now();
  v_distance double precision;
  v_radius integer;
  v_max_accuracy integer;
  v_before integer;
  v_after integer;
  v_planned_minutes numeric;
  v_actual_minutes numeric;
  v_min_ratio numeric;
  v_result text;
  v_reason text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception '위치값이 올바르지 않습니다.';
  end if;

  select * into v_session from public.sessions where id = p_session_id;

  if v_session.id is null or v_session.supporter_id <> v_uid then
    raise exception '이 수업을 종료할 권한이 없습니다.';
  end if;

  if v_session.start_at is null then raise exception '시작 기록이 없습니다.'; end if;

  if v_session.end_at is not null or v_session.session_status = 'completed' then
    raise exception '이미 종료된 수업입니다.';
  end if;

  select * into v_plan from public.schedule_plans where id = v_session.schedule_plan_id;
  select * into v_school from public.schools where id = v_plan.school_id;

  select
    coalesce(v_school.radius_m, ps.default_location_radius_m),
    ps.max_location_accuracy_m,
    ps.start_window_before_min,
    ps.start_window_after_min,
    ps.min_duration_ratio
  into v_radius, v_max_accuracy, v_before, v_after, v_min_ratio
  from public.program_settings ps
  where ps.id = 1;

  v_distance := public.distance_meters(
    p_latitude, p_longitude, v_school.latitude, v_school.longitude
  );

  insert into public.session_locations(
    session_id, point_type, latitude, longitude, accuracy_m,
    distance_m, within_radius, captured_at
  )
  values(
    p_session_id, 'end', p_latitude, p_longitude, p_accuracy_m,
    v_distance,
    case when v_distance is null then null else v_distance <= v_radius end,
    v_now
  )
  on conflict(session_id, point_type) do nothing;

  select * into v_start_loc
  from public.session_locations
  where session_id = p_session_id and point_type = 'start';

  v_planned_minutes := extract(epoch from (v_session.planned_end_at - v_session.planned_start_at)) / 60.0;
  v_actual_minutes := extract(epoch from (v_now - v_session.start_at)) / 60.0;

  if coalesce(v_start_loc.within_radius, false)
     and coalesce(v_distance <= v_radius, false)
     and (v_start_loc.accuracy_m is null or v_start_loc.accuracy_m <= v_max_accuracy)
     and (p_accuracy_m is null or p_accuracy_m <= v_max_accuracy)
     and v_session.start_at >= v_session.planned_start_at - make_interval(mins => v_before)
     and v_session.start_at <= v_session.planned_start_at + make_interval(mins => v_after)
     and v_actual_minutes >= greatest(10, v_planned_minutes * v_min_ratio)
     and v_actual_minutes <= v_planned_minutes + 120
  then
    v_result := 'auto_verified';
    v_reason := '서버시각·위치·수업시간 자동검증 통과';
  else
    v_result := 'review_required';
    v_reason := concat_ws(' / ',
      case when not coalesce(v_start_loc.within_radius,false) then '시작 위치 확인' end,
      case when not coalesce(v_distance <= v_radius,false) then '종료 위치 확인' end,
      case when v_start_loc.accuracy_m is not null and v_start_loc.accuracy_m > v_max_accuracy then '시작 GPS 정확도 확인' end,
      case when p_accuracy_m is not null and p_accuracy_m > v_max_accuracy then '종료 GPS 정확도 확인' end,
      case when v_session.start_at < v_session.planned_start_at - make_interval(mins => v_before)
             or v_session.start_at > v_session.planned_start_at + make_interval(mins => v_after)
           then '계획시간 대비 시작시각 확인' end,
      case when v_actual_minutes < greatest(10, v_planned_minutes * v_min_ratio)
             or v_actual_minutes > v_planned_minutes + 120
           then '실제 활동시간 확인' end
    );
    if coalesce(v_reason,'') = '' then
      v_reason := '자동검증 조건 확인 필요';
    end if;
  end if;

  update public.sessions
  set end_at = v_now,
      session_status = 'completed',
      verification_state = v_result,
      verification_reason = v_reason,
      updated_at = v_now
  where id = p_session_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail)
  values(
    v_uid,
    'session_end',
    'session',
    p_session_id::text,
    jsonb_build_object(
      'distance_m', v_distance,
      'accuracy_m', p_accuracy_m,
      'actual_minutes', v_actual_minutes,
      'verification', v_result
    )
  );

  return v_result;
end;
$$;

revoke all on function public.start_session(uuid,double precision,double precision,double precision) from public, anon;
revoke all on function public.end_session(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.start_session(uuid,double precision,double precision,double precision) to authenticated;
grant execute on function public.end_session(uuid,double precision,double precision,double precision) to authenticated;

alter table public.profiles enable row level security;
alter table public.program_settings enable row level security;
alter table public.schools enable row level security;
alter table public.students enable row level security;
alter table public.assignments enable row level security;
alter table public.schedule_plans enable row level security;
alter table public.sessions enable row level security;
alter table public.session_locations enable row level security;
alter table public.lesson_records enable row level security;
alter table public.counseling_records enable row level security;
alter table public.change_requests enable row level security;
alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.is_office_user());

drop policy if exists settings_select on public.program_settings;
create policy settings_select on public.program_settings for select to authenticated
using (private.is_office_user());

drop policy if exists settings_write on public.program_settings;
create policy settings_write on public.program_settings for update to authenticated
using (private.has_role('admin') or private.has_role('supervisor'))
with check (private.has_role('admin') or private.has_role('supervisor'));

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools for select to authenticated
using (
  private.is_office_user()
  or exists (
    select 1
    from public.assignments a
    join public.students s on s.id = a.student_id
    where a.supporter_id = (select auth.uid())
      and a.status = 'active'
      and s.school_id = schools.id
  )
);

drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for all to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
using (
  private.is_office_user()
  or exists (
    select 1 from public.assignments a
    where a.student_id = students.id
      and a.supporter_id = (select auth.uid())
      and a.status = 'active'
  )
);

drop policy if exists students_write on public.students;
create policy students_write on public.students for all to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
using (private.is_office_user() or supporter_id = (select auth.uid()));

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists plans_select on public.schedule_plans;
create policy plans_select on public.schedule_plans for select to authenticated
using (
  private.is_office_user()
  or exists (
    select 1 from public.assignments a
    where a.id = schedule_plans.assignment_id
      and a.supporter_id = (select auth.uid())
  )
);

drop policy if exists plans_write on public.schedule_plans;
create policy plans_write on public.schedule_plans for all to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
using (private.is_office_user() or supporter_id = (select auth.uid()));

drop policy if exists sessions_office_update on public.sessions;
create policy sessions_office_update on public.sessions for update to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists locations_select on public.session_locations;
create policy locations_select on public.session_locations for select to authenticated
using (
  private.is_office_user()
  or exists (
    select 1 from public.sessions s
    where s.id = session_locations.session_id
      and s.supporter_id = (select auth.uid())
  )
);

drop policy if exists lessons_select on public.lesson_records;
create policy lessons_select on public.lesson_records for select to authenticated
using (private.is_office_user() or supporter_id = (select auth.uid()));

drop policy if exists lessons_insert on public.lesson_records;
create policy lessons_insert on public.lesson_records for insert to authenticated
with check (
  supporter_id = (select auth.uid())
  and exists (
    select 1 from public.sessions s
    where s.id = lesson_records.session_id
      and s.supporter_id = (select auth.uid())
  )
);

drop policy if exists lessons_update on public.lesson_records;
create policy lessons_update on public.lesson_records for update to authenticated
using (supporter_id = (select auth.uid()) or private.is_office_user())
with check (supporter_id = (select auth.uid()) or private.is_office_user());

drop policy if exists counseling_select on public.counseling_records;
create policy counseling_select on public.counseling_records for select to authenticated
using (private.is_office_user() or author_id = (select auth.uid()));

drop policy if exists counseling_insert on public.counseling_records;
create policy counseling_insert on public.counseling_records for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    private.is_office_user()
    or exists (
      select 1 from public.assignments a
      where a.student_id = counseling_records.student_id
        and a.supporter_id = (select auth.uid())
        and a.status = 'active'
    )
  )
);

drop policy if exists counseling_update on public.counseling_records;
create policy counseling_update on public.counseling_records for update to authenticated
using (author_id = (select auth.uid()) or private.is_office_user())
with check (author_id = (select auth.uid()) or private.is_office_user());

drop policy if exists requests_select on public.change_requests;
create policy requests_select on public.change_requests for select to authenticated
using (private.is_office_user() or requester_id = (select auth.uid()));

drop policy if exists requests_insert on public.change_requests;
create policy requests_insert on public.change_requests for insert to authenticated
with check (requester_id = (select auth.uid()));

drop policy if exists requests_office_update on public.change_requests;
create policy requests_office_update on public.change_requests for update to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists notices_select on public.notices;
create policy notices_select on public.notices for select to authenticated
using (
  published = true
  and (expires_at is null or expires_at > now())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.roles && notices.target_roles
  )
);

drop policy if exists notices_write on public.notices;
create policy notices_write on public.notices for all to authenticated
using (private.is_office_user())
with check (private.is_office_user());

drop policy if exists notice_reads_select on public.notice_reads;
create policy notice_reads_select on public.notice_reads for select to authenticated
using (user_id = (select auth.uid()) or private.is_office_user());

drop policy if exists notice_reads_insert on public.notice_reads;
create policy notice_reads_insert on public.notice_reads for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
using (private.is_office_user());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on public.profiles to authenticated;
grant select, update on public.program_settings to authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.schedule_plans to authenticated;
grant select, update on public.sessions to authenticated;
grant select on public.session_locations to authenticated;
grant select, insert, update on public.lesson_records to authenticated;
grant select, insert, update on public.counseling_records to authenticated;
grant select, insert, update on public.change_requests to authenticated;
grant select, insert, update, delete on public.notices to authenticated;
grant select, insert on public.notice_reads to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.audit_logs to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='notices'
  ) then
    alter publication supabase_realtime add table public.notices;
  end if;
end $$;


-- ---------- V14 -> V13 projection ----------
create or replace view public.v13_session_projection
with (security_invoker = true)
as
select
  s.id,
  a.legacy_matching_id,
  p.legacy_staff_id,
  st.legacy_student_id,
  s.work_date,
  s.planned_start_at,
  s.planned_end_at,
  s.start_at,
  s.end_at,
  case
    when s.start_at is not null and s.end_at is not null
    then round(extract(epoch from (s.end_at - s.start_at)) / 60.0)::integer
    else null
  end as actual_minutes,
  a.kind,
  coalesce(lr.topic, '') as topic,
  coalesce(lr.content, lr.topic, '') as content,
  coalesce(sp.place, sc.name, '') as place,
  sc.name as school_name,
  s.verification_state,
  s.settlement_state,
  s.verification_reason
from public.sessions s
join public.assignments a on a.id = s.assignment_id
join public.profiles p on p.id = s.supporter_id
join public.students st on st.id = s.student_id
left join public.schedule_plans sp on sp.id = s.schedule_plan_id
left join public.schools sc on sc.id = sp.school_id
left join public.lesson_records lr on lr.session_id = s.id
where s.session_status = 'completed';

revoke all on public.v13_session_projection from public, anon;
grant select on public.v13_session_projection to authenticated;


-- ---------- V14.4 mobile ID / admin operations ----------
alter table public.profiles
  add column if not exists mobile_id_no text,
  add column if not exists mobile_id_issued_at timestamptz,
  add column if not exists mobile_id_expires_on date,
  add column if not exists mobile_id_active boolean not null default false;

create unique index if not exists profiles_mobile_id_no_uq
  on public.profiles(mobile_id_no)
  where mobile_id_no is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'supporter-id-photos',
  'supporter-id-photos',
  false,
  3145728,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists supporter_id_photo_select on storage.objects;
create policy supporter_id_photo_select
on storage.objects
for select
to authenticated
using (
  bucket_id='supporter-id-photos'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or private.is_office_user()
  )
);

drop policy if exists supporter_id_photo_insert on storage.objects;
create policy supporter_id_photo_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='supporter-id-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists supporter_id_photo_update on storage.objects;
create policy supporter_id_photo_update
on storage.objects
for update
to authenticated
using (
  bucket_id='supporter-id-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='supporter-id-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists supporter_id_photo_delete on storage.objects;
create policy supporter_id_photo_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='supporter-id-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function public.set_school_baseline_location(
  p_school_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_school public.schools;
  v_max_accuracy integer;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not private.is_office_user() then
    raise exception '학교 기준 위치를 등록할 권한이 없습니다.';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception '위치값이 올바르지 않습니다.';
  end if;

  select max_location_accuracy_m into v_max_accuracy
  from public.program_settings where id=1;

  if p_accuracy_m is not null and p_accuracy_m > coalesce(v_max_accuracy,150) then
    raise exception 'GPS 정확도가 낮아 기준 위치로 저장하지 않았습니다.';
  end if;

  update public.schools
  set latitude=p_latitude,
      longitude=p_longitude,
      updated_at=now()
  where id=p_school_id
  returning * into v_school;

  if v_school.id is null then
    raise exception '학교를 찾을 수 없거나 수정 권한이 없습니다.';
  end if;

  return jsonb_build_object(
    'ok',true,
    'school_id',v_school.id,
    'registered',true,
    'updated_at',v_school.updated_at
  );
end;
$$;

create or replace function public.reverify_session(p_session_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_plan public.schedule_plans;
  v_school public.schools;
  v_start public.session_locations;
  v_end public.session_locations;
  v_radius integer;
  v_max_accuracy integer;
  v_before integer;
  v_after integer;
  v_min_ratio numeric;
  v_start_distance double precision;
  v_end_distance double precision;
  v_planned_minutes numeric;
  v_actual_minutes numeric;
  v_result text;
  v_reason text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not private.is_office_user() then raise exception '재검증 권한이 없습니다.'; end if;

  select * into v_session from public.sessions where id=p_session_id;
  if v_session.id is null then raise exception '수업 실적을 찾을 수 없습니다.'; end if;
  if v_session.session_status <> 'completed'
     or v_session.start_at is null
     or v_session.end_at is null then
    raise exception '완료된 수업만 재검증할 수 있습니다.';
  end if;

  select * into v_plan from public.schedule_plans where id=v_session.schedule_plan_id;
  select * into v_school from public.schools where id=v_plan.school_id;
  select * into v_start from public.session_locations
    where session_id=p_session_id and point_type='start';
  select * into v_end from public.session_locations
    where session_id=p_session_id and point_type='end';

  select
    coalesce(v_school.radius_m, ps.default_location_radius_m),
    ps.max_location_accuracy_m,
    ps.start_window_before_min,
    ps.start_window_after_min,
    ps.min_duration_ratio
  into v_radius, v_max_accuracy, v_before, v_after, v_min_ratio
  from public.program_settings ps where ps.id=1;

  v_start_distance := public.distance_meters(
    v_start.latitude,v_start.longitude,v_school.latitude,v_school.longitude
  );
  v_end_distance := public.distance_meters(
    v_end.latitude,v_end.longitude,v_school.latitude,v_school.longitude
  );
  v_planned_minutes := extract(epoch from (
    v_session.planned_end_at-v_session.planned_start_at
  ))/60.0;
  v_actual_minutes := extract(epoch from (
    v_session.end_at-v_session.start_at
  ))/60.0;

  if v_school.latitude is not null
     and v_school.longitude is not null
     and v_start.id is not null
     and v_end.id is not null
     and v_start_distance <= v_radius
     and v_end_distance <= v_radius
     and (v_start.accuracy_m is null or v_start.accuracy_m <= v_max_accuracy)
     and (v_end.accuracy_m is null or v_end.accuracy_m <= v_max_accuracy)
     and v_session.start_at >= v_session.planned_start_at - make_interval(mins=>v_before)
     and v_session.start_at <= v_session.planned_start_at + make_interval(mins=>v_after)
     and v_actual_minutes >= greatest(10,v_planned_minutes*v_min_ratio)
     and v_actual_minutes <= v_planned_minutes + 120
  then
    v_result := 'auto_verified';
    v_reason := '관리자 재검증: 서버시각·위치·수업시간 자동검증 통과';
  else
    v_result := 'review_required';
    v_reason := concat_ws(' / ',
      case when v_school.latitude is null or v_school.longitude is null then '학교 기준 위치 미등록' end,
      case when v_start.id is null then '시작 위치 기록 없음' end,
      case when v_end.id is null then '종료 위치 기록 없음' end,
      case when v_start.id is not null and v_school.latitude is not null
                and not coalesce(v_start_distance <= v_radius,false) then '시작 위치 확인' end,
      case when v_end.id is not null and v_school.latitude is not null
                and not coalesce(v_end_distance <= v_radius,false) then '종료 위치 확인' end,
      case when v_start.accuracy_m is not null and v_start.accuracy_m > v_max_accuracy
           then '시작 GPS 정확도 확인' end,
      case when v_end.accuracy_m is not null and v_end.accuracy_m > v_max_accuracy
           then '종료 GPS 정확도 확인' end,
      case when v_session.start_at < v_session.planned_start_at - make_interval(mins=>v_before)
             or v_session.start_at > v_session.planned_start_at + make_interval(mins=>v_after)
           then '계획시간 대비 시작시각 확인' end,
      case when v_actual_minutes < greatest(10,v_planned_minutes*v_min_ratio)
             or v_actual_minutes > v_planned_minutes + 120
           then '실제 활동시간 확인' end
    );
    if coalesce(v_reason,'')='' then
      v_reason := '자동검증 조건 확인 필요';
    end if;
  end if;

  update public.sessions
  set verification_state=v_result,
      verification_reason=v_reason
  where id=p_session_id;

  return v_result;
end;
$$;

create or replace function public.approve_session_payment(p_session_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_state text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not (private.has_role('admin') or private.has_role('supervisor')) then
    raise exception '지급 승인 권한이 없습니다.';
  end if;

  select verification_state into v_state
  from public.sessions where id=p_session_id;

  if v_state not in ('auto_verified','confirmed') then
    raise exception '검증 완료 실적만 지급 승인할 수 있습니다.';
  end if;

  update public.sessions
  set settlement_state='approved'
  where id=p_session_id;

  return 'approved';
end;
$$;

revoke all on function public.set_school_baseline_location(uuid,double precision,double precision,double precision)
  from public, anon;
revoke all on function public.reverify_session(uuid) from public, anon;
revoke all on function public.approve_session_payment(uuid) from public, anon;

grant execute on function public.set_school_baseline_location(uuid,double precision,double precision,double precision)
  to authenticated;
grant execute on function public.reverify_session(uuid) to authenticated;
grant execute on function public.approve_session_payment(uuid) to authenticated;

revoke update on public.sessions from authenticated;
grant update (verification_state, verification_reason, settlement_state)
  on public.sessions to authenticated;


-- ---------- V14.5 Kakao/offline invitation ----------
create sequence if not exists public.supporter_mobile_id_seq start with 2 increment by 1;

create table if not exists public.supporter_invitations (
  id uuid primary key default gen_random_uuid(),
  invitee_name text not null,
  email text not null,
  invite_token_hash text not null unique,
  approval_code_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','redeemed','revoked','expired','locked')),
  expires_at timestamptz not null,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_attempt_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_user_id uuid references auth.users(id)
);

create index if not exists supporter_invitations_status_idx
  on public.supporter_invitations(status, expires_at);
create index if not exists supporter_invitations_email_idx
  on public.supporter_invitations(lower(email));

alter table public.supporter_invitations enable row level security;

drop policy if exists supporter_invitations_select on public.supporter_invitations;
create policy supporter_invitations_select
on public.supporter_invitations
for select
to authenticated
using (private.has_role('admin') or private.has_role('supervisor'));

drop policy if exists supporter_invitations_insert on public.supporter_invitations;
create policy supporter_invitations_insert
on public.supporter_invitations
for insert
to authenticated
with check (
  (private.has_role('admin') or private.has_role('supervisor'))
  and created_by = (select auth.uid())
);

drop policy if exists supporter_invitations_update on public.supporter_invitations;
create policy supporter_invitations_update
on public.supporter_invitations
for update
to authenticated
using (private.has_role('admin') or private.has_role('supervisor'))
with check (private.has_role('admin') or private.has_role('supervisor'));

grant select, insert, update on public.supporter_invitations to authenticated;
revoke all on public.supporter_invitations from anon;

create or replace function public.create_supporter_invitation(
  p_name text,
  p_email text,
  p_expires_hours integer default 48
)
returns table(
  invitation_id uuid,
  invite_token text,
  approval_code text,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_token text;
  v_code text;
  v_id uuid;
  v_expires timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not (private.has_role('admin') or private.has_role('supervisor')) then
    raise exception '초대 생성 권한이 없습니다.';
  end if;
  if length(v_name) < 2 then
    raise exception '이름을 확인해 주세요.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 형식을 확인해 주세요.';
  end if;
  if p_expires_hours is null or p_expires_hours < 1 or p_expires_hours > 168 then
    raise exception '유효시간은 1~168시간 범위여야 합니다.';
  end if;

  update public.supporter_invitations
  set status='revoked'
  where lower(email)=v_email
    and status='pending';

  v_token := encode(extensions.gen_random_bytes(24),'hex');
  v_code := lpad((floor(random()*1000000))::integer::text,6,'0');
  v_expires := now() + make_interval(hours => p_expires_hours);

  insert into public.supporter_invitations(
    invitee_name,email,invite_token_hash,approval_code_hash,status,
    expires_at,max_attempts,failed_attempts,created_by
  )
  values(
    v_name,
    v_email,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    encode(extensions.digest(v_code,'sha256'),'hex'),
    'pending',
    v_expires,
    5,
    0,
    (select auth.uid())
  )
  returning id into v_id;

  return query
  select v_id, v_token, v_code, v_expires;
end;
$$;

revoke all on function public.create_supporter_invitation(text,text,integer)
  from public, anon;
grant execute on function public.create_supporter_invitation(text,text,integer)
  to authenticated;

create or replace function public.complete_supporter_invitation(
  p_invitation_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_inv public.supporter_invitations;
  v_email text;
  v_mobile_id text;
begin
  select * into v_inv
  from public.supporter_invitations
  where id=p_invitation_id
  for update;

  if v_inv.id is null then raise exception '초대를 찾을 수 없습니다.'; end if;
  if v_inv.status <> 'pending' then raise exception '사용할 수 없는 초대입니다.'; end if;

  if v_inv.expires_at <= now() then
    update public.supporter_invitations set status='expired' where id=v_inv.id;
    raise exception '초대 유효시간이 만료되었습니다.';
  end if;

  select lower(email) into v_email
  from auth.users
  where id=p_user_id;

  if v_email is null or v_email <> lower(v_inv.email) then
    raise exception '초대 이메일과 계정 이메일이 일치하지 않습니다.';
  end if;

  v_mobile_id := 'JCEC-LS-' || to_char(now() at time zone 'Asia/Seoul','YYYY')
    || '-' || lpad(nextval('public.supporter_mobile_id_seq')::text,4,'0');

  update public.profiles
  set display_name=v_inv.invitee_name,
      roles=array['supporter']::text[],
      active=true,
      identity_verified=true,
      identity_verified_at=now(),
      mobile_id_no=coalesce(mobile_id_no,v_mobile_id),
      mobile_id_issued_at=coalesce(mobile_id_issued_at,now()),
      mobile_id_active=true,
      updated_at=now()
  where id=p_user_id;

  if not found then
    raise exception '사용자 프로필을 찾을 수 없습니다.';
  end if;

  update public.supporter_invitations
  set status='redeemed',
      redeemed_at=now(),
      redeemed_user_id=p_user_id,
      last_attempt_at=now()
  where id=v_inv.id;

  return jsonb_build_object(
    'ok',true,
    'user_id',p_user_id,
    'mobile_id_no',(select mobile_id_no from public.profiles where id=p_user_id)
  );
end;
$$;

revoke all on function public.complete_supporter_invitation(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.complete_supporter_invitation(uuid,uuid)
  to service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, display_name, roles, active)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name',''),
      split_part(coalesce(new.email,''),'@',1),
      '사용자'
    ),
    array['supporter']::text[],
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
