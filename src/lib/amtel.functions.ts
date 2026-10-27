import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** An admin-initiated inventory inquiry, never a bundle purchase. */
export const checkAmtelBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .limit(1)
      .maybeSingle();
    if (error || !role) throw new Error("Admin access required");
    // In Cloudflare Workers, bindings may be available through cloudflare:workers even
    // when Nitro does not populate process.env for server functions.
    let flag = process.env.AMTEL_BALANCE_TEST_ENABLED;
    try {
      const workers = await import("cloudflare:workers");
      flag = (workers.env as Record<string, string>).AMTEL_BALANCE_TEST_ENABLED ?? flag;
    } catch { /* Non-Cloudflare runtime: use process.env */ }
    if (flag?.trim().toLowerCase() !== "true") {
      return { state: "disabled" as const, message: "AMTEL balance test is disabled." };
    }
    const { queryAmtelBalance } = await import("./amtel.server");
    const id = "BAL_" + crypto.randomUUID().replace(/-/g, "");
    const response = await queryAmtelBalance(id);
    return {
      state: response.state,
      resultCode: response.resultCode ?? null,
      message: (response.resultDescription || (
        response.state === "unknown" ? "AMTEL response could not be confirmed." : ""
      )).slice(0, 200),
      conversationId: response.conversationId,
    };
  });
