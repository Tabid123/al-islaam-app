import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface UssdRequest {
  sessionid: string;
  origin: string;
  shortcode?: string | null;
  ussdcontent?: string | null;
  ussdstate?: string | null;
}

export interface UssdReply {
  ussdcontent: string;
  endreply: boolean;
}

const PAGE_SIZE = 6;

export function normalizePhone(raw: string): string {
  let p = (raw || "").replace(/\D/g, "");
  if (p.length === 12 && p.startsWith("252")) p = p.slice(3);
  if (p.length === 10 && p.startsWith("0")) p = p.slice(1);
  return p;
}

function isValidPhone(p: string) {
  return /^\d{9}$/.test(p);
}

interface SessionState {
  provider_id?: string;
  provider_name?: string;
  category_id?: string;
  package_id?: string;
  package_name?: string;
  price?: number;
  receiver_phone?: string;
  page?: number;
}

interface SessionRow {
  id: string;
  step: string;
  state: SessionState;
}

function validity(v: string | null | undefined) {
  if (!v) return "";
  return /^\d+$/.test(String(v).trim()) ? `${v} mln` : String(v);
}

function money(v: number | string) {
  return `$${Number(v).toFixed(2)}`;
}

function paginate<T>(items: T[], page: number) {
  const start = page * PAGE_SIZE;
  return { slice: items.slice(start, start + PAGE_SIZE), hasNext: items.length > start + PAGE_SIZE };
}

function renderList(title: string, items: string[], page: number, hasNext: boolean, hasBack: boolean) {
  const lines = [title];
  items.forEach((label, i) => lines.push(`${page * PAGE_SIZE + i + 1}. ${label}`));
  if (hasNext) lines.push("98. Xiga");
  if (page > 0) lines.push("97. Hore");
  if (hasBack) lines.push("0. Dib");
  return lines.join("\n");
}

async function getSession(sessionid: string, origin: string, shortcode?: string | null): Promise<SessionRow> {
  const { data } = await supabaseAdmin
    .from("ussd_sessions")
    .select("id, step, state")
    .eq("sessionid", sessionid)
    .maybeSingle();
  if (data) return data as unknown as SessionRow;

  const { data: created, error } = await supabaseAdmin
    .from("ussd_sessions")
    .insert({ sessionid, origin, shortcode: shortcode ?? null, step: "start", state: {} })
    .select("id, step, state")
    .single();
  if (error) throw error;
  return created as unknown as SessionRow;
}

async function save(id: string, step: string, state: SessionState, lastInput?: string | null, closed = false) {
  await supabaseAdmin
    .from("ussd_sessions")
    .update({ step, state: state as never, last_input: lastInput ?? null, is_closed: closed })
    .eq("id", id);
}

export async function logUssd(
  sessionid: string,
  origin: string | null,
  direction: "in" | "out",
  content: string | null,
  ussdstate?: string | null,
) {
  try {
    await supabaseAdmin.from("ussd_logs").insert({ sessionid, origin, direction, content, ussdstate: ussdstate ?? null });
  } catch {
    /* logging must never break the flow */
  }
}

export async function handleUssd(req: UssdRequest): Promise<UssdReply> {
  const origin = normalizePhone(req.origin);
  const input = (req.ussdcontent ?? "").trim();
  const state = (req.ussdstate ?? "").toLowerCase();

  const session = await getSession(req.sessionid, origin, req.shortcode);

  if (state === "end") {
    await save(session.id, session.step, session.state, input, true);
    return { ussdcontent: "Mahadsanid.", endreply: true };
  }

  if (state === "begin" || session.step === "start") {
    return showProviders(session, 0);
  }

  switch (session.step) {
    case "providers":
      return handleProviders(session, input);
    case "categories":
      return handleCategories(session, input);
    case "packages":
      return handlePackages(session, input);
    case "receiver_choice":
      return handleReceiverChoice(session, input);
    case "receiver_input":
      return handleReceiverInput(session, input);
    case "confirm":
      return handleConfirm(session, input);
    default:
      return showProviders(session, 0);
  }
}

