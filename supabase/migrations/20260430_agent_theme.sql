-- Add theme column to agents table
alter table public.agents
  add column if not exists theme jsonb;

-- Drop functions before recreating with new return types
drop function if exists public.get_agent_directory();
drop function if exists public.verify_agent_pin(uuid, text);
drop function if exists public.restore_app_session(uuid);

-- get_agent_directory — include theme
create or replace function public.get_agent_directory()
returns table (
  id             uuid,
  name           text,
  role           text,
  color          text,
  is_admin       boolean,
  is_super_admin boolean,
  theme          jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    a.id, a.name, a.role, a.color,
    coalesce(a.is_admin, false)        as is_admin,
    coalesce(a.is_super_admin, false)  as is_super_admin,
    a.theme
  from public.agents a
  where a.active = true
  order by a.created_at asc, a.name asc;
$$;

-- verify_agent_pin — include theme in return
create or replace function public.verify_agent_pin(
  p_agent_id    uuid,
  p_pin_attempt text
)
returns table (
  id             uuid,
  name           text,
  role           text,
  color          text,
  is_admin       boolean,
  is_super_admin boolean,
  session_token  uuid,
  theme          jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agent   public.agents%rowtype;
  v_token   uuid;
begin
  select * into v_agent from public.agents where agents.id = p_agent_id and active = true;
  if not found then return; end if;
  if v_agent.pin_hash is null or
     v_agent.pin_hash <> extensions.crypt(p_pin_attempt, v_agent.pin_hash)
  then return; end if;

  v_token := extensions.gen_random_uuid();
  insert into public.app_sessions (agent_id, session_token, expires_at)
  values (v_agent.id, v_token, now() + interval '12 hours');

  return query
    select
      v_agent.id, v_agent.name, v_agent.role, v_agent.color,
      coalesce(v_agent.is_admin, false),
      coalesce(v_agent.is_super_admin, false),
      v_token,
      v_agent.theme;
end;
$$;

-- restore_app_session — include theme in return
create or replace function public.restore_app_session(
  p_session_token uuid
)
returns table (
  id             uuid,
  name           text,
  role           text,
  color          text,
  is_admin       boolean,
  is_super_admin boolean,
  theme          jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agent public.agents%rowtype;
begin
  select a.* into v_agent
  from public.app_sessions s
  join public.agents a on a.id = s.agent_id
  where s.session_token = p_session_token
    and s.expires_at > now()
    and a.active = true;
  if not found then
    raise exception 'Invalid or expired session';
  end if;

  update public.app_sessions
  set expires_at = now() + interval '12 hours'
  where session_token = p_session_token;

  return query
    select
      v_agent.id, v_agent.name, v_agent.role, v_agent.color,
      coalesce(v_agent.is_admin, false),
      coalesce(v_agent.is_super_admin, false),
      v_agent.theme;
end;
$$;

-- Re-grant execute permissions (drop removes them)
grant execute on function public.get_agent_directory() to anon, authenticated;
grant execute on function public.verify_agent_pin(uuid, text) to anon, authenticated;
grant execute on function public.restore_app_session(uuid) to anon, authenticated;
