import { PROCOUNTOR_COST_ACCOUNT_MAP } from "@/lib/procountor/tuloslaskelma";

export type RentRollCostBucket = "materials_services" | "personnel" | "other_operating";

/**
 * Classify imported P&L cost lines for rent-roll reporting.
 * - 4xxx → materials & services
 * - 5xxx / 6xxx → personnel
 * - 7xxx–9xxx → other operating (includes financial lines in 9xxx)
 */
export function classifyHistoricalCostBucket(
  accountCode: string | null | undefined,
  costType: string | null | undefined,
): RentRollCostBucket {
  const code = (accountCode ?? "").trim();
  if (/^\d{3,5}$/.test(code)) {
    const major = parseInt(code[0]!, 10);
    if (major === 4) return "materials_services";
    if (major === 5 || major === 6) return "personnel";
    if (major >= 7 && major <= 9) return "other_operating";
  }
  const ct = (costType ?? "").trim();
  if (ct) {
    for (const [acct, mapped] of Object.entries(PROCOUNTOR_COST_ACCOUNT_MAP)) {
      if (mapped === ct) {
        const major = parseInt(acct[0]!, 10);
        if (major === 4) return "materials_services";
        if (major === 5 || major === 6) return "personnel";
        if (major >= 7 && major <= 9) return "other_operating";
      }
    }
  }
  return "other_operating";
}
