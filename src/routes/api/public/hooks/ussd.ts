import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Native (Hormuud) payload shape
const schema = z.object({
  token: z.string().optional(),
  requestid: z.string().optional(),
  sessionid: z.string().min(1).max(200),
  origin: z.string().min(3).max(30),
  ussdcontent: z.string().max(500).optional().nullable(),
  ussdstate: z.string().max(20).optional().nullable(),
  shortcode: z.string().max(20).optional().nullable(),
  issuedon: z.string().max(50).optional().nullable(),
});

// Daato / short code 2555 payload shape
const daatoSchema = z.object({
  token: z.string().optional(),
  requestid: z.union([z.string(), z.number()]).optional(),
  mobile: z.union([z.string(), z.number()]),
  dailogid: z.union([z.string(), z.number()]).optional(),
  dialogid: z.union([z.string(), z.number()]).optional(),
  ussd_request: z.string().max(500).optional().nullable(),
  end_reply: z.union([z.string(), z.boolean()]).optional().nullable(),
  ussd_state: z.string().max(20).optional().nullable(),
  timesent: z.union([z.string(), z.number()]).optional().nullable(),
  shortcode: z.union([z.string(), z.number()]).optional().nullable(),
});

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const ctype = request.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("json")) return (await request.json()) as Record<string, unknown>;
    const text = await request.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/hooks/ussd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedToken = process.env["HORMUUD_USSD_TOKEN"];

        const raw = await readBody(request);
        if (!raw) return new Response("Invalid body", { status: 400 });

        const isDaato = "mobile" in raw || "ussd_request" in raw || "dailogid" in raw || "dialogid" in raw;

        let payload: z.infer<typeof schema>;
        let daato: z.infer<typeof daatoSchema> | null = null;

        if (isDaato) {
          const parsed = daatoSchema.safeParse(raw);
          if (!parsed.success) return new Response("Invalid payload", { status: 400 });
          daato = parsed.data;
          const sid = String(daato.dailogid ?? daato.dialogid ?? daato.requestid ?? "");
          if (!sid) return new Response("Invalid payload", { status: 400 });
          payload = {
            token: daato.token,
            sessionid: sid,
            origin: String(daato.mobile),
            ussdcontent: daato.ussd_request ?? "",
            ussdstate: daato.ussd_state ?? null,
            shortcode: daato.shortcode != null ? String(daato.shortcode) : "2555",
          };
        } else {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return new Response("Invalid payload", { status: 400 });
          payload = parsed.data;
        }

        if (expectedToken && payload.token !== expectedToken) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { handleUssd, logUssd, normalizePhone } = await import("@/lib/ussd-menu.server");
        const origin = normalizePhone(payload.origin);

        await logUssd(payload.sessionid, origin, "in", payload.ussdcontent ?? "", payload.ussdstate);

        let reply;
        try {
          reply = await handleUssd(payload);
        } catch (e) {
          const message = e instanceof Error ? e.message : "error";
          console.error("USSD handler error", e);
          await logUssd(payload.sessionid, origin, "out", `ERROR: ${message}`, "error");
          reply = { ussdcontent: "Cilad farsamo. Fadlan mar kale isku day.", endreply: true };
        }

        await logUssd(payload.sessionid, origin, "out", reply.ussdcontent, reply.endreply ? "end" : "continue");

        if (daato) {
          return Response.json({
            ussd_response: reply.ussdcontent,
            end_reply: reply.endreply ? "true" : "false",
            mobile: String(daato.mobile),
            dialogid: payload.sessionid,
            timesent: new Date().toISOString(),
            ussd_state: reply.endreply ? "end" : "continue",
          });
        }

        return Response.json({
          sessionid: payload.sessionid,
          shortcode: payload.shortcode ?? "",
          origin: payload.origin,
          ussdcontent: reply.ussdcontent,
          endreply: reply.endreply,
        });
      },
    },
  },
});
