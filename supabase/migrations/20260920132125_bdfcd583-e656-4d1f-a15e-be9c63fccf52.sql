-- Enum + helper functions
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.ussd_normalize_label(_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(lower(trim(coalesce(_label, ''))), '[^a-z0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Tables
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'admin'::public.app_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
$$;

CREATE TABLE public.providers_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name text NOT NULL,
  provider_logo text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  evoucher_rate numeric NOT NULL DEFAULT 0,
  promotional_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.package_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  provider_id uuid REFERENCES public.providers_config(id),
  category_image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.data_packages_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name text NOT NULL,
  data_amount text NOT NULL,
  validity_days text NOT NULL DEFAULT '30'::text,
  selling_price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  category_id uuid REFERENCES public.package_categories(id),
  provider_id uuid NOT NULL REFERENCES public.providers_config(id),
  connection_type_label text NOT NULL DEFAULT 'Data'::text,
  ussd_code text,
  display_order integer NOT NULL DEFAULT 0,
  profit_margin numeric DEFAULT 15,
  phone_prefix text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  menu1 text,
  menu2 text,
  sim_password text,
  somlink_bundle_id integer,
  is_ussd_only boolean NOT NULL DEFAULT false,
  is_discovery_root boolean NOT NULL DEFAULT false,
  secret_price numeric,
  secret_prices numeric[] NOT NULL DEFAULT '{}'::numeric[]
);

CREATE TABLE public.featured_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_providers_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name text NOT NULL,
  provider_logo text,
  commission_rate numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  prefix_code text,
  ussd_code_template text,
  payment_number text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.banners_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_image text NOT NULL,
  alt_text text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  media_type text DEFAULT 'image'::text,
  video_duration integer,
  rotation_interval integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.error_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_code text NOT NULL UNIQUE,
  message_so text,
  message_en text,
  is_active boolean NOT NULL DEFAULT true,
  error_type text,
  title text,
  message text,
  icon_type text DEFAULT 'emoji'::text,
  icon_value text DEFAULT '⚠️'::text,
  is_animated boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value boolean,
  text_value text,
  description text NOT NULL DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  sender_phone text,
  receiver_phone text NOT NULL,
  package_id uuid REFERENCES public.data_packages_config(id),
  provider_id uuid REFERENCES public.providers_config(id),
  payment_provider_id uuid REFERENCES public.payment_providers_config(id),
  package_name text NOT NULL,
  data_amount text,
  selling_price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  payment_number text,
  payment_source text,
  status text NOT NULL DEFAULT 'pending_payment'::text,
  delivery_status text DEFAULT 'pending'::text,
  delivery_notes text,
  delivered_at timestamptz,
  is_manual boolean DEFAULT false,
  invoice_url text,
  tx_id text UNIQUE,
  manual_action_by uuid,
  manual_action_at timestamptz,
  manual_action_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  manual_action_email text,
  manual_action_type text,
  discovery_menu_label text,
  discovery_root_id uuid
);

CREATE TABLE public.delivery_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  receiver_phone text NOT NULL,
  ussd_code text,
  package_code text,
  status text DEFAULT 'pending'::text,
  attempts integer DEFAULT 0,
  error_message text,
  android_device_id text,
  sim_slot integer,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  provider_response text,
  scheduled_at timestamptz,
  dispatched_at timestamptz,
  dispatch_device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  pin_code text,
  somlink_response jsonb,
  discovery_menu_label text,
  lease_expires_at timestamptz,
  lease_device_id text,
  lease_renewed_at timestamptz
);

CREATE TABLE public.delivery_instructions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  instruction_type text NOT NULL DEFAULT 'ussd'::text,
  ussd_code text,
  receiver_phone text,
  provider_name text,
  execution_order integer DEFAULT 1,
  status text DEFAULT 'pending'::text,
  provider_id uuid REFERENCES public.providers_config(id),
  category_id uuid REFERENCES public.package_categories(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  code_template text,
  sim_password text,
  notes text,
  instruction_template text DEFAULT ''::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pending_online_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verified_phone text,
  sender_phone text NOT NULL,
  receiver_phone text NOT NULL,
  provider_id uuid REFERENCES public.providers_config(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  payment_provider text,
  expected_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  discovery_menu_label text,
  discovery_menu_index text
);

CREATE TABLE public.payment_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  receiver_sim text,
  sms_body text,
  tx_id text,
  status text DEFAULT 'unmatched'::text,
  matched_order_id uuid REFERENCES public.orders(id),
  matching_strategy text,
  admin_notes text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.offline_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL UNIQUE,
  receiver_phone text NOT NULL,
  provider_id text,
  provider_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.verified_phones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz DEFAULT now(),
  verification_code text
);

