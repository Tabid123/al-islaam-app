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
    // This is a read-only inventory inquiry, already restricted to authenticated admins.
    // Do not depend on the optional dispatcher feature flag used for purchases.
    const { queryAmtelBalance } = await import("./amtel.server");
    const id = "BAL_" + crypto.randomUUID().replace(/-/g, "");
    let response;
    try {
      response = await queryAmtelBalance(id);
    } catch (error: any) {
      const message = String(error?.message || "");
      const missing = message.match(/^Missing AMTEL secret: ([A-Z0-9_]+)$/);
      if (missing) {
        return {
          state: "config_error" as const,
          resultCode: null,
          message: `Cloudflare runtime is missing: ${missing[1]}`,
          conversationId: id,
        };
      }
      return {
        state: "server_error" as const,
        resultCode: null,
        message: "AMTEL request setup failed before contacting the provider.",
        conversationId: id,
      };
    }
    return {
      state: response.state,
      resultCode: response.resultCode ?? null,
      message: (response.resultDescription || (
        response.state === "unknown" ? "AMTEL response could not be confirmed." : ""
      )).slice(0, 200),
      conversationId: response.conversationId,
    };
  });
