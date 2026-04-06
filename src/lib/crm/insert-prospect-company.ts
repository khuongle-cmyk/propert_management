import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryContactInsertRow } from "@/lib/crm/lead-company-payload";

/**
 * Inserts a prospect row in `customer_companies` and the primary row in `customer_users`.
 * Rolls back the company if the contact insert fails.
 */
export async function insertProspectCompanyWithPrimaryContact(
  supabase: SupabaseClient,
  companyInsert: Record<string, unknown>,
  contactBody: Record<string, unknown>,
): Promise<{ id: string | null; error: { message: string } | null }> {
  const insert = {
    stage: "new",
    status: "prospect",
    ...companyInsert,
  };
  const { data: row, error } = await supabase.from("customer_companies").insert(insert).select("id").maybeSingle();
  if (error) return { id: null, error };
  const id = row?.id as string | undefined;
  if (!id) return { id: null, error: { message: "Insert returned no id" } };

  const email = String(companyInsert.email ?? "").trim().toLowerCase();
  const phone =
    companyInsert.phone === null || companyInsert.phone === undefined
      ? null
      : String(companyInsert.phone).trim() || null;

  const cu = primaryContactInsertRow(contactBody, id, email, phone);
  const { error: cuErr } = await supabase.from("customer_users").insert(cu);
  if (cuErr) {
    await supabase.from("customer_companies").delete().eq("id", id);
    return { id: null, error: cuErr };
  }
  return { id, error: null };
}
