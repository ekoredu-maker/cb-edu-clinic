-- V14 Realtime Operations / Supabase schema
-- 실행 전 Supabase SQL Editor에서 검토 후 적용
-- 실제 기관명/요율/위치반경은 program_settings에서 설정한다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_staff_id text,
  display_name text not null,
  phone text,
  roles text[] not null default array['supporter']::text[],
  identity_verified boolean not null default false,
  identity_verified_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_legacy_staff_id_uq
on public.profiles(legacy_staff_id)
where legacy_staff_id is not null;

create table if not exists public.program_settings (
  id integer primary key default 1 check (id = 1),
  org_name text not null default '○○교육지원청',
  coach_rate integer not null default 40000,
  class_rate integer not null default 30000,
  travel_long_rate integer not null default 20000,
  travel_short_rate integer not null default 10000,
  tax_pct numeric(5,2) not null default 3.30,
  default_location_radius_m integer not null default 250,
  start_window_before_min integer not null default 60,
  start_window_after_min integer not null default 90,
  min_duration_ratio numeric(5,2) not null default 0.50,
  updated_at timestamptz not null default now()
);

insert into public.program_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  legacy_school_code text,
  name text not null,
  latitude double precision,
  longitude double precision,
  radius_m integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists schools_legacy_school_code_uq
on public.schools(legacy_school_code)
where legacy_school_code is not null;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  legacy_student_id text,
  school_id uuid references public.schools(id),
  full_name text not null,
  alias text,
  school_type text,
  grade integer,
  class_no integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_legacy_student_id_uq
on public.students(legacy_student_id)
where legacy_student_id is not null;

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
  updated_at timestamptz not null default now()
);

create unique index if not exists assignments_legacy_matching_id_uq
on public.assignments(legacy_matching_id)
where legacy_matching_id is not null;

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
  check (specific_date is not null or weekday is not null)
);

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
  unique(schedule_plan_id, work_date)
);

create table if not exists public.session_locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  point_type text not null check (point_type in ('start','end')),
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  distance_m double precision,
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

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_roles text[] not null default array['supporter','counselor','admin','supervisor']::text[],
  published boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
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

-- ---------- helper functions ----------

create or replace function public.has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and role_name = any(p.roles)
  );
$$;

create or replace function public.is_office_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('counselor')
      or public.has_role('admin')
      or public.has_role('supervisor');
$$;

create or replace function public.distance_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
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
set search_path = public
as $$
declare
  v_plan public.schedule_plans;
  v_assignment public.assignments;
  v_school public.schools;
  v_session_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_distance double precision;
  v_radius integer;
begin
  select * into v_plan from public.schedule_plans
  where id = p_schedule_plan_id and active = true;

  if v_plan.id is null then
    raise exception '활성 시간표를 찾을 수 없습니다.';
  end if;

  select * into v_assignment from public.assignments
  where id = v_plan.assignment_id and status = 'active';

  if v_assignment.id is null or v_assignment.supporter_id <> auth.uid() then
    raise exception '이 수업을 시작할 권한이 없습니다.';
  end if;

  if v_plan.specific_date is not null and v_plan.specific_date <> v_today then
    raise exception '오늘 수업이 아닙니다.';
  end if;

  if v_plan.specific_date is null
     and v_plan.weekday <> extract(isodow from v_today)::smallint then
    raise exception '오늘 수업이 아닙니다.';
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
    now(),
    'in_progress'
  )
  on conflict(schedule_plan_id, work_date)
  do update set
    start_at = coalesce(public.sessions.start_at, now()),
    session_status = case
      when public.sessions.session_status = 'completed' then public.sessions.session_status
      else 'in_progress'
    end,
    updated_at = now()
  returning id into v_session_id;

  select * into v_school from public.schools where id = v_plan.school_id;
  select coalesce(v_school.radius_m, ps.default_location_radius_m)
    into v_radius
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
    v_session_id, 'start', p_latitude, p_longitude, p_accuracy_m,
    v_distance,
    case when v_distance is null then null else v_distance <= v_radius end,
    now()
  )
  on conflict(session_id, point_type)
  do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    distance_m = excluded.distance_m,
    within_radius = excluded.within_radius,
    captured_at = now();

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail)
  values(auth.uid(), 'session_start', 'session', v_session_id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m));

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
set search_path = public
as $$
declare
  v_session public.sessions;
  v_plan public.schedule_plans;
  v_school public.schools;
  v_start_loc public.session_locations;
  v_distance double precision;
  v_radius integer;
  v_planned_minutes numeric;
  v_actual_minutes numeric;
  v_min_ratio numeric;
  v_result text;