CREATE TABLE public.blocked_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  blocked_by uuid,
  unblocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.android_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL UNIQUE,
  device_name text NOT NULL,
  sim_number text NOT NULL,
  sim2_number text,
  provider_name text NOT NULL,
  sim1_provider text,
  sim2_provider text,
  is_active boolean NOT NULL DEFAULT true,
  total_deliveries integer DEFAULT 0,
  failed_deliveries integer DEFAULT 0,
  last_ping_at timestamptz,
  archived_at timestamptz,
  battery_level integer,
  is_charging boolean DEFAULT false,
  is_primary_hormuud_sim boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  primary_for_provider text,
  send_enabled boolean NOT NULL DEFAULT true,
  sim1_priority integer NOT NULL DEFAULT 1,
  sim2_priority integer NOT NULL DEFAULT 1,
  sim1_enabled boolean NOT NULL DEFAULT true,
  sim2_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE public.sim_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text,
  sim_slot integer NOT NULL DEFAULT 1,
  balance numeric NOT NULL DEFAULT 0,
  balance_type text NOT NULL DEFAULT 'evc_plus'::text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sim_id uuid REFERENCES public.android_devices(id) ON DELETE CASCADE,
  balance_source text NOT NULL DEFAULT 'manual'::text
);

CREATE TABLE public.device_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  alert_type text NOT NULL,
  message text,
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  device_name text,
  is_acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz
);

