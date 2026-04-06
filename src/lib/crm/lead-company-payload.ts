import {
  normalizeLeadCompanySize,
  normalizeLeadCompanyType,
  resolveContactPersonName,
} from "@/lib/crm/finnish-company";

export function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function pick(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (body[k] !== undefined) return body[k];
  }
  return undefined;
}

/** Resolved first/last for `customer_users` from API-style body keys. */
export function resolvedPrimaryContactNames(body: Record<string, unknown>): { first_name: string; last_name: string } {
  const fn = strOrNull(body.contact_first_name);
  const ln = strOrNull(body.contact_last_name);
  if (fn || ln) {
    return { first_name: fn ?? "", last_name: ln && ln.length ? ln : "—" };
  }
  const full = resolveContactPersonName({
    contact_person_name: body.contact_person_name as string | null | undefined,
    contact_name: body.contact_name as string | null | undefined,
    contact_first_name: undefined,
    contact_last_name: undefined,
  }).trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" ") || "—",
  };
}

/** Row for inserting the primary `customer_users` record for a new company. */
export function primaryContactInsertRow(
  body: Record<string, unknown>,
  companyId: string,
  email: string,
  phone: string | null,
): Record<string, unknown> {
  const { first_name, last_name } = resolvedPrimaryContactNames(body);
  return {
    company_id: companyId,
    first_name,
    last_name,
    email,
    phone,
    title: strOrNull(body.contact_title),
    direct_phone: strOrNull(pick(body, "contact_direct_phone", "contact_phone_direct")),
    is_primary_contact: true,
    role: "company_admin",
    status: "invited",
  };
}

/**
 * Maps API/form JSON to `customer_companies` extension columns (billing, IDs, etc.).
 * Does not include `name`, pipeline fields, or contact columns — those are set by callers.
 */
export function leadCompanyFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const ct = normalizeLeadCompanyType(strOrNull(pick(body, "company_type")) ?? undefined);
  const cs = normalizeLeadCompanySize(strOrNull(pick(body, "company_size")) ?? undefined);
  const yTunnus = strOrNull(pick(body, "y_tunnus", "vat_number"));
  return {
    business_id: strOrNull(pick(body, "business_id", "company_registration")),
    y_tunnus: yTunnus ? yTunnus.toUpperCase() : null,
    company_type: ct,
    industry: strOrNull(pick(body, "industry", "industry_sector")),
    company_size: cs,
    website: strOrNull(pick(body, "website", "company_website")),
    billing_address: strOrNull(pick(body, "billing_address", "billing_street")),
    billing_postal_code: strOrNull(body.billing_postal_code),
    billing_city: strOrNull(body.billing_city),
    billing_email: strOrNull(body.billing_email)?.toLowerCase() ?? null,
    einvoice_address: strOrNull(pick(body, "einvoice_address", "e_invoice_address")),
    einvoice_operator: strOrNull(pick(body, "einvoice_operator", "e_invoice_operator")),
    einvoice_operator_code: strOrNull(pick(body, "einvoice_operator_code", "e_invoice_operator_code")),
  };
}

/** For PATCH: only include company extension keys that appear on `body`. */
export function leadCompanyPatchFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const full = leadCompanyFieldsFromBody(body);
  const out: Record<string, unknown> = {};
  if (body.business_id !== undefined || body.company_registration !== undefined) out.business_id = full.business_id;
  if (body.y_tunnus !== undefined || body.vat_number !== undefined) out.y_tunnus = full.y_tunnus;
  if (body.company_type !== undefined) out.company_type = full.company_type;
  if (body.industry !== undefined || body.industry_sector !== undefined) out.industry = full.industry;
  if (body.company_size !== undefined) out.company_size = full.company_size;
  if (body.website !== undefined || body.company_website !== undefined) out.website = full.website;
  if (body.billing_address !== undefined || body.billing_street !== undefined) out.billing_address = full.billing_address;
  if (body.billing_postal_code !== undefined) out.billing_postal_code = full.billing_postal_code;
  if (body.billing_city !== undefined) out.billing_city = full.billing_city;
  if (body.billing_email !== undefined) out.billing_email = full.billing_email;
  if (body.einvoice_address !== undefined || body.e_invoice_address !== undefined) {
    out.einvoice_address = full.einvoice_address;
  }
  if (body.einvoice_operator !== undefined || body.e_invoice_operator !== undefined) {
    out.einvoice_operator = full.einvoice_operator;
  }
  if (body.einvoice_operator_code !== undefined || body.e_invoice_operator_code !== undefined) {
    out.einvoice_operator_code = full.einvoice_operator_code;
  }
  return out;
}

/** Partial update for primary contact when PATCH body includes person fields. */
export function primaryContactPatchFromBody(body: Record<string, unknown>): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (
    body.contact_person_name !== undefined ||
    body.contact_name !== undefined ||
    body.contact_first_name !== undefined ||
    body.contact_last_name !== undefined
  ) {
    const { first_name, last_name } = resolvedPrimaryContactNames(body);
    patch.first_name = first_name;
    patch.last_name = last_name;
  }
  if (body.contact_title !== undefined) patch.title = strOrNull(body.contact_title);
  if (body.contact_direct_phone !== undefined || body.contact_phone_direct !== undefined) {
    patch.direct_phone = strOrNull(pick(body, "contact_direct_phone", "contact_phone_direct"));
  }
  if (body.email !== undefined) patch.email = (body.email ?? "").toString().trim().toLowerCase() || null;
  if (body.phone !== undefined) patch.phone = (body.phone ?? "").toString().trim() || null;
  return Object.keys(patch).length ? patch : null;
}
