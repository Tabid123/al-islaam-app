import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts.at(-1) || "activate-package";
    const action = url.searchParams.get("action");

    if (req.method === "GET" && (action === "device-config" || last === "device-config")) {
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) return json({ error: "deviceId required" }, 400);

      const { data, error } = await supabase
        .from("android_devices")
        .select("sim1_provider, sim2_provider")
        .eq("device_id", deviceId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) throw error;
      return json({
        sim1Provider: data?.sim1_provider ?? null,
        sim2Provider: data?.sim2_provider ?? null,
      });
    }

    if (req.method === "GET" && last === "pending") {
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) return json({ orders: [], nextPollMs: 12000 });

      const battery = url.searchParams.get("battery");
      const charging = url.searchParams.get("charging");

      const pingUpdate: Record<string, unknown> = { last_ping_at: new Date().toISOString() };
      if (battery !== null && Number.isFinite(Number(battery))) pingUpdate.battery_level = Number(battery);
      if (charging !== null) pingUpdate.is_charging = charging === "true";

      await supabase
        .from("android_devices")
        .update(pingUpdate)
        .eq("device_id", deviceId)
        .is("archived_at", null);

      const { data: device, error: deviceError } = await supabase
        .from("android_devices")
        .select("sim1_provider, sim2_provider, sim1_enabled, sim2_enabled, send_enabled")
        .eq("device_id", deviceId)
        .is("archived_at", null)
        .maybeSingle();

      if (deviceError) throw deviceError;
      if (!device || device.send_enabled === false) return json({ orders: [], nextPollMs: 12000 });

      const providers = [
        device.sim1_enabled !== false ? device.sim1_provider : null,
        device.sim2_enabled !== false ? device.sim2_provider : null,
      ].filter(Boolean).map((v) => String(v).toLowerCase());

      if (providers.length === 0) return json({ orders: [], nextPollMs: 12000 });

      const { data: claimed, error } = await supabase.rpc("claim_next_delivery", {
        p_device_id: deviceId,
        p_providers: providers,
      });
      if (error) throw error;

      if (!claimed) return json({ orders: [], nextPollMs: 12000 });

      const order = claimed as Record<string, unknown>;
      return json({
        orders: [{
          id: order.id,
          orderId: order.order_id ?? "",
          ussdCode: order.ussd_code ?? "",
          receiverPhone: order.receiver_phone ?? "",
          packageCode: order.package_code ?? null,
          attempts: order.attempts ?? 0,
          simSlot: order.sim_slot ?? 0,
          provider: order.provider_name ?? "",
          pinCode: order.pin_code ?? "",
        }],
        nextPollMs: 3000,
      });
    }

    if (req.method === "POST" && last === "status") {
      const body = await req.json();
      const queueId = body.queueId as string | undefined;
      const status = String(body.status || "").toLowerCase();
      if (!queueId || !status) return json({ error: "queueId and status required" }, 400);

      const { data: queue, error: fetchError } = await supabase
        .from("delivery_queue")
        .select("id, order_id, status, android_device_id")
        .eq("id", queueId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!queue) return json({ error: "Queue not found" }, 404);

      if (["completed", "failed", "timeout"].includes(queue.status)) {
        return json({ success: true, message: "Already finalized" });
      }

      const isSuccess = ["completed", "delivered", "success"].includes(status);
      const finalStatus = isSuccess ? "completed" : (status === "timeout" ? "timeout" : "failed");
      const now = new Date().toISOString();

      const update: Record<string, unknown> = {
        status: finalStatus,
        provider_response: body.providerResponse ?? null,
        error_message: body.errorMessage ?? null,
      };
      if (isSuccess) update.completed_at = now;

      const { error: updateError } = await supabase
        .from("delivery_queue")
        .update(update)
        .eq("id", queueId);
      if (updateError) throw updateError;

      if (queue.order_id) {
        const orderUpdate: Record<string, unknown> = isSuccess
          ? {
              status: "completed",
              delivery_status: "delivered",
              delivered_at: now,
              delivery_notes: body.providerResponse || "Delivered by Al-islaam Delivery",
              updated_at: now,
            }
          : {
              delivery_status: finalStatus,
              delivery_notes: body.errorMessage || body.providerResponse || finalStatus,
              updated_at: now,
            };

        await supabase.from("orders").update(orderUpdate).eq("id", queue.order_id);
      }

      return json({ success: true });
    }

    if (req.method === "POST" && last === "dispatch") {
      const body = await req.json();
      const queueId = body.queueId as string | undefined;
      if (!queueId) return json({ error: "queueId required" }, 400);

      const { error } = await supabase
        .from("delivery_queue")
        .update({
          dispatched_at: new Date().toISOString(),
          dispatch_device_id: body.deviceId ?? null,
        })
        .eq("id", queueId);
      if (error) throw error;

      return json({ success: true });
    }

    if (req.method === "POST" && last === "ping") {
      const body = await req.json();
      const deviceId = body.deviceId as string | undefined;
      if (!deviceId) return json({ error: "deviceId required" }, 400);

      const update: Record<string, unknown> = {
        last_ping_at: new Date().toISOString(),
      };
      if (Number.isFinite(Number(body.batteryLevel))) update.battery_level = Number(body.batteryLevel);
      if (typeof body.isCharging === "boolean") update.is_charging = body.isCharging;

      const { error } = await supabase
        .from("android_devices")
        .update(update)
        .eq("device_id", deviceId)
        .is("archived_at", null);
      if (error) throw error;

      return json({ success: true });
    }

    if (req.method === "GET" && last === "otp-pending") {
      return json({ tasks: [] });
    }

    if (req.method === "POST" && last === "otp-status") {
      return json({ success: true });
    }

    return json({ error: "Route not found" }, 404);
  } catch (error) {
    console.error("activate-package error", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});