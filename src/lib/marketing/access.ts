import type { SupabaseClient } from "@supabase/supabase-js";

const MARKETING_ROLES = new Set([
  "owner",
  "manager",
  "customer_service",
  "accounting",
  "viewer",
  "agent",
  "super_admin",
]);

export async function getMarketingAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tenantIds: string[]; isSuperAdmin: boolean; error?: string }> {
  const { data: mem, error } = await supabase.from("memberships").select("tenant_id, role").eq("user_id", userId);
  if (error) return { tenantIds: [], isSuperAdmin: false, error: error.message };
  const rows = (mem ?? []) as { tenant_id: string | null; role: string | null }[];
  const isSuperAdmin = rows.some((m) => String(m.role ?? "").toLowerCase() === "super_admin");
  const tenantIds = [
    ...new Set(
      rows
        .filter((m) => MARKETING_ROLES.has(String(m.role ?? "").toLowerCase()))
        .map((m) => m.tenant_id)
        .filter(Boolean),
    ),
  ] as string[];
  return { tenantIds, isSuperAdmin };
}

export function parseTenantIdParam(url: URL, tenantIds: string[]): string | null {
  const raw = (url.searchParams.get("tenantId") ?? "").trim();
  if (!raw) return tenantIds.length === 1 ? tenantIds[0] : null;
  if (!tenantIds.includes(raw)) return null;
  return raw;
}
