import { createFileRoute } from '@tanstack/react-router';

// Read-only readiness check. Never logs in, charges, or dispatches an order.
export const Route = createFileRoute('/api/public/somlink-status')({
  server: {
    handlers: {
      GET: async () => Response.json({
        configured: Boolean(
          process.env.SOMLINK_WALLET_PHONE && process.env.SOMLINK_PASSWORD &&
          (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
          (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEYS)
        ),
      }, { headers: { 'Cache-Control': 'no-store' } }),
    },
  },
});
