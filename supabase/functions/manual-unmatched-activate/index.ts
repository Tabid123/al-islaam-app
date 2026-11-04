import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This endpoint handles only an admin-selected unmatched receipt. It does not
// replace activate-package, which is shared by existing Android delivery APKs.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const phone9 = (value: unknown) => digits(value).slice(-9);
const uuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ""));
const cleanMenu = (value: unknown) => String(value || "").trim().replace(/[,|#]/g, "").trim();
const normalizeProvider = (value: string) => value.trim().toLowerCase();

function formatCost(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "";
}

function buildCode(template: string, pkg: any, receiverPhone: string, costPrice: number, instruction: any): { code: string; pin: string | null } {
  let raw = template.trim();
  const pkgPin = digits(pkg?.sim_password);
  const instructionPin = digits(instruction?.sim_password);
  const pin = pkgPin || instructionPin || "5516";
  // Use the package's interactive menu path for *870* where configured.
  if (raw.startsWith("*870*") && (cleanMenu(pkg.menu1) || cleanMenu(pkg.menu2))) {
    raw = raw.split("|")[0] + "|" + (cleanMenu(pkg.menu1) || "1") + "," + (cleanMenu(pkg.menu2) || "1");
  }
  raw = raw
    .replace(/\{receiver_phone\}/g, receiverPhone)
    .replace(/\{cost_price\}/g, formatCost(costPrice))
    .replace(/\{sim_password\}/g, pin)
    .replace(/\{package_code\}/g, String(pkg.ussd_code || ""));
  const split = raw.indexOf("|");
  const suffix = split < 0 ? "" : raw.slice(split).replace(/#/g, "").trim();
  let dial = (split < 0 ? raw : raw.slice(0, split)).replace(/\s+/g, "").trim();
  dial = dial.replace(/^(\*\d+?)(\d{9})(\*)/, "$1*$2$3").replace(/\*{2,}/g, "*");
  if (dial && !dial.endsWith("#")) dial += "#";
  const code = dial + suffix;
  if (!/^\*\d/.test(dial) || !dial.includes("#") || /[{}()]/.test(code) ||
      /receiver_phone|cost_price|sim_password|package_code/i.test(code)) {
    throw new Error("USSD code-ka xirmadan ma dhammaystirna; hubi delivery instructions.");
  }
  return { code, pin: (pkgPin || instructionPin) || null };
}

async function getInstruction(db: any, providerId: string, packageId: string, categoryId: string | null) {
  const single = async (query: any) => {
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data?.code_template ? data : null;
  };
  const fields = "code_template, sim_password";
  const own = await single(db.from("delivery_instructions").select(fields)
    .eq("provider_id", providerId).eq("package_id", packageId));
  if (own) return own;
  if (categoryId) {
    const category = await single(db.from("delivery_instructions").select(fields)
      .eq("provider_id", providerId).eq("category_id", categoryId).is("package_id", null));
    if (category) return category;
  }
  return single(db.from("delivery_instructions").select(fields)
    .eq("provider_id", providerId).is("category_id", null).is("package_id", null));
}

async function makeItem(db: any, packageId: string, providerId: string, receiver: string, providerName: string, costOverride?: number) {
  const { data: pkg, error } = await db.from("data_packages_config")
    .select("id,provider_id,category_id,package_name,ussd_code,cost_price,sim_password,menu1,menu2,is_active,is_discovery_root")
    .eq("id", packageId).single();
  if (error || !pkg || !pkg.is_active || pkg.provider_id !== providerId) {
    throw new Error("Xirmada la doortay ma shaqeynayso ama shirkadda kuma jirto.");
  }
  if (pkg.is_discovery_root) {
    throw new Error("Dooro xirmo diyaarsan, ma aha xirmo baaris (discovery root).");
  }
  const instruction = await getInstruction(db, providerId, pkg.id, pkg.category_id);
  const template = String(instruction?.code_template || "").trim() ||
    (String(pkg.ussd_code || "").trim().startsWith("*") ? String(pkg.ussd_code) : "");
  if (!template) throw new Error("Xirmadan USSD delivery instructions uma diyaarsana.");
  const cost = costOverride ?? Number(pkg.cost_price);
  if (!Number.isFinite(cost) || cost < 0) throw new Error("Qiimaha kharashka xirmadan ma saxna.");
  const built = buildCode(template, pkg, receiver, cost, instruction);
  return {
    provider_name: normalizeProvider(providerName),
    receiver_phone: receiver,
    ussd_code: built.code,
    package_code: pkg.ussd_code || null,
    pin_code: built.pin,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "POST required" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Server configuration is incomplete");

    const bearer = req.headers.get("authorization") || "";
    const token = /^Bearer\s+(.+)$/i.exec(bearer)?.[1];
    if (!token) return respond({ success: false, error: "Login required" }, 401);

    const authClient = createClient(url, anonKey);
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth.user) return respond({ success: false, error: "Login expired" }, 401);

    const db = createClient(url, serviceKey);
    const { data: role, error: roleError } = await db.from("user_roles")
      .select("role").eq("user_id", auth.user.id).in("role", ["admin", "super_admin"])
      .limit(1).maybeSingle();
    if (roleError) throw roleError;
    if (!role) return respond({ success: false, error: "Admin access required" }, 403);

    // Match the dashboard's legacy permission rule: no explicit permission
    // rows means full access, otherwise manage_orders is required.
    const { data: permissions, error: permissionError } = await db.from("admin_permissions")
      .select("permission_key").eq("user_id", auth.user.id);
    if (permissionError) throw permissionError;
    if (role.role !== "super_admin" && permissions?.length &&
        !permissions.some((p: any) => p.permission_key === "manage_orders")) {
      return respond({ success: false, error: "Manage orders permission required" }, 403);
    }

    const { orderId, providerName, receiverPhone } = await req.json();
    if (!uuid(orderId)) return respond({ success: false, error: "Order ID ma saxna." });
    const { data: order, error: orderError } = await db.from("orders")
      .select("id,tx_id,package_id,provider_id,receiver_phone,payment_source,status,delivery_status")
      .eq("id", orderId).single();
    if (orderError) throw orderError;
    if (!order || order.payment_source !== "offline_unmatched_retry" ||
        !["pending", "processing"].includes(order.delivery_status) ||
        !["payment_confirmed", "paid", "completed"].includes(order.status)) {
      return respond({ success: false, error: "Dalabkani uma qalmo dib-u-dirista unmatched." });
    }
    const receiver = phone9(order.receiver_phone);
    if (!/^\d{9}$/.test(receiver) || receiver !== phone9(receiverPhone)) {
      return respond({ success: false, error: "Lambarka qaataha kuma waafaqsana dalabka." });
    }

    // The order must belong to a real, still-unmatched payment receipt.
    const txId = String(order.tx_id || "");
    let receiptQuery = db.from("payment_receipts").select("id,status,matched_order_id,tx_id");
    if (txId.startsWith("unmatched:")) {
      const receiptId = txId.slice("unmatched:".length);
      if (!uuid(receiptId)) return respond({ success: false, error: "Receipt ID ma saxna." });
      receiptQuery = receiptQuery.eq("id", receiptId);
    } else if (txId) {
      receiptQuery = receiptQuery.eq("tx_id", txId);
    } else {
      return respond({ success: false, error: "Receipt transaction ID ma jiro." });
    }
    const { data: receipt, error: receiptError } = await receiptQuery.maybeSingle();
    if (receiptError) throw receiptError;
    if (!receipt || receipt.status !== "unmatched" ||
        (receipt.matched_order_id && receipt.matched_order_id !== order.id)) {
      return respond({ success: false, error: "Receipt-ka hore ayaa loo maareeyay ama lama helin." });
    }

    const { data: provider, error: providerError } = await db.from("providers_config")
      .select("id,provider_name,is_active").eq("id", order.provider_id).single();
    if (providerError) throw providerError;
    if (!provider || !provider.is_active || normalizeProvider(provider.provider_name) !== normalizeProvider(String(providerName || ""))) {
      return respond({ success: false, error: "Shirkadda la doortay kuma waafaqsana dalabka." });
    }
    const providerSlug = normalizeProvider(provider.provider_name);

    const { data: existing, error: existingError } = await db.from("delivery_queue")
      .select("id,status,ussd_code,dispatched_at").eq("order_id", order.id);
    if (existingError) throw existingError;
    if (existing?.length) {
      const ambiguous = existing.some((q: any) => !["pending", "scheduled", "processing", "completed"].includes(q.status) ||
        (providerSlug !== "somlink" && !String(q.ussd_code || "").trim()));
      if (ambiguous) return respond({ success: false, error: "Saf hore oo aan caddayn ayaa jira. Hubi intaadan dib u dirin." });
      return respond({ success: true, route: providerSlug === "somlink" ? "somlink" : "ussd", queueId: existing[0].id, alreadyQueued: true });
    }

    if (providerSlug === "somlink") {
      const { data, error } = await db.rpc("enqueue_somlink_delivery", { p_order_id: order.id });
      if (error) throw error;
      if (!data) throw new Error("Somlink queue lama diyaarin.");
      return respond({ success: true, route: "somlink", queueId: data });
    }
    if (providerSlug === "amtel") {
      const { data, error } = await db.rpc("enqueue_amtel_delivery", { p_order_id: order.id });
      if (error) throw error;
      if (!data) throw new Error("Amtel job lama diyaarin.");
      return respond({ success: true, route: "amtel", queueId: data });
    }

    // Preserve source-package bundling and per-target delays; never silently
    // replace a multi-step configured purchase with a single USSD request.
    const { data: rules, error: ruleError } = await db.from("package_delivery_rules")
      .select("target_package_id,execution_order,delivery_count,delay_minutes")
      .eq("source_package_id", order.package_id).eq("is_active", true)
      .order("execution_order", { ascending: true });
    if (ruleError) throw ruleError;

    const items: any[] = [];
    if (rules?.length) {
      for (const rule of rules) {
        const { data: target, error: targetError } = await db.from("data_packages_config")
          .select("cost_price").eq("id", rule.target_package_id).single();
        if (targetError) throw targetError;
        const amount = Number(target.cost_price);
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Kharashka target package ma saxna.");
        const whole = Math.floor(amount);
        const fraction = Math.round((amount - whole) * 100) / 100;
        const parts = fraction < .001 || whole === 0 ? [amount] : [whole, fraction];
        const count = Number(rule.delivery_count);
        if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Delivery count ma saxna.");
        for (const part of parts) {
          const base = await makeItem(db, rule.target_package_id, provider.id, receiver, provider.provider_name, part);
          for (let i = 0; i < count; i++) {
            const delay = Number(rule.delay_minutes) > 0 ? Number(rule.delay_minutes) * i * 60_000 : (count > 1 ? i * 60_000 : 0);
            items.push({ ...base, order_id: order.id, status: delay ? "scheduled" : "pending", scheduled_at: new Date(Date.now() + delay).toISOString() });
          }
        }
      }
    } else {
      const base = await makeItem(db, order.package_id, provider.id, receiver, provider.provider_name);
      items.push({ ...base, order_id: order.id, status: "pending" });
    }
    if (!items.length || items.length > 24) throw new Error("Delivery steps-ka ayaa badan ama ma jiraan.");

    // The database row-locks the order and atomically inserts the full bundle.
    // Two admins retrying the same receipt cannot create duplicate USSD charges.
    const { data: queued, error: queueError } = await db.rpc(
      "enqueue_manual_unmatched_ussd",
      { p_order_id: order.id, p_items: items },
    );
    if (queueError) throw queueError;
    if (!queued?.success || !queued.queueId) throw new Error("Safkii dirista lama xaqiijin.");
    return respond({ ...queued, route: "ussd" });
  } catch (error) {
    console.error("manual-unmatched-activate error", error);
    return respond({ success: false, error: error instanceof Error ? error.message : "Delivery error" });
  }
});
