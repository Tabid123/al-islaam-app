import { createFileRoute } from "@tanstack/react-router";

/**
 * Run from a trusted scheduler only. Set AMTEL_DISPATCH_SECRET in server secrets
 * and pass Authorization: Bearer <secret>. No public/interactive invocation.
 */
export const Route = createFileRoute("/api/public/hooks/amtel-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AMTEL_DISPATCH_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { purchaseAmtelBundle } = await import("@/lib/amtel.server");
        const { data: jobs, error } = await supabaseAdmin.from("amtel_delivery_jobs")
          .select("id,order_id,offering_id,receiver_phone,amount,conversation_id,orders!inner(status,scheduled_for)")
          .eq("status", "pending").order("created_at", { ascending: true }).limit(10);
        if (error) return Response.json({ error: "queue_unavailable" }, { status: 500 });
        const results: { id: string; state: string }[] = [];
        for (const job of jobs || []) {
          const order: any = job.orders;
          if (!["paid", "completed", "payment_confirmed"].includes(order?.status)) continue;
          if (order?.scheduled_for && Date.parse(order.scheduled_for) > Date.now()) continue;
          // Atomic claim: concurrent schedulers cannot invoke AMTEL for same job.
          const { data: claimed, error: claimError } = await supabaseAdmin.from("amtel_delivery_jobs")
            .update({ status: "processing", updated_at: new Date().toISOString() })
            .eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
          if (claimError || !claimed) continue;
          // Processing is permanently non-retryable if process crashes mid-network call.
          // Manual reconciliation must occur before an administrator requeues.
          let result: Awaited<ReturnType<typeof purchaseAmtelBundle>>;
          try {
            result = await purchaseAmtelBundle({
              receiver: job.receiver_phone, offeringId: job.offering_id,
              amount: Number(job.amount), conversationId: job.conversation_id,
            });
          } catch {
            result = { state: "unknown", conversationId: job.conversation_id };
          }
          const now = new Date().toISOString();
          const status = result.state === "success" ? "succeeded"
            : result.state === "rejected" ? "rejected" : "unknown";
          await supabaseAdmin.from("amtel_delivery_jobs").update({
            status, transaction_id: result.transactionId || null,
            result_code: result.resultCode || null,
            result_description: (result.resultDescription || "").slice(0, 500),
            updated_at: now,
          }).eq("id", job.id).eq("status", "processing");
          await supabaseAdmin.from("orders").update(
            status === "succeeded"
              ? { delivery_status: "delivered", delivered_at: now, delivery_notes: "Delivered via AMTEL API" }
              : status === "rejected"
              ? { delivery_status: "failed", delivery_notes: "AMTEL rejected purchase; verify before resending" }
              : { delivery_status: "pending", delivery_notes: "AMTEL response unknown; manual reconciliation required. DO NOT RESEND." }
          ).eq("id", job.order_id);
          results.push({ id: job.id, state: status });
        }
        return Response.json({ processed: results.length, results }, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
