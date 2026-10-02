-- Send payment activation and API/USSD changes to storefront subscriptions.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'payment_providers_config') then
    alter publication supabase_realtime add table public.payment_providers_config;
  end if;
end $$;
