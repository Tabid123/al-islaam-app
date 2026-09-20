INSERT INTO public.app_settings (setting_key, text_value, description) VALUES
('support_whatsapp_number', '252615555495', 'Lambarka WhatsApp ee Customer Support (tusaale: 252615555495)'),
('support_call_number', '252615555495', 'Lambarka wicitaanka ee Customer Support (tusaale: 252615555495)')
ON CONFLICT (setting_key) DO NOTHING;