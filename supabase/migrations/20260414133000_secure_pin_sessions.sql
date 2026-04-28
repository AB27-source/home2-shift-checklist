create extension if not exists pgcrypto with schema extensions;

alter table public.agents
  add column if not exists pin_hash text;

update public.agents
set pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))
where coalesce(pin, '') <> ''
  and coalesce(pin_hash, '') = '';

create table if not exists public.app_sessions (
  session_token uuid primary key default extensions.gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists app_sessions_agent_id_idx on public.app_sessions (agent_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions (expires_at);

alter table public.agents enable row level security;
alter table public.app_sessions enable row level security;
alter table public.shift_records enable row level security;

revoke all on public.agents from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke delete on public.shift_records from anon, authenticated;

grant select, insert, update on public.shift_records to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_records'
      and policyname = 'shift_records_select_public'
  ) then
    create policy shift_records_select_public
      on public.shift_records
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_records'
      and policyname = 'shift_records_insert_public'
  ) then
    create policy shift_records_insert_public
      on public.shift_records
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_records'
      and policyname = 'shift_records_update_public'
  ) then
    create policy shift_records_update_public
      on public.shift_records
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;

create or replace function public.app_require_session(
  p_session_token uuid,
  p_require_admin boolean default false
)
returns public.agents
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agent public.agents%rowtype;
begin
  if p_session_token is null then
    raise exception 'Session required';
  end if;

  delete from public.app_sessions
  where expires_at <= now();

  select a.*
  into v_agent
  from public.app_sessions s
  join public.agents a on a.id = s.agent_id
  where s.session_token = p_session_token
    and s.expires_at > now()
    and a.active = true
  limit 1;

  if not found then
    raise exception 'Invalid or expired session';
  end if;

  if p_require_admin and coalesce(v_agent.is_admin, false) = false then
    raise exception 'Admin session required';
  end if;

  return v_agent;
end;
$$;

create or replace function public.get_agent_directory()
returns table (
  id uuid,
  name text,
  role text,
  color text,
  is_admin boolean
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.name, a.role, a.color, coalesce(a.is_admin, false) as is_admin
  from public.agents a
  where a.active = true
  order by a.created_at asc, a.name asc;
$$;

create or replace function public.verify_agent_pin(
  p_agent_id uuid,
  p_pin_attempt text
)
returns table (
  session_token uuid,
  id uuid,
  name text,
  role text,
  color text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agent public.agents%rowtype;
  v_token uuid := extensions.gen_random_uuid();
begin
  select *
  into v_agent
  from public.agents
  where public.agents.id = p_agent_id
    and active = true
  limit 1;

  if not found then
    return;
  end if;

  if not (
    (coalesce(v_agent.pin_hash, '') <> '' and extensions.crypt(coalesce(p_pin_attempt, ''), v_agent.pin_hash) = v_agent.pin_hash)
    or (coalesce(v_agent.pin, '') <> '' and v_agent.pin = p_pin_attempt)
  ) then
    return;
  end if;

  if coalesce(v_agent.pin_hash, '') = '' and coalesce(v_agent.pin, '') <> '' then
    update public.agents
    set pin_hash = extensions.crypt(v_agent.pin, extensions.gen_salt('bf'))
    where public.agents.id = v_agent.id;
  end if;

  delete from public.app_sessions where agent_id = v_agent.id;

  insert into public.app_sessions (session_token, agent_id, expires_at)
  values (v_token, v_agent.id, now() + interval '12 hours');

  return query
  select
    v_token,
    v_agent.id,
    v_agent.name,
    v_agent.role,
    v_agent.color,
    coalesce(v_agent.is_admin, false);
end;
$$;

create or replace function public.restore_app_session(
  p_session_token uuid
)
returns table (
  id uuid,
  name text,
  role text,
  color text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agent public.agents%rowtype;
begin
  v_agent := public.app_require_session(p_session_token);

  update public.app_sessions
  set expires_at = now() + interval '12 hours'
  where session_token = p_session_token;

  return query
  select
    v_agent.id,
    v_agent.name,
    v_agent.role,
    v_agent.color,
    coalesce(v_agent.is_admin, false);
end;
$$;

create or replace function public.sign_out_app_session(
  p_session_token uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_sessions
  where session_token = p_session_token;
$$;

create or replace function public.admin_add_agent(
  p_session_token uuid,
  p_name text,
  p_role text,
  p_pin text,
  p_color text,
  p_is_admin boolean default false
)
returns table (
  id uuid,
  name text,
  role text,
  color text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_agent public.agents%rowtype;
begin
  v_admin := public.app_require_session(p_session_token, true);

  insert into public.agents (
    name,
    role,
    pin,
    pin_hash,
    color,
    is_admin,
    active
  )
  values (
    trim(p_name),
    trim(p_role),
    null,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    p_color,
    coalesce(p_is_admin, false),
    true
  )
  returning * into v_agent;

  return query
  select
    v_agent.id,
    v_agent.name,
    v_agent.role,
    v_agent.color,
    coalesce(v_agent.is_admin, false);
end;
$$;

create or replace function public.admin_update_agent(
  p_session_token uuid,
  p_agent_id uuid,
  p_name text,
  p_role text,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.agents%rowtype;
begin
  v_admin := public.app_require_session(p_session_token, true);

  update public.agents
  set
    name = trim(p_name),
    role = trim(p_role),
    is_admin = coalesce(p_is_admin, false)
  where id = p_agent_id;
end;
$$;

create or replace function public.admin_reset_agent_pin(
  p_session_token uuid,
  p_agent_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.agents%rowtype;
begin
  v_admin := public.app_require_session(p_session_token, true);

  update public.agents
  set
    pin = null,
    pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  where id = p_agent_id;
end;
$$;

create or replace function public.admin_deactivate_agent(
  p_session_token uuid,
  p_agent_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.agents%rowtype;
begin
  v_admin := public.app_require_session(p_session_token, true);

  update public.agents
  set active = false
  where id = p_agent_id;
end;
$$;

create or replace function public.admin_delete_shift_records(
  p_session_token uuid,
  p_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_deleted integer;
begin
  v_admin := public.app_require_session(p_session_token, true);

  delete from public.shift_records
  where id = any(p_ids);

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.get_agent_directory() to anon, authenticated;
grant execute on function public.verify_agent_pin(uuid, text) to anon, authenticated;
grant execute on function public.restore_app_session(uuid) to anon, authenticated;
grant execute on function public.sign_out_app_session(uuid) to anon, authenticated;
grant execute on function public.admin_add_agent(uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_update_agent(uuid, uuid, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_reset_agent_pin(uuid, uuid, text) to anon, authenticated;
grant execute on function public.admin_deactivate_agent(uuid, uuid) to anon, authenticated;
grant execute on function public.admin_delete_shift_records(uuid, uuid[]) to anon, authenticated;
