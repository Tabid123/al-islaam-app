import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SOMLINK_BASE = "https://api.data.somlink.net";

export type SomlinkResult =
  | { success: true; message: string }
  | { success: false; message: string };

export async function somlinkLogin(): Promise<string> {
  const phone = process.env.SOMLINK_WALLET_PHONE;
  const password = process.env.SOMLINK_PASSWORD;
  if (!phone || !password) throw new Error("Somlink credentials not configured");

  const res = await fetch(`${SOMLINK_BASE}/auth/data_v3_login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  const token =
    json?.token ||
    json?.access_token ||
    json?.data?.token ||
    json?.data?.access_token;
  if (!res.ok || !token) {
    throw new Error(`Somlink login failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return token as string;
}

export async function somlinkSend(
  token: string,
  bundleId: number,
  receiver: string,
  amount: number,
): Promise<{ result: SomlinkResult; raw: any }> {
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
  const walletPhone = (process.env.SOMLINK_WALLET_PHONE || "").replace(/\D/g, "");
  const digits = receiver.replace(/\D/g, "");
  const dataPhone = digits.startsWith("252") ? digits : `252${digits}`;
  const res = await fetch(`${SOMLINK_BASE}/data/send_data`, {
    method: "POST",
    // Somlink authenticates this endpoint from the JSON `token` field.
    // Sending competing token headers made the live API ignore the body token.
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: cleanToken,
      data_phone: dataPhone,
      wallet_phone: walletPhone,
      amount,
      bundle_id: bundleId,
    }),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    return { result: { success: false, message: json?.message || text.slice(0, 200) }, raw: json };
  }
  const ok =
    json?.success !== false &&
    json?.status !== "failed" &&
    json?.status !== "error" &&
    (json?.code === undefined || json?.code === 200);
  return ok
    ? { result: { success: true, message: json?.message || "OK" }, raw: json }
    : { result: { success: false, message: json?.message || "Somlink returned failure" }, raw: json };
}

/** Process a single delivery_queue row via Somlink. Reusable by admin action and cron. */
export async function processSomlinkDelivery(
  queueId: string,
  token: string,
  actor: string,
): Promise<SomlinkResult> {
  const { data: q, error: qErr } = await supabaseAdmin
    .from("delivery_queue")
    .select("id, order_id, receiver_phone")
    .eq("id", queueId)
    .single();
  if (qErr || !q) throw new Error(qErr?.message || "Delivery not found");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, package_id, receiver_phone")
    .eq("id", q.order_id)
    .single();
  if (!order?.package_id) throw new Error("Order package not found");

  const { data: pkg } = await supabaseAdmin
    .from("data_packages_config")
    .select("somlink_bundle_id, cost_price")
    .eq("id", order.package_id)
    .single();
  if (!pkg?.somlink_bundle_id) throw new Error("Package has no somlink_bundle_id");

  const receiver = (q.receiver_phone || order.receiver_phone || "").replace(/\D/g, "");
  if (receiver.length < 9) throw new Error("Invalid receiver phone");

  const amount = Number(pkg.cost_price ?? 0);
  if (!amount || amount <= 0) throw new Error("Package has no cost price for Somlink");

  const { result, raw } = await somlinkSend(
    token,
    pkg.somlink_bundle_id as number,
    receiver,
    amount,
  );
  const now = new Date().toISOString();

  if (result.success) {
    await supabaseAdmin.from("delivery_queue").update({
      status: "completed",
      completed_at: now,
      last_attempt_at: now,
      provider_response: `Somlink: ${result.message}`,
      somlink_response: raw as any,
      error_message: null,
    }).eq("id", queueId);

    await supabaseAdmin.from("orders").update({
      delivery_status: "delivered",
      delivered_at: now,
      delivery_notes: `Delivered via Somlink API (${actor})`,
    }).eq("id", q.order_id);
  } else {
    await supabaseAdmin.from("delivery_queue").update({
      status: "failed",
      last_attempt_at: now,
      error_message: `Somlink: ${result.message}`,
      somlink_response: (raw ?? null) as any,
    }).eq("id", queueId);
  }

  return result;
}