import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** An admin-initiated inventory inquiry, never a bundle purchase. */
export const checkAmtelBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin");
    if (error || !isAdmin) throw new Error("Admin access required");
    if (process.env.AMTEL_BALANCE_TEST_ENABLED !== "true") {
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