begin
  select * into v_session from public.sessions where id = p_session_id;

  if v_session.id is null or v_session.supporter_id <> auth.uid() then
    raise exception '이 수업을 종료할 권한이 없습니다.';
  end if;

  if v_session.start_at is null then
    raise exception '시작 기록이 없습니다.';
  end if;

  select * into v_plan from public.schedule_plans where id = v_session.schedule_plan_id;
  select * into v_school from public.schools where id = v_plan.school_id;
  select coalesce(v_school.radius_m, ps.default_location_radius_m), ps.min_duration_ratio
    into v_radius, v_min_ratio
  from public.program_settings ps where ps.id = 1;

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
    now()
  )
  on conflict(session_id, point_type)
  do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    distance_m = excluded.distance_m,
    within_radius = excluded.within_radius,
    captured_at = now();

  select * into v_start_loc
  from public.session_locations
  where session_id = p_session_id and point_type = 'start';

  v_planned_minutes := extract(epoch from (v_session.planned_end_at - v_session.planned_start_at)) / 60.0;
  v_actual_minutes := extract(epoch from (now() - v_session.start_at)) / 60.0;

  if coalesce(v_start_loc.within_radius, false)
     and coalesce(v_distance <= v_radius, false)
     and v_actual_minutes > 0
     and v_actual_minutes >= greatest(10, v_planned_minutes * v_min_ratio)
     and v_actual_minutes <= v_planned_minutes + 120 then
    v_result := 'auto_verified';
  else
    v_result := 'review_required';
  end if;

  update public.sessions
  set end_at = now(),
      session_status = 'completed',
      verification_state = v_result,
      verification_reason = case
        when v_result = 'auto_verified' then '서버시각·위치·수업시간 자동검증 통과'
        else '위치 또는 수업시간 확인 필요'
      end,
      updated_at = now()
  where id = p_session_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail)
  values(auth.uid(), 'session_end', 'session', p_session_id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m, 'verification', v_result));

  return v_result;
end;
$$;

-- ---------- RLS ----------

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
create policy profiles_select on public.profiles for select
using (id = auth.uid() or public.is_office_user());

drop policy if exists settings_select on public.program_settings;
create policy settings_select on public.program_settings for select
using (public.is_office_user());

drop policy if exists settings_write on public.program_settings;
create policy settings_write on public.program_settings for all
using (public.has_role('admin') or public.has_role('supervisor'))
with check (public.has_role('admin') or public.has_role('supervisor'));

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools for select
using (
  public.is_office_user()
  or exists (
    select 1 from public.assignments a
    join public.students s on s.id = a.student_id
    where a.supporter_id = auth.uid()
      and a.status = 'active'
      and s.school_id = schools.id
  )
);

drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for all
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists students_select on public.students;
create policy students_select on public.students for select
using (
  public.is_office_user()
  or exists (
    select 1 from public.assignments a
    where a.student_id = students.id
      and a.supporter_id = auth.uid()
      and a.status = 'active'
  )
);

drop policy if exists students_write on public.students;
create policy students_write on public.students for all
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select
using (public.is_office_user() or supporter_id = auth.uid());

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists plans_select on public.schedule_plans;
create policy plans_select on public.schedule_plans for select
using (
  public.is_office_user()
  or exists (
    select 1 from public.assignments a
    where a.id = schedule_plans.assignment_id
      and a.supporter_id = auth.uid()
  )
);

drop policy if exists plans_write on public.schedule_plans;
create policy plans_write on public.schedule_plans for all
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select
using (public.is_office_user() or supporter_id = auth.uid());

drop policy if exists sessions_office_update on public.sessions;
create policy sessions_office_update on public.sessions for update
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists locations_select on public.session_locations;
create policy locations_select on public.session_locations for select
using (
  public.is_office_user()
  or exists (
    select 1 from public.sessions s
    where s.id = session_locations.session_id
      and s.supporter_id = auth.uid()
  )
);

drop policy if exists lessons_select on public.lesson_records;
create policy lessons_select on public.lesson_records for select
using (public.is_office_user() or supporter_id = auth.uid());

drop policy if exists lessons_insert on public.lesson_records;
create policy lessons_insert on public.lesson_records for insert
with check (
  supporter_id = auth.uid()
  and exists (
    select 1 from public.sessions s
    where s.id = lesson_records.session_id
      and s.supporter_id = auth.uid()
  )
);

drop policy if exists lessons_update on public.lesson_records;
create policy lessons_update on public.lesson_records for update
using (supporter_id = auth.uid() or public.is_office_user())
with check (supporter_id = auth.uid() or public.is_office_user());

drop policy if exists counseling_select on public.counseling_records;
create policy counseling_select on public.counseling_records for select
using (
  public.is_office_user()
  or author_id = auth.uid()
);

drop policy if exists counseling_insert on public.counseling_records;
create policy counseling_insert on public.counseling_records for insert
with check (
  author_id = auth.uid()
  and (
    public.is_office_user()
    or exists (
      select 1 from public.assignments a
      where a.student_id = counseling_records.student_id
        and a.supporter_id = auth.uid()
        and a.status = 'active'
    )
  )
);

drop policy if exists requests_select on public.change_requests;
create policy requests_select on public.change_requests for select
using (public.is_office_user() or requester_id = auth.uid());

drop policy if exists requests_insert on public.change_requests;
create policy requests_insert on public.change_requests for insert
with check (requester_id = auth.uid());

drop policy if exists requests_office_update on public.change_requests;
create policy requests_office_update on public.change_requests for update
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists notices_select on public.notices;
create policy notices_select on public.notices for select
using (
  public.is_office_user()
  or (
    published = true
    and (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.roles && notices.target_roles
    )
  )
);

drop policy if exists notices_write on public.notices;
create policy notices_write on public.notices for all
using (public.is_office_user())
with check (public.is_office_user());

drop policy if exists notice_reads_rw on public.notice_reads;
create policy notice_reads_rw on public.notice_reads for all
using (user_id = auth.uid() or public.is_office_user())
with check (user_id = auth.uid() or public.is_office_user());

drop policy if exists push_rw on public.push_subscriptions;
create policy push_rw on public.push_subscriptions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select
using (public.has_role('admin') or public.has_role('supervisor'));
