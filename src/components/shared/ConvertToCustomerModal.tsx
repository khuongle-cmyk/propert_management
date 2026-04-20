"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeSpaceType } from "@/lib/crm/lead-import-parse";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { formatPropertyLabel } from "@/lib/properties/label";

const SPACE_TYPE_OPTIONS = ["Office", "Meeting room", "Venue", "Coworking", "Virtual Office"] as const;
const COMPANY_SIZE_OPTIONS = ["1-5", "6-10", "11-25", "26-50", "51-100", "100+"] as const;

/** Minimum lead fields required to open the convert modal (matches `public.leads` select *). */
export type ConvertToCustomerLead = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  company_name: string;
  contact_person_name: string;
  business_id?: string | null;
  email: string;
  phone?: string | null;
  billing_street?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  industry_sector?: string | null;
  company_size?: string | null;
  interested_space_type?: string | null;
  notes?: string | null;
};

export type ConvertModalProperty = { id: string; name: string | null; city: string | null; tenant_id: string };

/** Row returned from `customer_companies` after insert. */
export type CustomerCompany = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  name: string;
  business_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  industry: string | null;
  company_size: string | null;
  space_type: string | null;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ConvertToCustomerModalProps = {
  lead: ConvertToCustomerLead | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customerCompany: CustomerCompany) => void;
  onError?: (message: string) => void;
};

const PETROL = "#21524F";
const BORDER = "#E8E4DD";
const TEXT = "#1A1A1A";
const MUTED = "#6B6560";

const modalInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "'DM Sans', sans-serif",
};
const modalLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
  display: "block",
  marginBottom: 6,
  fontFamily: "'DM Sans', sans-serif",
};

function spaceTypeDbToUi(raw: string | null | undefined): (typeof SPACE_TYPE_OPTIONS)[number] | "" {
  const n = normalizeSpaceType(raw ?? undefined);
  if (n === "office") return "Office";
  if (n === "meeting_room") return "Meeting room";
  if (n === "venue") return "Venue";
  if (n === "hot_desk") return "Coworking";
  return "";
}

type FormState = {
  tenantId: string;
  leadId: string;
  contactPersonName: string;
  name: string;
  businessId: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  industry: string;
  companySize: string;
  propertyId: string;
  spaceType: (typeof SPACE_TYPE_OPTIONS)[number];
  contractStart: string;
  contractEnd: string;
  notes: string;
};

function leadToForm(lead: ConvertToCustomerLead): FormState {
  const st = spaceTypeDbToUi(lead.interested_space_type);
  return {
    tenantId: lead.tenant_id,
    leadId: lead.id,
    contactPersonName: lead.contact_person_name ?? "",
    name: lead.company_name,
    businessId: lead.business_id ?? "",
    email: lead.email,
    phone: lead.phone ?? "",
    addressLine: lead.billing_street ?? "",
    city: lead.billing_city ?? "",
    postalCode: lead.billing_postal_code ?? "",
    industry: lead.industry_sector ?? "",
    companySize: lead.company_size ?? "",
    propertyId: lead.property_id ?? "",
    spaceType: (st || "Office") as FormState["spaceType"],
    contractStart: "",
    contractEnd: "",
    notes: lead.notes ?? "",
  };
}

