import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only AMTEL preflight. Requires the same server-only dispatch secret.
 * No network call to AMTEL and no charging. Never return secret values.
 */
export const Route = createFileRoute("/api/public/amtel-readiness")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.AMTEL_DISPATCH_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const vars = [
          "AMTEL_INITIATOR", "AMTEL_RECEIVER_PARTY", "AMTEL_THIRD_PARTY_ID",
          "AMTEL_API_PASSWORD", "AMTEL_SECURITY_CREDENTIAL",
        ];
        const missing = vars.filter(key => !process.env[key]);
        return Response.json({
          credentials_configured: missing.length === 0,
          missing,
          dispatch_enabled: process.env.AMTEL_API_ENABLED === "true",
          note: "Configuration only. Does not validate AMTEL network access or credentials.",
        }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
