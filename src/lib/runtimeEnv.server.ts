import { env } from "cloudflare:workers";
import { getRequest } from "@tanstack/react-start/server";

type RuntimeRequest = Request & {
  runtime?: { cloudflare?: { env?: Record<string, unknown> } };
};

/**
 * Nitro 3 carries the Worker bindings on the request runtime.
 * Read them per request so concurrent requests never share mutable credentials.
 */
export function getRuntimeSecret(name: string): string | undefined {
  try {
    const request = getRequest() as RuntimeRequest;
    const value = request.runtime?.cloudflare?.env?.[name];
    if (typeof value === "string" && value.length > 0) return value;
  } catch {
    // Non-request callers can still use native Worker bindings below.
  }

  const binding = (env as unknown as Record<string, unknown>)[name];
  if (typeof binding === "string" && binding.length > 0) return binding;
  const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return processValue || undefined;
}