export default function ConvertToCustomerModal({ lead, isOpen, onClose, onSuccess, onError }: ConvertToCustomerModalProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [properties, setProperties] = useState<ConvertModalProperty[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !lead) return;
    setForm(leadToForm(lead));
    setError(null);
  }, [isOpen, lead]);

  useEffect(() => {
    if (!isOpen || !lead) return;
    let cancelled = false;
    void (async () => {
      const { data, error: pErr } = await supabase
        .from("properties")
        .select("id,name,city,tenant_id")
        .eq("tenant_id", lead.tenant_id)
        .order("name", { ascending: true });
      if (cancelled || pErr) return;
      setProperties(((data ?? []) as ConvertModalProperty[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, lead?.tenant_id, supabase]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name || !form.tenantId.trim() || !form.leadId.trim()) {
      setError("Company name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/customer-companies", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: form.tenantId.trim(),
        propertyId: form.propertyId || null,
        name,
        businessId: form.businessId || null,
        email: form.email || null,
        phone: form.phone || null,
        addressLine: form.addressLine || null,
        city: form.city || null,
        postalCode: form.postalCode || null,
        industry: form.industry || null,
        companySize: form.companySize || null,
        spaceType: form.spaceType || null,
        contractStart: form.contractStart || null,
        contractEnd: form.contractEnd || null,
        notes: form.notes || null,
        leadId: form.leadId.trim(),
        contactPersonName: form.contactPersonName.trim() || null,
        markLeadWon: true,
      }),
    });
    const json = (await res.json()) as { error?: string; company?: CustomerCompany };
    setSubmitting(false);
    if (!res.ok || !json.company) {
      const msg = json.error ?? "Could not create customer company.";
      setError(msg);
      onError?.(msg);
      return;
    }

    onSuccess(json.company);
    onClose();
  }

  if (!isOpen || !lead || !form) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-customer-title"
        onClick={(ev) => ev.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 24,
          maxWidth: 520,
          width: "100%",
          maxHeight: "min(90vh, 900px)",
          overflowY: "auto",
          boxSizing: "border-box",
          border: `1px solid ${BORDER}`,
        }}
      >
        <h2
          id="convert-customer-title"
          style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: TEXT, fontFamily: "'DM Sans', sans-serif" }}
        >
          Deal Won! Convert to Customer
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>
          Create the customer account to complete the deal.
        </p>
        <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 12 }}>
          <label style={modalLabel}>
            Company name *
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Contact name
            <input
              value={form.contactPersonName}
              onChange={(e) => setForm((f) => (f ? { ...f, contactPersonName: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Y-tunnus (business ID)
            <input
              value={form.businessId}
              onChange={(e) => setForm((f) => (f ? { ...f, businessId: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Phone
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => (f ? { ...f, phone: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Address
            <input
              value={form.addressLine}
              onChange={(e) => setForm((f) => (f ? { ...f, addressLine: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={modalLabel}>
              City
              <input
                value={form.city}
                onChange={(e) => setForm((f) => (f ? { ...f, city: e.target.value } : f))}
                style={modalInput}
              />
            </label>
            <label style={modalLabel}>
              Postal code
              <input
                value={form.postalCode}
                onChange={(e) => setForm((f) => (f ? { ...f, postalCode: e.target.value } : f))}
                style={modalInput}
              />
            </label>
          </div>
          <label style={modalLabel}>
            Industry
            <input
              value={form.industry}
              onChange={(e) => setForm((f) => (f ? { ...f, industry: e.target.value } : f))}
              style={modalInput}
            />
          </label>
          <label style={modalLabel}>
            Company size
            <select
              style={{ ...modalInput, background: "#fff" }}
              value={form.companySize}
              onChange={(e) => setForm((f) => (f ? { ...f, companySize: e.target.value } : f))}
            >
              <option value="">—</option>
              {COMPANY_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={modalLabel}>
            Property
            <select
              style={{ ...modalInput, background: "#fff" }}
              value={form.propertyId}
              onChange={(e) => setForm((f) => (f ? { ...f, propertyId: e.target.value } : f))}
            >
              <option value="">— None —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPropertyLabel(p, { includeCity: true })}
                </option>
              ))}
            </select>
          </label>
          <label style={modalLabel}>
            Space type
            <select
              style={{ ...modalInput, background: "#fff" }}
              value={form.spaceType}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, spaceType: e.target.value as (typeof SPACE_TYPE_OPTIONS)[number] } : f))
              }
            >
              {SPACE_TYPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={modalLabel}>
              Contract start
              <input
                type="date"
                value={form.contractStart}
                onChange={(e) => setForm((f) => (f ? { ...f, contractStart: e.target.value } : f))}
                style={modalInput}
              />
            </label>
            <label style={modalLabel}>
              Contract end
              <input
                type="date"
                value={form.contractEnd}
                onChange={(e) => setForm((f) => (f ? { ...f, contractEnd: e.target.value } : f))}
                style={modalInput}
              />
            </label>
          </div>
          <label style={modalLabel}>
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
              rows={3}
              style={{ ...modalInput, resize: "vertical", fontFamily: "inherit" }}
            />
          </label>
          {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={submitting}
              onClick={() => !submitting && onClose()}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: "#fff",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: PETROL,
                color: "#fff",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.85 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {submitting ? "Saving…" : "Complete conversion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
