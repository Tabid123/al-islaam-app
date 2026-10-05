-- eDahab API foundation for Al-islaam.
-- Credentials are intentionally NOT stored in source control.

create schema if not exists private;

alter table public.payment_providers_config
  drop constraint if exists payment_providers_config_payment_mode_check;
alter table public.payment_providers_config
  add constraint payment_providers_config_payment_mode_check
  check (payment_mode in ('ussd','waafipay_api','edahab_api'));

create table if not exists private.edahab_integration (
  singleton boolean primary key default true check (singleton),
  agent_code text not null,
  merchant_phone text not null,
  api_key_secret_id uuid not null,
  api_secret_secret_id uuid not null,
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.edahab_transactions (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null unique,
  order_id uuid references public.orders(id) on delete set null,
  payer_phone text not null,
  receiver_phone text not null,
  customer_phone text not null,
  package_id uuid not null references public.data_packages_config(id),
  payment_provider_id uuid references public.payment_providers_config(id),
  amount numeric not null check (amount > 0),
  currency text not null default 'USD' check (currency in ('USD','SLSH')),
  status text not null default 'processing'
    check (status in ('processing','pending','approved','declined','failed','unknown')),
  invoice_status text,
  invoice_id text unique,
  transaction_id text,
  request_id text,
  response_code integer,
  response_message text,
  raw_response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.edahab_transactions enable row level security;
revoke all on table public.edahab_transactions from anon, authenticated;

create index if not exists edahab_transactions_payer_created_idx
  on public.edahab_transactions (payer_phone, created_at desc);
create index if not exists edahab_transactions_status_idx
  on public.edahab_transactions (status, created_at desc);

create or replace function public.edahab_admin_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r private.edahab_integration%rowtype;
begin
  select * into r from private.edahab_integration where singleton = true;
  if not found then
    return jsonb_build_object(
      'configured', false, 'agent_code', null, 'merchant_phone', null,
      'is_active', false, 'has_api_key', false, 'has_api_secret', false
    );
  end if;
  return jsonb_build_object(
    'configured', true,
    'agent_code', r.agent_code,
    'merchant_phone', r.merchant_phone,
    'is_active', r.is_active,
    'has_api_key', r.api_key_secret_id is not null,
    'has_api_secret', r.api_secret_secret_id is not null,
    'updated_at', r.updated_at
  );
end;
$$;

create or replace function public.edahab_admin_save(
  p_agent_code text,
  p_merchant_phone text,
  p_api_key text default null,
  p_api_secret text default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  r private.edahab_integration%rowtype;
  v_agent text := btrim(coalesce(p_agent_code,''));
  v_phone text := regexp_replace(coalesce(p_merchant_phone,''),'[^0-9]','','g');
  v_key text := nullif(btrim(coalesce(p_api_key,'')),'');
  v_secret text := nullif(btrim(coalesce(p_api_secret,'')),'');
  v_key_id uuid;
  v_secret_id uuid;
begin
  if v_agent = '' or length(v_agent) > 32 then raise exception 'invalid_agent_code'; end if;
  if length(v_phone) < 7 or length(v_phone) > 15 then raise exception 'invalid_merchant_phone'; end if;

  select * into r from private.edahab_integration where singleton = true for update;

  if not found then
    if v_key is null or length(v_key) < 10 then raise exception 'api_key_required'; end if;
    if v_secret is null or length(v_secret) < 10 then raise exception 'api_secret_required'; end if;

    v_key_id := vault.create_secret(
      v_key, format('al-islaam:edahab:api-key:%s', gen_random_uuid()), 'Al-islaam eDahab API key'
    );
    v_secret_id := vault.create_secret(
      v_secret, format('al-islaam:edahab:api-secret:%s', gen_random_uuid()), 'Al-islaam eDahab API secret'
    );

    insert into private.edahab_integration(
      singleton, agent_code, merchant_phone, api_key_secret_id, api_secret_secret_id,
      is_active, updated_at
    ) values (
      true, v_agent, v_phone, v_key_id, v_secret_id, p_is_active, now()
    );
  else
    v_key_id := r.api_key_secret_id;
    v_secret_id := r.api_secret_secret_id;

    if v_key is not null then
      if length(v_key) < 10 then raise exception 'invalid_api_key'; end if;
      perform vault.update_secret(v_key_id, v_key, null, 'Al-islaam eDahab API key');
    end if;
    if v_secret is not null then
      if length(v_secret) < 10 then raise exception 'invalid_api_secret'; end if;
      perform vault.update_secret(v_secret_id, v_secret, null, 'Al-islaam eDahab API secret');
    end if;

    update private.edahab_integration
    set agent_code=v_agent, merchant_phone=v_phone, is_active=p_is_active, updated_at=now()
    where singleton=true;
  end if;

  return public.edahab_admin_status();
end;
$$;

create or replace function public.edahab_backend_credentials()
returns jsonb
language sql
security definer
set search_path = public, private, vault
as $$
  select jsonb_build_object(
    'agent_code', e.agent_code,
    'merchant_phone', e.merchant_phone,
    'api_key', k.decrypted_secret,
    'api_secret', s.decrypted_secret,
    'is_active', e.is_active
  )
  from private.edahab_integration e
  join vault.decrypted_secrets k on k.id=e.api_key_secret_id
  join vault.decrypted_secrets s on s.id=e.api_secret_secret_id
  where e.singleton=true;
$$;

create or replace function public.edahab_admin_delete()
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  v_key_id uuid;
  v_secret_id uuid;
begin
  select api_key_secret_id, api_secret_secret_id into v_key_id, v_secret_id
  from private.edahab_integration where singleton=true;

  delete from private.edahab_integration where singleton=true;
  if v_key_id is not null then delete from vault.secrets where id=v_key_id; end if;
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;

  update public.payment_providers_config
  set payment_mode='ussd', is_active=false, updated_at=now()
  where lower(btrim(provider_name)) in ('e-dahab','edahab');

  return public.edahab_admin_status();
end;
$$;

revoke all on function public.edahab_admin_status() from public, anon, authenticated;
revoke all on function public.edahab_admin_save(text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.edahab_backend_credentials() from public, anon, authenticated;
revoke all on function public.edahab_admin_delete() from public, anon, authenticated;

grant execute on function public.edahab_admin_status() to service_role;
grant execute on function public.edahab_admin_save(text,text,text,text,boolean) to service_role;
grant execute on function public.edahab_backend_credentials() to service_role;
grant execute on function public.edahab_admin_delete() to service_role;
