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
as $function$
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
  v_has_school_baseline boolean;
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
  v_has_school_baseline := v_school.latitude is not null and v_school.longitude is not null;

  select
    coalesce(v_school.radius_m, ps.default_location_radius_m),
    ps.max_location_accuracy_m,
    ps.start_window_before_min,
    ps.start_window_after_min,
    ps.min_duration_ratio
  into v_radius, v_max_accuracy, v_before, v_after, v_min_ratio
  from public.program_settings ps where ps.id = 1;

  v_distance := public.distance_meters(
    p_latitude, p_longitude, v_school.latitude, v_school.longitude
  );

  insert into public.session_locations(
    session_id, point_type, latitude, longitude, accuracy_m, distance_m, within_radius, captured_at
  )
  values(
    p_session_id, 'end', p_latitude, p_longitude, p_accuracy_m, v_distance,
    case when v_distance is null then null else v_distance <= v_radius end, v_now
  )
  on conflict(session_id, point_type) do nothing;

  select * into v_start_loc
  from public.session_locations
  where session_id = p_session_id and point_type = 'start';

  v_planned_minutes := extract(epoch from (v_session.planned_end_at - v_session.planned_start_at)) / 60.0;
  v_actual_minutes := extract(epoch from (v_now - v_session.start_at)) / 60.0;

  if v_has_school_baseline
     and v_start_loc.id is not null
     and coalesce(v_start_loc.within_radius, false)
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
      case when not v_has_school_baseline then '학교 기준 위치 미등록' end,
      case when v_start_loc.id is null then '시작 위치 기록 없음' end,
      case when v_has_school_baseline and v_start_loc.id is not null
                 and not coalesce(v_start_loc.within_radius,false)
           then '시작 위치 확인' end,
      case when v_has_school_baseline and not coalesce(v_distance <= v_radius,false)
           then '종료 위치 확인' end,
      case when v_start_loc.accuracy_m is not null and v_start_loc.accuracy_m > v_max_accuracy
           then '시작 GPS 정확도 확인' end,
      case when p_accuracy_m is not null and p_accuracy_m > v_max_accuracy
           then '종료 GPS 정확도 확인' end,
      case when v_session.start_at < v_session.planned_start_at - make_interval(mins => v_before)
             or v_session.start_at > v_session.planned_start_at + make_interval(mins => v_after)
           then '계획시간 대비 시작시각 확인' end,
      case when v_actual_minutes < greatest(10, v_planned_minutes * v_min_ratio)
             or v_actual_minutes > v_planned_minutes + 120
           then '실제 활동시간 확인' end
    );
    if coalesce(v_reason,'') = '' then v_reason := '자동검증 조건 확인 필요'; end if;
  end if;

  update public.sessions
  set end_at = v_now,
      session_status = 'completed',
      verification_state = v_result,
      verification_reason = v_reason,
      updated_at = v_now
  where id = p_session_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail)
  values(v_uid, 'session_end', 'session', p_session_id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m,
                       'actual_minutes', v_actual_minutes, 'verification', v_result));

  return v_result;
end;
$function$;

revoke execute on function public.end_session(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.end_session(uuid,double precision,double precision,double precision) to authenticated;

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
  v_code_bytes bytea;
  v_code_num bigint;
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
  v_code_bytes := extensions.gen_random_bytes(4);
  v_code_num :=
      get_byte(v_code_bytes,0)::bigint * 16777216
    + get_byte(v_code_bytes,1)::bigint * 65536
    + get_byte(v_code_bytes,2)::bigint * 256
    + get_byte(v_code_bytes,3)::bigint;
  v_code := lpad((v_code_num % 1000000)::text,6,'0');
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


-- ---------- V14 student roster import ----------
alter table public.students
  add column if not exists preferred_support_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.students'::regclass
      and conname='students_preferred_support_type_check'
  ) then
    alter table public.students
      add constraint students_preferred_support_type_check
      check (
        preferred_support_type is null
        or preferred_support_type in ('coach','class','counseling')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.students'::regclass
      and conname='students_school_type_check'
  ) then
    alter table public.students
      add constraint students_school_type_check
      check (
        school_type is null
        or school_type in ('초','중','고','특수','기타')
      );
  end if;
end $$;

