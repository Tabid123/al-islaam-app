-- AMTEL API staging. No live device/checkout behavior changes until explicitly enabled.
CREATE TABLE IF NOT EXISTS public.amtel_offerings (
 offering_id text PRIMARY KEY,
 category text NOT NULL,
 label text NOT NULL,
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 active boolean NOT NULL DEFAULT true,
 CHECK (offering_id ~ '^[0-9]{5,8}$')
);
INSERT INTO public.amtel_offerings(offering_id,category,label,amount) VALUES
('30051','Bulaal VIP','10 Hours Unlimited',0.25),
('30024','Bulaal VIP','36 Hours Unlimited',0.50),
('30025','Bulaal VIP','3 Days Unlimited',1.00),
('30026','Bulaal VIP','7 Days Unlimited',2.50),
('30009','Bulaal VIP','15 Days Unlimited',5.50),
('30027','Bulaal VIP','30 Days Unlimited',10.00),
('30001','Tanaad','500 MB No Expire',0.10),
('30002','Tanaad','1 GB No Expire',0.25),
('30004','Tanaad','2 GB No Expire',0.50),
('30005','Tanaad','4 GB No Expire',1.00),
('30011','Tanaad','13 GB No Expire',3.00),
('30039','Tanaad','25 GB No Expire',5.00),
('30013','Tanaad','51 GB No Expire',8.00),
('30014','Wadaag','15 GB 30 Days',3.00),
('30015','Wadaag','30 GB 30 Days',5.00),
('30016','Wadaag','65 GB 30 Days',10.00),
('30028','Intifaac','3 Days Unlimited Voice',0.10),
('30029','Intifaac','7 Days Unlimited Voice',0.25),
('30030','Intifaac','15 Days Unlimited Voice',0.50),
('30031','Intifaac','30 Days Unlimited Voice',1.00)
ON CONFLICT (offering_id) DO NOTHING;

-- Explicit package mapping. Never infer an OfferingId from package names/prices.
CREATE TABLE IF NOT EXISTS public.amtel_package_mapping (
 package_id uuid PRIMARY KEY REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
 offering_id text NOT NULL REFERENCES public.amtel_offerings(offering_id),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.amtel_delivery_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
 offering_id text NOT NULL REFERENCES public.amtel_offerings(offering_id),
 receiver_phone text NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount > 0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','succeeded','rejected','unknown')),
 conversation_id text NOT NULL UNIQUE,
 transaction_id text,
 result_code text,
 result_description text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.amtel_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amtel_package_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amtel_delivery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.amtel_offerings,public.amtel_package_mapping,public.amtel_delivery_jobs FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.amtel_delivery_jobs TO service_role;
GRANT SELECT ON public.amtel_offerings,public.amtel_package_mapping TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_amtel_delivery(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; m record; j uuid; v_name text;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.status NOT IN ('paid','completed','payment_confirmed') THEN RAISE EXCEPTION 'Paid order required'; END IF;
 IF o.delivery_status='delivered' THEN RAISE EXCEPTION 'Order already delivered'; END IF;
 SELECT lower(v.provider_name) INTO v_name FROM public.providers_config v WHERE v.id=o.provider_id;
 IF v_name IS NULL OR v_name NOT LIKE '%amtel%' THEN RAISE EXCEPTION 'Not AMTEL'; END IF;
 SELECT m1.offering_id, f.amount INTO m FROM public.amtel_package_mapping m1
 JOIN public.amtel_offerings f ON f.offering_id=m1.offering_id
 WHERE m1.package_id=o.package_id AND m1.enabled AND f.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'AMTEL mapping disabled'; END IF;
 IF o.cost_price IS NULL OR abs(o.cost_price-m.amount)>0.005 THEN RAISE EXCEPTION 'AMTEL cost mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM public.delivery_queue WHERE order_id=o.id) THEN RAISE EXCEPTION 'Device delivery already exists'; END IF;
 SELECT id INTO j FROM public.amtel_delivery_jobs WHERE order_id=o.id;
 IF j IS NOT NULL THEN RETURN j; END IF;
 INSERT INTO public.amtel_delivery_jobs(order_id,offering_id,receiver_phone,amount,conversation_id)
 VALUES (o.id,m.offering_id,CASE WHEN regexp_replace(o.receiver_phone,'[^0-9]','','g') LIKE '252%' THEN regexp_replace(o.receiver_phone,'[^0-9]','','g') ELSE '252'||regexp_replace(o.receiver_phone,'[^0-9]','','g') END,m.amount,'AMTEL_'||replace(o.id::text,'-',''))
 RETURNING id INTO j;
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_amtel_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_amtel_delivery(uuid) TO service_role;