CREATE TABLE public.admin_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fraud_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium'::text,
  description text,
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auto_topup_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auto_topup_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topup_number_id uuid NOT NULL REFERENCES public.auto_topup_numbers(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  selling_price numeric NOT NULL,
  data_amount text NOT NULL DEFAULT ''::text,
  ussd_code text,
  provider_name text NOT NULL DEFAULT 'hormuud'::text,
  is_active boolean NOT NULL DEFAULT true,
  cost_price numeric NOT NULL DEFAULT 0,
  sim_password text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auto_topup_delivery_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id uuid NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  target_package_id uuid NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  delivery_count integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  execution_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auto_topup_phone_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  package_id uuid REFERENCES public.auto_topup_packages(id) ON DELETE SET NULL,
  topup_number_id uuid NOT NULL REFERENCES public.auto_topup_numbers(id) ON DELETE CASCADE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  category_name text,
  custom_amount text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bulk_sms_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message text NOT NULL,
  target_type text NOT NULL DEFAULT 'all'::text,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  device_id text,
  sim_slot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bulk_sms_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  sent_at timestamptz,
  error_message text,
  device_id text,
  sim_slot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.package_delivery_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  target_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  delivery_count integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  execution_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  discount_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  discount_type text DEFAULT 'percentage'::text,
  applicable_to text DEFAULT 'all'::text,
  provider_id uuid REFERENCES public.providers_config(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  sim_slot integer NOT NULL DEFAULT 1,
  sim_number text,
  sms_type text NOT NULL DEFAULT 'incoming'::text,
  sms_sender text,
  sms_body text NOT NULL,
  amount numeric,
  tx_type text,
  tx_id text,
  counterpart_phone text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.bank_credentials(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tran_no text NOT NULL UNIQUE,
  tran_date text,
  tran_date_time timestamptz,
  acc_no text,
  customer_name text,
  tran_amt numeric NOT NULL,
  narration text,
  dr_cr text,
  uti text,
  currency_code text,
  rrp_no text,
  tran_desc text,
  tran_type text,
  user_id_field text,
  charge_amt numeric,
  raw_payload jsonb,
  parsed_sender_phone text,
  parsed_receiver_phone text,
  match_status text NOT NULL DEFAULT 'unmatched'::text,
  matched_payment_id uuid,
  matched_order_id uuid,
  match_notes text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reversal_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sms_log_id uuid REFERENCES public.sms_logs(id) ON DELETE SET NULL,
  amount numeric,
  sender_phone text,
  ussd_code text,
  sms_body text NOT NULL,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  points integer NOT NULL DEFAULT 0,
  total_referrals integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  earnings numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.referral_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_phone text NOT NULL,
  referred_phone text NOT NULL UNIQUE,
  code_used text NOT NULL,
  points_awarded integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  amount_awarded numeric NOT NULL DEFAULT 0.05
);

CREATE TABLE public.user_acquisition_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  source text NOT NULL,
  other_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_key text NOT NULL,
  app_name text NOT NULL,
  version text NOT NULL,
  release_notes text,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ussd_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sessionid text NOT NULL UNIQUE,
  origin text NOT NULL,
  shortcode text,
  step text NOT NULL DEFAULT 'start'::text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_input text,
  is_closed boolean NOT NULL DEFAULT false,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ussd_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sessionid text NOT NULL,
  origin text,
  direction text NOT NULL,
  content text,
  ussdstate text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ussd_price_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  label text NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  info_line1 text,
  info_line2 text,
  normalized_label text
);

CREATE OR REPLACE FUNCTION public.ussd_price_catalog_set_normalized()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_label := public.ussd_normalize_label(NEW.label);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ussd_price_catalog_normalized
BEFORE INSERT OR UPDATE ON public.ussd_price_catalog
FOR EACH ROW EXECUTE FUNCTION public.ussd_price_catalog_set_normalized();

CREATE TABLE public.ussd_package_discoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  device_id text,
  raw_menu text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  expires_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_state text NOT NULL DEFAULT 'closed'::text,
  session_device_id text,
  session_expires_at timestamptz,
  selected_label text,
  selected_index text,
  selected_order_id uuid,
  session_note text,
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.discovery_unmatched_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  raw_label text NOT NULL,
  normalized_label text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.offline_payment_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  ussd_prefix text,
  label text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_response_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name text NOT NULL UNIQUE,
  message_so text NOT NULL DEFAULT ''::text,
  message_en text NOT NULL DEFAULT ''::text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants, RLS and policies
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'user_roles','providers_config','package_categories','data_packages_config','featured_packages',
    'payment_providers_config','banners_config','notifications','error_messages','app_settings',
    'orders','delivery_queue','delivery_instructions','pending_online_payments','payment_receipts',
    'offline_registrations','verified_phones','blocked_users','android_devices','sim_balances',
    'device_alerts','admin_permissions','audit_logs','fraud_alerts','auto_topup_numbers',
    'auto_topup_packages','auto_topup_delivery_rules','auto_topup_phone_mappings','bulk_sms_campaigns',
    'bulk_sms_queue','package_delivery_rules','customer_discounts','sms_logs','bank_credentials',
    'bank_sessions','bank_transactions','reversal_alerts','referral_codes','referral_redemptions',
    'user_acquisition_sources','app_releases','ussd_sessions','ussd_logs','ussd_price_catalog',
    'ussd_package_discoveries','discovery_unmatched_labels','offline_payment_numbers','provider_response_messages'
  ];
  public_read text[] := ARRAY[
    'providers_config','package_categories','data_packages_config','featured_packages',
    'payment_providers_config','banners_config','notifications','error_messages','app_settings',
    'offline_payment_numbers','provider_response_messages','ussd_price_catalog','app_releases',
    'blocked_users','referral_codes','referral_redemptions','verified_phones','offline_registrations',
    'orders','customer_discounts','ussd_package_discoveries'
  ];
  public_write text[] := ARRAY[
    'orders','pending_online_payments','verified_phones','offline_registrations',
    'user_acquisition_sources','referral_codes','referral_redemptions','ussd_package_discoveries'
  ];
  updated_tables text[] := ARRAY[
    'providers_config','package_categories','data_packages_config','payment_providers_config',
    'banners_config','app_settings','orders','offline_registrations','android_devices',
    'bank_credentials','referral_codes','app_releases','ussd_sessions','ussd_price_catalog',
    'ussd_package_discoveries','discovery_unmatched_labels','offline_payment_numbers',
    'provider_response_messages'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY "admins_all_%1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())$f$, t);
  END LOOP;

  FOREACH t IN ARRAY public_read LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format($f$CREATE POLICY "public_read_%1$s" ON public.%1$I FOR SELECT USING (true)$f$, t);
  END LOOP;

  FOREACH t IN ARRAY public_write LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO anon', t);
    EXECUTE format($f$CREATE POLICY "public_insert_%1$s" ON public.%1$I FOR INSERT WITH CHECK (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "public_update_%1$s" ON public.%1$I FOR UPDATE USING (true) WITH CHECK (true)$f$, t);
  END LOOP;

  FOREACH t IN ARRAY updated_tables LOOP
    EXECUTE format('CREATE TRIGGER trg_updated_at_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- pending_online_payments needs anon select for status polling
GRANT SELECT ON public.pending_online_payments TO anon;
CREATE POLICY "public_read_pending_online_payments" ON public.pending_online_payments FOR SELECT USING (true);

-- Featured / most purchased package RPCs used by the app
CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE (
  package_id uuid, package_name text, data_amount text, selling_price numeric,
  provider_id uuid, provider_name text, provider_logo text,
  connection_type_label text, display_order integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.id, dp.package_name, dp.data_amount, dp.selling_price,
         p.id, p.provider_name, p.provider_logo,
         dp.connection_type_label, fp.display_order
  FROM public.featured_packages fp
  JOIN public.data_packages_config dp ON dp.id = fp.package_id
  JOIN public.providers_config p ON p.id = dp.provider_id
  WHERE fp.is_active AND dp.is_active AND p.is_active
  ORDER BY fp.display_order ASC
$$;

CREATE OR REPLACE FUNCTION public.get_most_purchased_packages()
RETURNS TABLE (
  package_id uuid, package_name text, data_amount text, selling_price numeric,
  provider_id uuid, provider_name text, provider_logo text,
  connection_type_label text, purchase_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.id, dp.package_name, dp.data_amount, dp.selling_price,
         p.id, p.provider_name, p.provider_logo,
         dp.connection_type_label, count(o.id)
  FROM public.data_packages_config dp
  JOIN public.providers_config p ON p.id = dp.provider_id
  LEFT JOIN public.orders o ON o.package_id = dp.id AND o.status = 'completed'
  WHERE dp.is_active AND p.is_active
  GROUP BY dp.id, p.id
  ORDER BY count(o.id) DESC, dp.display_order ASC
  LIMIT 10
$$;

GRANT EXECUTE ON FUNCTION public.get_featured_packages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_most_purchased_packages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ussd_normalize_label(text) TO anon, authenticated;