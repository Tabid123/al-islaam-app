import { env } from "cloudflare:workers";

/**
 * Read Cloudflare bindings directly. In TanStack Start's Worker request runtime,
 * process.env can be empty even when the secret is configured on the Worker.
 */
export function getRuntimeSecret(name: string): string | undefined {
  const binding = (env as unknown as Record<string, unknown>)[name];
  if (typeof binding === "string" && binding.length > 0) return binding;
  const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return processValue || undefined;
}
