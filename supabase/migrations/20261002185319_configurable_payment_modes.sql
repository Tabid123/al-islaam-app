-- Keep existing number-based methods; WaafiPay keeps its current API behavior.
alter table public.payment_providers_config
  add column if not exists payment_mode text not null default 'ussd'
  check (payment_mode in ('ussd', 'waafipay_api'));
update public.payment_providers_config
  set payment_mode = 'waafipay_api'
  where lower(trim(provider_name)) = 'waafipay';
