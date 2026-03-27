import type { SupabaseClient } from "@supabase/supabase-js";
import { isPropertyCostType } from "@/lib/property-costs/constants";
import type { PropertyCostEntryRow } from "./net-income-types";

type HistoricalCostRow = {
  id: string;
  property_id: string;
  cost_type: string;
  description: string | null;
  amount_ex_vat: number;
  cost_date: string;
  year: number;
  month: number;
  supplier_name: string | null;
  invoice_number: string | null;
};

export async function loadHistoricalCostsAsEntries(
  supabase: SupabaseClient,
  propertyIds: string[],
  firstMonthDay: string,
  lastMonthDay: string,
): Promise<{ rows: PropertyCostEntryRow[]; error?: string }> {
  const first = new Date(firstMonthDay);
  const last = new Date(lastMonthDay);
  const { data, error } = await supabase
    .from("historical_costs")
    .select("id, property_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number")
    .in("property_id", propertyIds)
    .gte("year", first.getUTCFullYear())
    .lte("year", last.getUTCFullYear());
  if (error) {
    if (error.code === "42P01") return { rows: [] };
    return { rows: [], error: error.message };
  }
  const rows = ((data ?? []) as HistoricalCostRow[])
    .filter((r) => {
      const mk = `${r.year}-${String(r.month).padStart(2, "0")}-01`;
      return mk >= firstMonthDay && mk <= lastMonthDay;
    })
    .map((r) => ({
      id: `hist-${r.id}`,
      property_id: r.property_id,
      cost_type: isPropertyCostType(r.cost_type) ? r.cost_type : "one_off",
      description: r.description ?? "Historical import",
      amount: Number(r.amount_ex_vat) || 0,
      cost_date: r.cost_date,
      period_month: `${r.year}-${String(r.month).padStart(2, "0")}-01`,
      supplier_name: r.supplier_name,
      invoice_number: r.invoice_number,
      notes: "Historical import",
      status: "confirmed" as const,
      source: "csv" as const,
      recurring_template_id: null,
    }));
  return { rows };
}