create unique index if not exists students_legacy_student_id_uq
  on public.students(legacy_student_id)
  where legacy_student_id is not null;

create or replace function public.bulk_register_students(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item jsonb;
  v_school_id uuid;
  v_name text;
  v_alias text;
  v_school_type text;
  v_grade integer;
  v_class_no integer;
  v_support text;
  v_active boolean;
  v_legacy text;
  v_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_reason text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not private.is_office_user() then
    raise exception '학생 명부 등록 권한이 없습니다.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '학생 명부 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200 then
    raise exception '한 번에 1~200명만 등록할 수 있습니다.';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_reason := null;
    v_school_id := nullif(v_item->>'school_id','')::uuid;
    v_name := btrim(coalesce(v_item->>'full_name',''));
    v_alias := nullif(btrim(coalesce(v_item->>'alias','')),'');
    v_school_type := nullif(btrim(coalesce(v_item->>'school_type','')),'');
    v_grade := nullif(v_item->>'grade','')::integer;
    v_class_no := nullif(v_item->>'class_no','')::integer;
    v_support := coalesce(nullif(btrim(coalesce(v_item->>'preferred_support_type','')),''),'coach');
    v_active := coalesce((v_item->>'active')::boolean,true);
    v_legacy := nullif(btrim(coalesce(v_item->>'legacy_student_id','')),'');

    if v_school_id is null then
      raise exception '학교 정보가 없는 학생이 있습니다.';
    end if;
    if not exists (
      select 1 from public.schools
      where id=v_school_id and active=true
    ) then
      raise exception '등록되지 않았거나 비활성 학교가 포함되어 있습니다.';
    end if;
    if v_name='' then
      raise exception '학생명이 없는 자료가 있습니다.';
    end if;
    if v_school_type not in ('초','중','고','특수','기타') then
      raise exception '학교급 값이 올바르지 않습니다.';
    end if;
    if v_grade is null or v_grade < 1
       or (v_school_type='초' and v_grade>6)
       or (v_school_type in ('중','고') and v_grade>3)
       or (v_school_type in ('특수','기타') and v_grade>12)
    then
      raise exception '학년 값이 학교급 범위와 맞지 않습니다.';
    end if;
    if v_class_no is null or v_class_no < 1 or v_class_no > 99 then
      raise exception '반 값은 1~99 범위여야 합니다.';
    end if;
    if v_support not in ('coach','class','counseling') then
      raise exception '희망 지원유형 값이 올바르지 않습니다.';
    end if;

    if v_legacy is not null and exists (
      select 1 from public.students where legacy_student_id=v_legacy
    ) then
      v_reason := '기존 학생ID';
    elsif exists (
      select 1
      from public.students
      where school_id=v_school_id
        and full_name=v_name
        and grade=v_grade
        and class_no=v_class_no
        and active=true
    ) then
      v_reason := '동일 학교·학생명·학년·반 중복 후보';
    end if;

    if v_reason is not null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok',false,'full_name',v_name,'reason',v_reason
      ));
      continue;
    end if;

    insert into public.students(
      legacy_student_id,school_id,full_name,alias,school_type,
      grade,class_no,preferred_support_type,active
    )
    values(
      v_legacy,v_school_id,v_name,v_alias,v_school_type,
      v_grade,v_class_no,v_support,v_active
    )
    returning id into v_id;

    v_inserted := v_inserted + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'ok',true,'id',v_id,'full_name',v_name
    ));
  end loop;

  return jsonb_build_object(
    'ok',true,
    'inserted',v_inserted,
    'skipped',v_skipped,
    'results',v_results
  );
end;
$$;

revoke all on function public.bulk_register_students(jsonb)
  from public, anon;
grant execute on function public.bulk_register_students(jsonb)
  to authenticated;


-- ---------- V14 supporter-student matching ----------
create sequence if not exists public.assignment_legacy_seq start with 1 increment by 1;

create unique index if not exists assignments_legacy_matching_id_uq
  on public.assignments(legacy_matching_id)
  where legacy_matching_id is not null;

create unique index if not exists assignments_one_active_per_student_kind_uq
  on public.assignments(student_id, kind)
  where status='active';

