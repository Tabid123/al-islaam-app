import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("252")) digits = digits.slice(3);
  if (digits.startsWith("0") && digits.length === 10) digits = digits.slice(1);
  return digits.slice(-9);
}

function providerFromPhone(value?: string | null): string | null {
  const phone = normalizePhone(value);
  if (!phone || phone.length < 2) return null;
  const prefix = phone.slice(0, 2);
  if (prefix === "61" || prefix === "77") return "hormuud";
  if (prefix === "68") return "somnet";
  if (prefix === "62") return "somtel";
  if (prefix === "71") return "amtel";
  if (prefix === "64") return "somlink";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return respond({ error: "POST required" }, 405);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const deviceId = String(body.deviceId || "").trim();
    const deviceName = String(body.deviceName || "Al-islaam Delivery").trim();
    const sim1Number = normalizePhone(body.sim1Number);
    const sim2Number = normalizePhone(body.sim2Number);
    if (!deviceId) return respond({ error: "deviceId required" }, 400);

    const sim1Provider = providerFromPhone(sim1Number);
    const sim2Provider = providerFromPhone(sim2Number);
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("android_devices")
      .select("id, send_enabled, sim1_priority, sim2_priority, sim1_enabled, sim2_enabled")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (existingError) throw existingError;

    let device;
    if (existing) {
      const { data, error } = await supabase
        .from("android_devices")
        .update({
          device_name: deviceName,
          sim_number: sim1Number,
          sim2_number: sim2Number,
          provider_name: sim1Provider || sim2Provider || "unknown",
          sim1_provider: sim1Provider,
          sim2_provider: sim2Provider,
          is_active: true,
          archived_at: null,
          last_ping_at: now,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      device = data;
    } else {
      const { data, error } = await supabase
        .from("android_devices")
        .insert({
          device_id: deviceId,
          device_name: deviceName,
          sim_number: sim1Number || "unknown",
          sim2_number: sim2Number,
          provider_name: sim1Provider || sim2Provider || "unknown",
          sim1_provider: sim1Provider,
          sim2_provider: sim2Provider,
          is_active: true,
          archived_at: null,
          last_ping_at: now,
          send_enabled: true,
          sim1_priority: 1,
          sim2_priority: 1,
          sim1_enabled: true,
          sim2_enabled: true,
        })
        .select()
        .single();
      if (error) throw error;
      device = data;
    }

    return respond({
      success: true,
      device,
      sim1Provider,
      sim2Provider,
    });
  } catch (error) {
    console.error("register-device error", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});