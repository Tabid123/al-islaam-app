import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const schema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(6).optional(),
});

export const updateAdminUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: ctx, error: ctxError } = await context.supabase.rpc('get_my_admin_context' as any);
    if (ctxError) throw new Error(ctxError.message);
    if (!(ctx as any)?.is_super_admin) {
      throw new Error('Only super admin can edit admins');
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const attrs: Record<string, unknown> = {};
    if (data.email) attrs.email = data.email;
    if (data.password) attrs.password = data.password;
    if (data.full_name) attrs.user_metadata = { full_name: data.full_name };

    if (Object.keys(attrs).length === 0) return { success: true };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, attrs as any);
    if (error) throw new Error(error.message);

    return { success: true };
  });
