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
  v_pin text := trim(coalesce(p_pin, ''));
begin
  v_admin := public.app_require_session(p_session_token, true);

  if v_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

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
    v_pin,
    extensions.crypt(v_pin, extensions.gen_salt('bf')),
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
  v_pin text := trim(coalesce(p_pin, ''));
begin
  v_admin := public.app_require_session(p_session_token, true);

  if v_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update public.agents
  set
    pin = v_pin,
    pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf'))
  where id = p_agent_id;
end;
$$;