async function loadProviders() {
  // Same source the app uses (get_active_providers RPC)
  const { data } = await supabaseAdmin.rpc("get_active_providers");
  const rows = (data ?? []) as Array<{ id: string; provider_name: string; display_order: number | null }>;
  return [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

async function showProviders(session: SessionRow, page: number): Promise<UssdReply> {
  const providers = await loadProviders();
  if (providers.length === 0) return { ussdcontent: "Adeeg lama helin. Mar kale isku day.", endreply: true };
  const { slice, hasNext } = paginate(providers, page);
  await save(session.id, "providers", { ...session.state, page });
  return {
    ussdcontent: renderList("Al-islaam Data\nDooro shirkadda:", slice.map((p) => p.provider_name), page, hasNext, false),
    endreply: false,
  };
}

async function handleProviders(session: SessionRow, input: string): Promise<UssdReply> {
  const page = session.state.page ?? 0;
  const providers = await loadProviders();
  if (input === "98") return showProviders(session, page + 1);
  if (input === "97") return showProviders(session, Math.max(0, page - 1));

  const idx = Number(input) - 1;
  const chosen = providers[idx];
  if (!chosen) return showProviders(session, page);

  return showCategories({ ...session, state: { provider_id: chosen.id, provider_name: chosen.provider_name } }, 0);
}

async function loadCategories(providerId: string) {
  // Same source the app uses (get_active_categories RPC)
  const { data } = await supabaseAdmin.rpc("get_active_categories", { p_provider_id: providerId });
  const rows = (data ?? []) as Array<{ id: string; category_name: string; display_order: number | null }>;
  return [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

async function showCategories(session: SessionRow, page: number): Promise<UssdReply> {
  const providerId = session.state.provider_id!;
  const cats = await loadCategories(providerId);
  if (cats.length === 0) {
    // No categories: jump straight to packages
    return showPackages({ ...session, state: { ...session.state, category_id: undefined } }, 0);
  }
  const { slice, hasNext } = paginate(cats, page);
  await save(session.id, "categories", { ...session.state, page });
  return {
    ussdcontent: renderList(`${session.state.provider_name}\nDooro nooca:`, slice.map((c) => c.category_name), page, hasNext, true),
    endreply: false,
  };
}

async function handleCategories(session: SessionRow, input: string): Promise<UssdReply> {
  const page = session.state.page ?? 0;
  if (input === "0") return showProviders(session, 0);
  if (input === "98") return showCategories(session, page + 1);
  if (input === "97") return showCategories(session, Math.max(0, page - 1));

  const cats = await loadCategories(session.state.provider_id!);
  const chosen = cats[Number(input) - 1];
  if (!chosen) return showCategories(session, page);

  return showPackages({ ...session, state: { ...session.state, category_id: chosen.id } }, 0);
}

async function loadPackages(providerId: string, categoryId?: string) {
  // Includes USSD-only packages (hidden from the app)
  const { data } = await supabaseAdmin
    .from("data_packages_config")
    .select("*")
    .eq("is_active", true)
    .eq("provider_id", providerId)
    .order("display_order")
    .order("selling_price");
  let rows = (data ?? []) as Array<{
    id: string;
    package_name: string;
    data_amount: string | null;
    selling_price: number;
    validity_days: string | null;
    category_id: string | null;
    display_order: number | null;
    is_ussd_only?: boolean;
  }>;
  if (categoryId) rows = rows.filter((p) => p.category_id === categoryId || p.is_ussd_only);
  return [...rows].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || Number(a.selling_price) - Number(b.selling_price),
  );
}

async function showPackages(session: SessionRow, page: number): Promise<UssdReply> {
  const pkgs = await loadPackages(session.state.provider_id!, session.state.category_id);
  if (pkgs.length === 0) return { ussdcontent: "Xirmooyin lama helin. Mahadsanid.", endreply: true };
  const { slice, hasNext } = paginate(pkgs, page);
  await save(session.id, "packages", { ...session.state, page });
  return {
    ussdcontent: renderList(
      "Dooro xirmada:",
      slice.map((p) => {
        const parts = [p.package_name || p.data_amount || "Xirmo"];
        if (p.data_amount && p.data_amount !== p.package_name) parts.push(p.data_amount);
        if (p.validity_days) parts.push(validity(p.validity_days));
        return `${parts.join(" ")} - ${money(p.selling_price)}`;
      }),
      page,
      hasNext,
      true,
    ),
    endreply: false,
  };
}

async function handlePackages(session: SessionRow, input: string): Promise<UssdReply> {
  const page = session.state.page ?? 0;
  if (input === "0") return showCategories(session, 0);
  if (input === "98") return showPackages(session, page + 1);
  if (input === "97") return showPackages(session, Math.max(0, page - 1));

  const pkgs = await loadPackages(session.state.provider_id!, session.state.category_id);
  const chosen = pkgs[Number(input) - 1];
  if (!chosen) return showPackages(session, page);

  const detail = [
    chosen.package_name || chosen.data_amount || "Xirmo",
    chosen.data_amount && chosen.data_amount !== chosen.package_name ? chosen.data_amount : "",
    validity(chosen.validity_days),
  ]
    .filter(Boolean)
    .join(" ");

  const newState: SessionState = {
    ...session.state,
    package_id: chosen.id,
    package_name: detail,
    price: Number(chosen.selling_price),
  };
  await save(session.id, "receiver_choice", newState);
  return {
    ussdcontent: `${detail}\nQiimo: ${money(chosen.selling_price)}\n\nLambarka helaya:\n1. Lambarkayga\n2. Lambar kale\n0. Dib`,
    endreply: false,
  };
}

async function handleReceiverChoice(session: SessionRow, input: string): Promise<UssdReply> {
  if (input === "0") return showPackages(session, 0);
  if (input === "1") {
    const { data: row } = await supabaseAdmin.from("ussd_sessions").select("origin").eq("id", session.id).single();
    const phone = normalizePhone(row?.origin ?? "");
    return confirmScreen(session, phone);
  }
  if (input === "2") {
    await save(session.id, "receiver_input", session.state);
    return { ussdcontent: "Geli lambarka helaya (tusaale 61XXXXXXX):", endreply: false };
  }
  return {
    ussdcontent: "Dooro sax ah:\n1. Lambarkayga\n2. Lambar kale\n0. Dib",
    endreply: false,
  };
}

async function handleReceiverInput(session: SessionRow, input: string): Promise<UssdReply> {
  const phone = normalizePhone(input);
  if (!isValidPhone(phone)) {
    return { ussdcontent: "Lambar sax ah geli (9 lambar):", endreply: false };
  }
  return confirmScreen(session, phone);
}

async function confirmScreen(session: SessionRow, receiver: string): Promise<UssdReply> {
  const newState = { ...session.state, receiver_phone: receiver };
  await save(session.id, "confirm", newState);
  return {
    ussdcontent:
      `Xaqiiji dalabka:\n${newState.provider_name}\n${newState.package_name}\nQiimo: ${money(newState.price ?? 0)}\nLambar: ${receiver}\n\n1. Haa\n2. Maya`,
    endreply: false,
  };
}

async function handleConfirm(session: SessionRow, input: string): Promise<UssdReply> {
  if (input !== "1") {
    await save(session.id, "cancelled", session.state, input, true);
    return { ussdcontent: "Dalabka waa la joojiyay. Mahadsanid.", endreply: true };
  }

  const { data: row } = await supabaseAdmin.from("ussd_sessions").select("origin").eq("id", session.id).single();
  const origin = normalizePhone(row?.origin ?? "");
  const s = session.state;

  // Payment destination (admin-configured)
  const { data: payProviders } = await supabaseAdmin
    .from("payment_providers_config")
    .select("provider_name, payment_number")
    .eq("is_active", true)
    .order("display_order")
    .limit(1);
  const payProvider = payProviders?.[0];

  const { error } = await supabaseAdmin.from("pending_online_payments").insert({
    verified_phone: origin,
    sender_phone: origin,
    receiver_phone: s.receiver_phone!,
    provider_id: s.provider_id!,
    package_id: s.package_id!,
    payment_provider: payProvider?.provider_name ?? "",
    expected_amount: s.price ?? 0,
    status: "pending",
  });

  if (error) {
    await save(session.id, "error", s, input, true);
    return { ussdcontent: "Cilad farsamo. Fadlan mar kale isku day.", endreply: true };
  }

  await save(session.id, "done", s, input, true);

  const number = payProvider?.payment_number ?? "";
  return {
    ussdcontent:
      `Dalabkaaga waa la diiwaangeliyay.\n${s.package_name} - $${s.price}\nLambar: ${s.receiver_phone}\n\nLacagta $${s.price} u dir: ${number}\nMarka lacagta la helo si toos ah ayaa laguu dirayaa.`,
    endreply: true,
  };
}