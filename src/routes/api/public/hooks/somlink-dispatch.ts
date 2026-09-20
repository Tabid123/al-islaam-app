import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/somlink-dispatch")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { somlinkLogin, processSomlinkDelivery } = await import("@/lib/somlink.server");

        // 0) Auto-enqueue paid Somlink orders that never got a delivery_queue row.
        //    Includes orders another system marked failed without ever queueing
        //    anything (e.g. "No delivery instruction configured") — Somlink
        //    packages are delivered by API, so no instruction row is needed.
        const { data: pendingOrders } = await supabaseAdmin
          .from("orders")
          .select("id, receiver_phone, scheduled_for, package_id, delivery_status, data_packages_config!inner(somlink_bundle_id, package_name)")
          .in("status", ["paid", "completed", "payment_confirmed"])
          .in("delivery_status", ["pending", "failed"])
          .not("data_packages_config.somlink_bundle_id", "is", null)
          .order("created_at", { ascending: true })
          .limit(20);

        for (const o of pendingOrders ?? []) {
          const { data: existing } = await supabaseAdmin
            .from("delivery_queue")
            .select("id")
            .eq("order_id", o.id)
            .limit(1);
          if (existing && existing.length > 0) continue;

          if ((o as any).delivery_status === "failed") {
            await supabaseAdmin
              .from("orders")
              .update({ delivery_status: "pending", delivery_notes: "Somlink auto-requeue" })
              .eq("id", o.id);
          }

          await supabaseAdmin.from("delivery_queue").insert({
            order_id: o.id,
            receiver_phone: o.receiver_phone,
            provider_name: "Somlink",
            status: "pending",
            scheduled_at: (o as any).scheduled_for ?? null,
          });
        }

        // Find pending Somlink deliveries whose package has a somlink_bundle_id
        const { data: rows, error } = await supabaseAdmin
          .from("delivery_queue")
          .select("id, order_id, orders!inner(package_id, data_packages_config!inner(somlink_bundle_id))")
          .eq("status", "pending")
          .or("scheduled_at.is.null,scheduled_at.lte." + new Date().toISOString())
          .not("orders.data_packages_config.somlink_bundle_id", "is", null)
          .limit(20);

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        if (!rows || rows.length === 0) {
          return new Response(JSON.stringify({ success: true, processed: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        let token: string;
        try { token = await somlinkLogin(); }
        catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e?.message || "login failed" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const results: { id: string; ok: boolean; message: string }[] = [];
        for (const r of rows) {
          // Claim atomically so parallel cron runs don't double-send
          const { data: claimed } = await supabaseAdmin
            .from("delivery_queue")
            .update({ status: "processing", last_attempt_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
          if (!claimed) continue;

          try {
            const res = await processSomlinkDelivery(r.id, token, "auto-cron");
            results.push({ id: r.id, ok: res.success, message: res.message });
          } catch (e: any) {
            results.push({ id: r.id, ok: false, message: e?.message || "error" });
            await supabaseAdmin.from("delivery_queue").update({
              status: "failed",
              error_message: `Somlink auto: ${e?.message || "error"}`,
              last_attempt_at: new Date().toISOString(),
            }).eq("id", r.id);
          }
        }

        return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});