create or replace function public.match_supporter_student(
  p_supporter_id uuid,
  p_student_id uuid,
  p_kind text,
  p_started_on date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_supporter public.profiles;
  v_student public.students;
  v_existing public.assignments;
  v_started date := coalesce(p_started_on, (now() at time zone 'Asia/Seoul')::date);
  v_id uuid;
  v_legacy text;
begin
  if v_actor is null then raise exception '로그인이 필요합니다.'; end if;
  if not private.is_office_user() then raise exception '학생 배정 권한이 없습니다.'; end if;
  if p_kind not in ('coach','class') then
    raise exception '지원유형은 학습코칭 또는 수업지원이어야 합니다.';
  end if;
  if v_started > (now() at time zone 'Asia/Seoul')::date then
    raise exception '배정 시작일은 미래일 수 없습니다.';
  end if;

  select * into v_supporter from public.profiles where id=p_supporter_id;
  if v_supporter.id is null or not v_supporter.active then
    raise exception '활성 학습지원단원을 찾을 수 없습니다.';
  end if;
  if not ('supporter' = any(v_supporter.roles)) then
    raise exception '학습지원단 역할이 없는 사용자입니다.';
  end if;

  select * into v_student from public.students where id=p_student_id;
  if v_student.id is null or not v_student.active then
    raise exception '활성 학생을 찾을 수 없습니다.';
  end if;

  select * into v_existing
  from public.assignments
  where student_id=p_student_id
    and kind=p_kind
    and status='active'
  limit 1;

  if v_existing.id is not null then
    if v_existing.supporter_id=p_supporter_id then
      return jsonb_build_object(
        'ok',true,
        'existing',true,
        'assignment_id',v_existing.id,
        'legacy_matching_id',v_existing.legacy_matching_id
      );
    end if;
    raise exception '이미 동일 지원유형으로 다른 지원단원에게 배정된 학생입니다.';
  end if;

  v_legacy := 'JCEC-MAT-' || to_char(v_started,'YYYY')
    || '-' || lpad(nextval('public.assignment_legacy_seq')::text,5,'0');

  insert into public.assignments(
    legacy_matching_id,supporter_id,student_id,kind,status,started_on
  )
  values(
    v_legacy,p_supporter_id,p_student_id,p_kind,'active',v_started
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'existing',false,
    'assignment_id',v_id,
    'legacy_matching_id',v_legacy,
    'started_on',v_started
  );
end;
$$;

create or replace function public.end_student_assignment(
  p_assignment_id uuid,
  p_ended_on date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_assignment public.assignments;
  v_ended date := coalesce(p_ended_on, (now() at time zone 'Asia/Seoul')::date);
begin
  if v_actor is null then raise exception '로그인이 필요합니다.'; end if;
  if not private.is_office_user() then raise exception '배정 종료 권한이 없습니다.'; end if;

  select * into v_assignment
  from public.assignments
  where id=p_assignment_id
  for update;

  if v_assignment.id is null then raise exception '배정 정보를 찾을 수 없습니다.'; end if;
  if v_assignment.status <> 'active' then raise exception '활성 배정만 종료할 수 있습니다.'; end if;
  if v_assignment.started_on is not null and v_ended < v_assignment.started_on then
    raise exception '종료일은 시작일보다 빠를 수 없습니다.';
  end if;
  if v_ended > (now() at time zone 'Asia/Seoul')::date then
    raise exception '종료일은 미래일 수 없습니다.';
  end if;

  update public.assignments
  set status='ended',ended_on=v_ended,updated_at=now()
  where id=p_assignment_id;

  update public.schedule_plans
  set active=false,updated_at=now()
  where assignment_id=p_assignment_id
    and active=true;

  return jsonb_build_object(
    'ok',true,
    'assignment_id',p_assignment_id,
    'ended_on',v_ended
  );
end;
$$;

revoke all on function public.match_supporter_student(uuid,uuid,text,date)
  from public, anon;
revoke all on function public.end_student_assignment(uuid,date)
  from public, anon;

grant execute on function public.match_supporter_student(uuid,uuid,text,date)
  to authenticated;
grant execute on function public.end_student_assignment(uuid,date)
  to authenticated;


-- ---------- V14 schedule management ----------
alter table public.schedule_plans
  drop constraint if exists schedule_plans_mode_exactly_one_check;

alter table public.schedule_plans
  add constraint schedule_plans_mode_exactly_one_check
  check ((specific_date is null) <> (weekday is null));

create or replace function public.enforce_schedule_plan_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_assignment public.assignments;
  v_conflict record;
  v_effective_from date;
  v_effective_to date;
begin
  if tg_op='UPDATE' and old.active=true and new.active=false then
    return new;
  end if;

  if not new.active then
    return new;
  end if;

  select * into v_assignment
  from public.assignments
  where id=new.assignment_id;

  if v_assignment.id is null or v_assignment.status <> 'active' then
    raise exception '활성 배정에만 시간표를 만들 수 있습니다.';
  end if;

  if new.school_id is null or not exists (
    select 1 from public.schools
    where id=new.school_id and active=true
  ) then
    raise exception '활성 학교를 선택해 주세요.';
  end if;

  if nullif(btrim(coalesce(new.place,'')),'') is null then
    raise exception '수업 장소를 입력해 주세요.';
  end if;

  if new.planned_end <= new.planned_start then
    raise exception '종료시간은 시작시간보다 늦어야 합니다.';
  end if;

  if (new.specific_date is null) = (new.weekday is null) then
    raise exception '특정일 또는 반복 요일 중 하나만 지정해야 합니다.';
  end if;

  if new.specific_date is not null then
    new.effective_from := new.specific_date;
    new.effective_to := new.specific_date;

    if v_assignment.started_on is not null
       and new.specific_date < v_assignment.started_on then
      raise exception '특정일은 배정 시작일보다 빠를 수 없습니다.';
    end if;
  else
    if new.weekday < 1 or new.weekday > 7 then
      raise exception '요일 값이 올바르지 않습니다.';
    end if;
    if new.effective_from is null or new.effective_to is null then
      raise exception '반복 시간표는 적용 시작일과 종료일이 필요합니다.';
    end if;
    if new.effective_to < new.effective_from then
      raise exception '적용 종료일은 시작일보다 빠를 수 없습니다.';
    end if;
    if v_assignment.started_on is not null
       and new.effective_from < v_assignment.started_on then
      raise exception '적용 시작일은 배정 시작일보다 빠를 수 없습니다.';
    end if;
  end if;

  v_effective_from := coalesce(new.specific_date,new.effective_from);
  v_effective_to := coalesce(new.specific_date,new.effective_to);

  select
    sp.id,
    sp.planned_start,
    sp.planned_end,
    sp.specific_date,
    sp.weekday,
    a.supporter_id,
    a.student_id,
    (a.supporter_id=v_assignment.supporter_id) as supporter_conflict,
    (a.student_id=v_assignment.student_id) as student_conflict
  into v_conflict
  from public.schedule_plans sp
  join public.assignments a on a.id=sp.assignment_id
  where sp.active=true
    and a.status='active'
    and (tg_op='INSERT' or sp.id<>new.id)
    and (a.supporter_id=v_assignment.supporter_id
         or a.student_id=v_assignment.student_id)
    and sp.planned_start < new.planned_end
    and sp.planned_end > new.planned_start
    and (
      (
        new.specific_date is not null
        and (
          sp.specific_date=new.specific_date
          or (
            sp.specific_date is null
            and sp.weekday=extract(isodow from new.specific_date)::int
            and new.specific_date between sp.effective_from and sp.effective_to
          )
        )
      )
      or
      (
        new.specific_date is null
        and (
          (
            sp.specific_date is not null
            and extract(isodow from sp.specific_date)::int=new.weekday
            and sp.specific_date between v_effective_from and v_effective_to
          )
          or
          (
            sp.specific_date is null
            and sp.weekday=new.weekday
            and daterange(sp.effective_from,sp.effective_to,'[]')
                && daterange(v_effective_from,v_effective_to,'[]')
          )
        )
      )
    )
  order by sp.created_at
  limit 1;

  if v_conflict.id is not null then
    if v_conflict.supporter_conflict and v_conflict.student_conflict then
      raise exception '시간표 충돌: 같은 지원단원과 학생의 기존 일정이 겹칩니다. (%~%)',
        left(v_conflict.planned_start::text,5),
        left(v_conflict.planned_end::text,5);
    elsif v_conflict.supporter_conflict then
      raise exception '시간표 충돌: 지원단원의 기존 일정이 겹칩니다. (%~%)',
        left(v_conflict.planned_start::text,5),
        left(v_conflict.planned_end::text,5);
    else
      raise exception '시간표 충돌: 학생의 기존 일정이 겹칩니다. (%~%)',
        left(v_conflict.planned_start::text,5),
        left(v_conflict.planned_end::text,5);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_schedule_plan_integrity on public.schedule_plans;
create trigger trg_schedule_plan_integrity
before insert or update of assignment_id,school_id,specific_date,weekday,
  planned_start,planned_end,place,effective_from,effective_to,active
on public.schedule_plans
for each row
execute function public.enforce_schedule_plan_integrity();

create or replace function public.create_schedule_plan_checked(
  p_assignment_id uuid,
  p_mode text,
  p_planned_start time,
  p_planned_end time,
  p_place text,
  p_school_id uuid,
  p_weekday smallint default null,
  p_specific_date date default null,
  p_effective_from date default null,
  p_effective_to date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not private.is_office_user() then
    raise exception '시간표 생성 권한이 없습니다.';
  end if;
  if p_mode not in ('recurring','specific') then
    raise exception '시간표 유형이 올바르지 않습니다.';
  end if;

  if p_mode='specific' then
    if p_specific_date is null then
      raise exception '특정일을 선택해 주세요.';
    end if;
    insert into public.schedule_plans(
      assignment_id,school_id,specific_date,weekday,
      planned_start,planned_end,place,effective_from,effective_to,active
    )
    values(
      p_assignment_id,p_school_id,p_specific_date,null,
      p_planned_start,p_planned_end,btrim(p_place),
      p_specific_date,p_specific_date,true
    )
    returning id into v_id;
  else
    if p_weekday is null or p_effective_from is null or p_effective_to is null then
      raise exception '반복 요일과 적용기간을 입력해 주세요.';
    end if;
    insert into public.schedule_plans(
      assignment_id,school_id,specific_date,weekday,
      planned_start,planned_end,place,effective_from,effective_to,active
    )
    values(
      p_assignment_id,p_school_id,null,p_weekday,
      p_planned_start,p_planned_end,btrim(p_place),
      p_effective_from,p_effective_to,true
    )
    returning id into v_id;
  end if;

  return jsonb_build_object('ok',true,'schedule_plan_id',v_id);
end;
$$;

create or replace function public.deactivate_schedule_plan(
  p_schedule_plan_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not private.is_office_user() then
    raise exception '시간표 관리 권한이 없습니다.';
  end if;

  if not exists (
    select 1 from public.schedule_plans
    where id=p_schedule_plan_id
  ) then
    raise exception '시간표를 찾을 수 없습니다.';
  end if;

  if exists (
    select 1 from public.sessions
    where schedule_plan_id=p_schedule_plan_id
      and session_status='in_progress'
  ) then
    raise exception '현재 진행 중인 수업이 있어 시간표를 비활성화할 수 없습니다.';
  end if;

  update public.schedule_plans
  set active=false,updated_at=now()
  where id=p_schedule_plan_id and active=true;

  return jsonb_build_object('ok',true,'schedule_plan_id',p_schedule_plan_id);
end;
$$;

revoke all on function public.create_schedule_plan_checked(
  uuid,text,time,time,text,uuid,smallint,date,date,date
) from public, anon;
revoke all on function public.deactivate_schedule_plan(uuid)
  from public, anon;

grant execute on function public.create_schedule_plan_checked(
  uuid,text,time,time,text,uuid,smallint,date,date,date
) to authenticated;
grant execute on function public.deactivate_schedule_plan(uuid)
  to authenticated;


-- ---------- V14 verification resolution ----------
create or replace function public.resolve_session_verification(
  p_session_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_state text;
  v_reason text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.is_office_user() then
    raise exception '검증상태 처리 권한이 없습니다.';
  end if;

  select * into v_session
  from public.sessions
  where id=p_session_id
  for update;

  if v_session.id is null then
    raise exception '수업 실적을 찾을 수 없습니다.';
  end if;

  if v_session.session_status <> 'completed' then
    raise exception '완료된 수업만 검증상태를 처리할 수 있습니다.';
  end if;

  if v_session.settlement_state <> 'pending' then
    raise exception '지급 승인 이후에는 검증상태를 변경할 수 없습니다.';
  end if;

  case p_action
    when 'confirm' then
      v_state := 'confirmed';
      v_reason := coalesce(nullif(btrim(p_reason),''),'담당자 확인 완료');
    when 'reject' then
      if nullif(btrim(p_reason),'') is null then
        raise exception '반려 사유를 입력해 주세요.';
      end if;
      v_state := 'rejected';
      v_reason := btrim(p_reason);
    when 'review' then
      v_state := 'review_required';
      v_reason := coalesce(nullif(btrim(p_reason),''),'담당자 재검토로 전환');
    else
      raise exception '지원하지 않는 검증 처리입니다.';
  end case;

  update public.sessions
  set verification_state=v_state,
      verification_reason=v_reason
  where id=p_session_id;

  return jsonb_build_object(
    'ok',true,
    'session_id',p_session_id,
    'verification_state',v_state,
    'verification_reason',v_reason
  );
end;
$$;

revoke all on function public.resolve_session_verification(uuid,text,text)
  from public, anon;
grant execute on function public.resolve_session_verification(uuid,text,text)
  to authenticated;


-- ---------- V14 verification audit trail ----------
create or replace function private.audit_session_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_action text;
  v_detail jsonb;
begin
  if old.verification_state is distinct from new.verification_state
     or old.verification_reason is distinct from new.verification_reason then
    v_action := case
      when new.verification_state='auto_verified' then 'verification_auto_verified'
      when new.verification_state='confirmed' then 'verification_confirmed'
      when new.verification_state='rejected' then 'verification_rejected'
      when new.verification_state='review_required' and old.verification_state in ('confirmed','rejected')
        then 'verification_returned_to_review'
      when new.verification_state='review_required' then 'verification_review_required'
      else 'verification_changed'
    end;
    v_detail := jsonb_build_object(
      'from_state', old.verification_state,
      'to_state', new.verification_state,
      'from_reason', old.verification_reason,
      'to_reason', new.verification_reason,
      'settlement_state', new.settlement_state
    );
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,detail)
    values(v_actor,v_action,'session',new.id::text,v_detail);
  end if;

  if old.settlement_state is distinct from new.settlement_state then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,detail)
    values(
      v_actor,
      case
        when new.settlement_state='approved' then 'settlement_approved'
        when new.settlement_state='paid' then 'settlement_paid'
        else 'settlement_changed'
      end,
      'session',
      new.id::text,
      jsonb_build_object(
        'from_state',old.settlement_state,
        'to_state',new.settlement_state,
        'verification_state',new.verification_state
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_session_state_change() from public, anon, authenticated;

drop trigger if exists trg_audit_session_state_change on public.sessions;
create trigger trg_audit_session_state_change
after update of verification_state, verification_reason, settlement_state
on public.sessions
for each row
execute function private.audit_session_state_change();

create or replace function private.audit_school_baseline_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude
     or old.radius_m is distinct from new.radius_m then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,detail)
    values(
      v_actor,
      'school_baseline_changed',
      'school',
      new.id::text,
      jsonb_build_object(
        'school_name',new.name,
        'baseline_registered',(new.latitude is not null and new.longitude is not null),
        'radius_m',new.radius_m
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_school_baseline_change() from public, anon, authenticated;

drop trigger if exists trg_audit_school_baseline_change on public.schools;
create trigger trg_audit_school_baseline_change
after update of latitude, longitude, radius_m
on public.schools
for each row
execute function private.audit_school_baseline_change();


-- ---------- V14 session RPC execution hardening ----------
-- start_session/end_session intentionally remain SECURITY DEFINER because supporters
-- are not granted direct INSERT/UPDATE access to sessions/session_locations.
-- Both functions authenticate with auth.uid() and verify assignment/session ownership.
revoke all on function public.start_session(uuid,double precision,double precision,double precision)
  from public, anon;
revoke all on function public.end_session(uuid,double precision,double precision,double precision)
  from public, anon;
grant execute on function public.start_session(uuid,double precision,double precision,double precision)
  to authenticated;
grant execute on function public.end_session(uuid,double precision,double precision,double precision)
  to authenticated;
