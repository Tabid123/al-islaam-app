import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendViaSomlink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { queueId: string }) => {
    if (!data?.queueId || typeof data.queueId !== "string") {
      throw new Error("queueId is required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");
    const { somlinkLogin, processSomlinkDelivery } = await import("./somlink.server");
    const token = await somlinkLogin();
    return await processSomlinkDelivery(data.queueId, token, `admin ${userId}`);
  });

/** Admin manual Somlink send: creates an order + queue row, then sends immediately. */
export const sendManualSomlink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packageId: string; receiverPhone: string; note?: string }) => {
    if (!data?.packageId) throw new Error("packageId is required");
    const receiver = (data?.receiverPhone || "").replace(/\D/g, "");
    if (receiver.length < 9) throw new Error("Lambar sax ah geli");
    return { packageId: data.packageId, receiverPhone: receiver, note: data.note || "" };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { somlinkLogin, processSomlinkDelivery } = await import("./somlink.server");

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("data_packages_config")
      .select("id, package_name, data_amount, selling_price, cost_price, provider_id, somlink_bundle_id")
      .eq("id", data.packageId)
      .single();
    if (pkgErr || !pkg) throw new Error("Xirmada lama helin");
    if (!pkg.somlink_bundle_id) throw new Error("Xirmadan Somlink bundle id ma leh");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_phone: data.receiverPhone,
        receiver_phone: data.receiverPhone,
        package_id: pkg.id,
        provider_id: pkg.provider_id,
        package_name: pkg.package_name,
        data_amount: pkg.data_amount,
        selling_price: pkg.selling_price,
        cost_price: pkg.cost_price,
        status: "paid",
        delivery_status: "pending",
        is_manual: true,
        payment_source: "manual_admin",
        manual_action_by: userId,
        manual_action_at: new Date().toISOString(),
        manual_action_type: "manual_somlink_send",
        manual_action_note: data.note || "Manual Somlink send",
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Dalabka lama abuuri karin");

    const { data: queue, error: qErr } = await supabaseAdmin
      .from("delivery_queue")
      .insert({
        order_id: order.id,
        receiver_phone: data.receiverPhone,
        provider_name: "Somlink",
        status: "processing",
        last_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (qErr || !queue) throw new Error(qErr?.message || "Queue lama abuuri karin");

    const token = await somlinkLogin();
    const result = await processSomlinkDelivery(queue.id, token, `admin ${userId} (manual)`);
    return { ...result, orderId: order.id };
  });