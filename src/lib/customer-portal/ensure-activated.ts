import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Idempotently marks portal rows as active when the auth user has a session but
 * `customer_users` is still `invited` (e.g. password reset edge cases).
 *
 * Not wired into a layout yet — call from a future customer-portal shell or middleware.
 */
export async function ensureCustomerActivated(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: userErr.message };
  if (!user?.id) return { ok: false, error: "Unauthorized" };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("customer_users")
    .update({ status: "active", activated_at: now, updated_at: now })
    .eq("auth_user_id", user.id)
    .eq("status", "invited");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
