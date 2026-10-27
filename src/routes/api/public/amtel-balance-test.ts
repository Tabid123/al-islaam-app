import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeSecret } from "@/lib/runtimeEnv.server";

/**
 * Manual, read-only AMTEL inventory connectivity test.
 * Requires dispatcher secret and a separately enabled balance-test switch.
 * Never exposes credentials or raw SOAP responses.
 */
export const Route = createFileRoute("/api/public/amtel-balance-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = getRuntimeSecret("AMTEL_DISPATCH_SECRET");
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        if (getRuntimeSecret("AMTEL_BALANCE_TEST_ENABLED") !== "true") {
          return Response.json({ error: "balance_test_disabled" }, { status: 503 });
        }
        const { queryAmtelBalance } = await import("@/lib/amtel.server");
        const id = "BAL_" + crypto.randomUUID().replace(/-/g, "");
        const result = await queryAmtelBalance(id);
        return Response.json({
          state: result.state,
          result_code: result.resultCode ?? null,
          description: (result.resultDescription ?? "").slice(0, 200),
          conversation_id: result.conversationId,
          note: "Balance inquiry only: no bundle purchase requested.",
        }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
