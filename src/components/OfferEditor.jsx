"use client";

/**
 * OfferEditor — Contract tool offers (CRM contact = public.leads; same as CRM module)
 *
 *   <OfferEditor />
 *   <OfferEditor leadId="uuid" initialData={{ ... }} onOfferAccepted={() => {}} onCancel={() => {}} />
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";
import { useConfirm } from "@/hooks/useConfirm";
import ContactSearchWithCreate from "@/components/shared/ContactSearchWithCreate";
import CreateContactModal from "@/components/shared/CreateContactModal";

const c = VILLAGEWORKS_BRAND.colors;

const DEFAULT_INTRO = `Thank you for your interest in VillageWorks. We are pleased to present this offer for your consideration.

VillageWorks offers flexible, fully-serviced office spaces designed to support your business as it grows. Our spaces include high-speed internet, meeting room access, reception services, and a thriving community of like-minded professionals.`;

const DEFAULT_TERMS = `1. This offer is valid for 30 days from the date of issue.
2. The monthly price is exclusive of VAT (24%).
3. A security deposit of one month's rent is required upon signing.
4. The notice period is one calendar month unless otherwise agreed.
5. All prices are subject to annual indexation in line with the Finnish CPI.`;

const OFFER_STATUS_COLORS = {
  draft: { bg: c.hover, fg: c.text },
  sent: { bg: c.border, fg: c.primary },
  viewed: { bg: c.hover, fg: c.secondary },
  accepted: { bg: c.hover, fg: c.success },
  declined: { bg: c.hover, fg: c.danger },
  expired: { bg: c.border, fg: c.text },
};

const NON_DRAFT_STATUSES = ["sent", "viewed", "accepted", "declined", "expired"];

const OFFER_STEPS = [
  { key: "details", label: "Fill details" },
  { key: "content", label: "Write content" },
  { key: "preview", label: "Preview & send" },
];

const LIGHT_GREEN = "#dcfce7";

function Field({ label, children, hint }) {
  const muted = { fontSize: 12, fontWeight: 600, color: c.text, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.05em" };
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={muted}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: c.text, opacity: 0.55 }}>{hint}</span>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style, ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyleBase, ...style }}
      {...rest}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4, style }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inputStyleBase, resize: "vertical", lineHeight: 1.6, ...style }}
    />
  );
}

const inputStyleBase = {
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${c.border}`,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  background: c.white,
  color: c.text,
};

function Section({ title, children }) {
  return (
    <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, display: "grid", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.primary, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${c.primary}`, paddingBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = OFFER_STATUS_COLORS[status] ?? OFFER_STATUS_COLORS.draft;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.fg }}>
      {status}
    </span>
  );
}

async function buildOfferVersionChain(supabase, startId) {
  const chain = [];
  let cur = startId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const { data } = await supabase.from("offers").select("id,version,created_at,sent_at,status,parent_offer_id").eq("id", cur).maybeSingle();
    if (!data) break;
    chain.push(data);
    cur = data.parent_offer_id;
  }
  return chain.reverse();
}

const CRM_COMPANY_SELECT = `
  id,
  name,
  email,
  phone,
  contacts:customer_users!company_id (
    first_name,
    last_name,
    email,
    phone,
    direct_phone,
    is_primary_contact
  )
`;

function mapCustomerCompanyRow(raw) {
  if (!raw) return null;
  const contacts = raw.contacts ?? [];
  const p = contacts.find((c) => c.is_primary_contact) || contacts[0];
  const contactName = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() : "";
  return {
    id: raw.id,
    company_name: raw.name ?? "",
    email: (p?.email ?? raw.email) ?? "",
    phone: (p?.phone ?? raw.phone) ?? "",
    contact_person_name: contactName || null,
    contact_first_name: p?.first_name ?? null,
    contact_last_name: p?.last_name ?? null,
    contact_direct_phone: p?.direct_phone ?? null,
  };
}

/**
 * @param {{
 *   leadId?: string | null,
 *   offerId?: string | null,
 *   initialData?: Record<string, unknown>,
 *   onSaved?: (payload?: { newOfferId?: string }) => void,
 *   onOfferAccepted?: () => void,
 *   onDeleted?: () => void,
 *   onCancel?: () => void,
 * }} props
 */
export default function OfferEditor({ leadId = null, initialData = {}, offerId = null, onSaved, onOfferAccepted, onDeleted, onCancel }) {
  const supabase = getSupabaseClient();
  const [ConfirmModal, confirm] = useConfirm();

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [properties, setProperties] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState("details");
  const [loadedRow, setLoadedRow] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [crmCompanyEmail, setCrmCompanyEmail] = useState("");
  const [primaryTenantId, setPrimaryTenantId] = useState(null);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [createContactQuery, setCreateContactQuery] = useState("");
  const [savedOfferId, setSavedOfferId] = useState(offerId);
  const [sendEmailLoading, setSendEmailLoading] = useState(false);
  const [sendEmailMsg, setSendEmailMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [markSentNote, setMarkSentNote] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoStatus, setPromoStatus] = useState(null);
  const [availablePromos, setAvailablePromos] = useState([]);
  const [manualPromoInput, setManualPromoInput] = useState("");
  const [availableRooms, setAvailableRooms] = useState([]);
  const [leadPropertySaving, setLeadPropertySaving] = useState(false);
  const [leadPropertyUiMode, setLeadPropertyUiMode] = useState(() => {
    if (!leadId) return "n/a";
    const p = initialData?.propertyId;
    return p != null && String(p).trim() !== "" ? "locked" : "pick";
  });

  const [form, setForm] = useState(() => {
    const merged = {
      title: "Offer",
      quantity: 1,
      status: "draft",
      version: 1,
      companyId: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerCompany: "",
      propertyId: "",
      spaceDetails: "",
      monthlyPrice: "",
      contractLengthMonths: 12,
      startDate: "",
      furnitureIncluded: false,
      furnitureDescription: "",
      furnitureMonthlyPrice: "",
      pricingNotes: "",
      promoCode: "",
      promoDiscount: null,
      promoDescription: "",
      promoType: "",
      promoAppliesTo: "all",
      introText: DEFAULT_INTRO,
      termsText: DEFAULT_TERMS,
      notes: "",
      templateName: "",
      isTemplate: false,
      publicToken: "",
      ...initialData,
    };
    const rawPid = merged.propertyId;
    return {
      ...merged,
      propertyId: rawPid != null && String(rawPid).trim() !== "" ? String(rawPid) : "",
    };
  });

  const applyLeadProfile = useCallback((row) => {
    setForm((f) => ({
      ...f,
      companyId: row.id,
      customerCompany: row.company_name ?? "",
      customerEmail: row.email ?? "",
      customerPhone: row.phone ?? row.contact_direct_phone ?? "",
      customerName: row.contact_person_name ?? [row.contact_first_name, row.contact_last_name].filter(Boolean).join(" ") ?? "",
    }));
  }, []);

  useEffect(() => {
    if (!leadId || offerId) return;
    let cancelled = false;
    (async () => {
      const { data: raw } = await supabase.from("customer_companies").select(CRM_COMPANY_SELECT).eq("id", leadId).maybeSingle();
      if (cancelled || !raw) return;
      applyLeadProfile(mapCustomerCompanyRow(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, offerId, applyLeadProfile, supabase]);

  useEffect(() => {
    if (!form.companyId) {
      setCrmCompanyEmail("");
      return;
    }
    let cancelled = false;
    supabase
      .from("customer_companies")
      .select("*")
      .eq("id", form.companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCrmCompanyEmail((data?.email ?? "").trim());
      });
    return () => {
      cancelled = true;
    };
  }, [form.companyId, supabase]);

  useEffect(() => {
    if (!offerId) {
      setLoadedRow(null);
      setVersionHistory([]);
      return;
    }
    let cancelled = false;
    supabase.from("offers").select("*").eq("id", offerId).single().then(({ data }) => {
      if (cancelled || !data) return;
      setSavedOfferId(data.id);
      setLoadedRow({
        id: data.id,
        status: data.status ?? "draft",
        version: data.version ?? 1,
        parentOfferId: data.parent_offer_id ?? null,
        created_at: data.created_at ?? null,
      });
      const nextPid = data.property_id != null && String(data.property_id).trim() !== "" ? String(data.property_id) : "";
      setForm({
        title: data.title ?? "Offer",
        quantity: data.quantity ?? 1,
        status: data.status ?? "draft",
        version: data.version ?? 1,
        companyId: data.lead_id ?? data.company_id ?? "",
        customerName: data.customer_name ?? "",
        customerEmail: data.customer_email ?? "",
        customerPhone: data.customer_phone ?? "",
        customerCompany: data.customer_company ?? "",
        propertyId: nextPid,
        spaceDetails: data.space_details ?? "",
        monthlyPrice: data.monthly_price ?? "",
        contractLengthMonths: data.contract_length_months ?? 12,
        startDate: data.start_date ?? "",
        furnitureIncluded: data.furniture_included ?? false,
        furnitureDescription: data.furniture_description ?? "",
        furnitureMonthlyPrice: data.furniture_monthly_price != null ? String(data.furniture_monthly_price) : "",
        pricingNotes: data.pricing_notes ?? "",
        promoCode: data.promo_code ?? "",
        promoDiscount: data.promo_discount ?? null,
        promoDescription: data.promo_description ?? "",
        promoType: data.promo_type ?? "",
        promoAppliesTo: data.promo_applies_to ?? "all",
        introText: data.intro_text ?? DEFAULT_INTRO,
        termsText: data.terms_text ?? DEFAULT_TERMS,
        notes: data.notes ?? "",
        templateName: data.template_name ?? "",
        isTemplate: data.is_template ?? false,
        publicToken: data.public_token ?? "",
      });
      if (leadId) {
        setLeadPropertyUiMode(nextPid ? "locked" : "pick");
      }
    });
    buildOfferVersionChain(supabase, offerId).then((ch) => {
      if (!cancelled) setVersionHistory(ch);
    });
    return () => {
      cancelled = true;
    };
  }, [offerId, supabase, leadId]);

  useEffect(() => {
    supabase.from("properties").select("id,name,address,city,tenant_id").order("name").then(({ data }) => setProperties(data ?? []));
    supabase
      .from("offers")
      .select("id,template_name,intro_text,terms_text,space_details,monthly_price,contract_length_months")
      .eq("is_template", true)
      .order("template_name")
      .then(({ data }) => setTemplates(data ?? []));
    supabase
      .from("marketing_offers")
      .select("id, name, promo_code, offer_type, discount_percentage, discount_fixed_amount, free_months, valid_from, valid_until, description")
      .eq("status", "active")
      .then(({ data }) => {
        if (data) setAvailablePromos(data);
      });
  }, [supabase]);

  useEffect(() => {
    const pid = form.propertyId;
    if (!pid) {
      setAvailableRooms([]);
      return;
    }
    supabase
      .from("bookable_spaces")
      .select("id, name, room_number, size_m2, space_type, space_status, monthly_rent_eur")
      .eq("property_id", pid)
      .eq("space_status", "available")
      .order("room_number", { ascending: true })
      .then(({ data }) => {
        if (data) setAvailableRooms(data);
        else setAvailableRooms([]);
      });
  }, [form.propertyId, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: mem } = await supabase.from("memberships").select("tenant_id, role").eq("user_id", user.id);
      const rows = mem ?? [];
      const prefer = rows.filter(
        (m) => m.tenant_id && ["super_admin", "owner", "manager"].includes((m.role ?? "").toLowerCase()),
      );
      const tid = prefer[0]?.tenant_id ?? rows.find((m) => m.tenant_id)?.tenant_id ?? null;
      if (!cancelled) setPrimaryTenantId(tid);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const selectedLeadForSearch = useMemo(() => {
    if (!form.companyId) return null;
    return {
      id: form.companyId,
      company_name: form.customerCompany || null,
      contact_person_name: form.customerName || null,
      email: form.customerEmail || null,
      phone: form.customerPhone || null,
    };
  }, [form.companyId, form.customerCompany, form.customerName, form.customerEmail, form.customerPhone]);

  const clearCrmSelection = useCallback(() => {
    setForm((f) => ({
      ...f,
      companyId: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerCompany: "",
    }));
    setCrmCompanyEmail("");
  }, []);

  function set(field) {
    return (val) => setForm((f) => ({ ...f, [field]: val }));
  }

  async function applyManualPromoCode() {
    const code = (manualPromoInput || "").trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoStatus(null);
    try {
      const { data, error } = await supabase
        .from("marketing_offers")
        .select(
          "id, name, offer_type, discount_percentage, discount_fixed_amount, free_months, status, valid_from, valid_until, max_uses, current_uses, applicable_to, terms",
        )
        .eq("promo_code", code)
        .eq("status", "active")
        .maybeSingle();

      if (error || !data) {
        setPromoStatus({ valid: false, message: "Invalid promo code" });
        setForm((f) => ({
          ...f,
          promoCode: "",
          promoDiscount: null,
          promoDescription: "",
          promoType: "",
          promoAppliesTo: "all",
        }));
        return;
      }

      const now = new Date().toISOString().slice(0, 10);
      if (data.valid_from && now < data.valid_from) {
        setPromoStatus({ valid: false, message: "This promo code is not yet active" });
        return;
      }
      if (data.valid_until && now > data.valid_until) {
        setPromoStatus({ valid: false, message: "This promo code has expired" });
        return;
      }
      if (data.max_uses != null && data.current_uses != null && data.current_uses >= data.max_uses) {
        setPromoStatus({ valid: false, message: "This promo code has reached its usage limit" });
        return;
      }

      let discountDesc = data.name;
      let discountAmount = null;
      if (data.offer_type === "discount_pct" && data.discount_percentage != null) {
        discountDesc = `${data.discount_percentage}% discount – ${data.name}`;
        discountAmount = Number(data.discount_percentage);
      } else if (data.offer_type === "discount_fixed" && data.discount_fixed_amount != null) {
        discountDesc = `€${data.discount_fixed_amount} off – ${data.name}`;
        discountAmount = Number(data.discount_fixed_amount);
      } else if (
        (data.offer_type === "free_months" || data.offer_type === "free_period") &&
        data.free_months != null
      ) {
        discountDesc = `${data.free_months} free month(s) – ${data.name}`;
        discountAmount = Number(data.free_months);
      }

      setForm((f) => ({
        ...f,
        promoCode: code,
        promoDiscount: discountAmount,
        promoDescription: discountDesc,
        promoType: data.offer_type,
        promoAppliesTo: "all",
      }));
      setPromoStatus({ valid: true, message: discountDesc });
      setManualPromoInput("");
    } catch (e) {
      setPromoStatus({ valid: false, message: "Error validating code" });
    } finally {
      setPromoLoading(false);
    }
  }

  useEffect(() => {
    if (!form.title) return;
    const q = Number(form.quantity) || 1;
    const pluralMap = {
      "Office Room": "Office Rooms",
      "Office Rooms": "Office Room",
      "Meeting Room": "Meeting Rooms",
      "Meeting Rooms": "Meeting Room",
      Venue: "Venues",
      Venues: "Venue",
      "Coworking Flex Desk": "Coworking Flex Desks",
      "Coworking Flex Desks": "Coworking Flex Desk",
      "Coworking Fixed Desk": "Coworking Fixed Desks",
      "Coworking Fixed Desks": "Coworking Fixed Desk",
    };
    const parts = form.title.split(" – ");
    const prefix = parts[0];
    const suffix = parts[1];
    if (!suffix) return;
    const needsPlural = q >= 2;
    const isPlural = suffix.endsWith("s") && suffix !== "Virtual Office Service";
    if (needsPlural && !isPlural && pluralMap[suffix]) {
      setForm((f) => ({ ...f, title: `${prefix} – ${pluralMap[suffix]}` }));
    } else if (!needsPlural && isPlural && pluralMap[suffix]) {
      setForm((f) => ({ ...f, title: `${prefix} – ${pluralMap[suffix]}` }));
    }
  }, [form.quantity]);

  const leadRequiresProperty = Boolean(leadId);
  const hasLeadPropertySelected = Boolean(String(form.propertyId ?? "").trim());

  async function onLeadPropertySelected(selectedId) {
    if (!leadId || !selectedId) return;
    setLeadPropertySaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from("customer_companies").update({ interested_property_id: selectedId }).eq("id", leadId);
    setLeadPropertySaving(false);
    if (error) {
      setSaveMsg({ type: "error", text: error.message });
      return;
    }
    setForm((f) => ({ ...f, propertyId: selectedId }));
    setLeadPropertyUiMode("locked");
    onSaved?.();
  }

  function applyTemplate(templateId) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setForm((f) => ({
      ...f,
      introText: t.intro_text ?? f.introText,
      termsText: t.terms_text ?? f.termsText,
      spaceDetails: t.space_details ?? f.spaceDetails,
      monthlyPrice: t.monthly_price ?? f.monthlyPrice,
      contractLengthMonths: t.contract_length_months ?? f.contractLengthMonths,
    }));
  }

  async function ensureContractDraftFromOffer(sourceOfferId) {
    const { data: existing } = await supabase.from("contracts").select("id").eq("source_offer_id", sourceOfferId).limit(1).maybeSingle();
    if (existing) {
      onOfferAccepted?.();
      return;
    }

    // Get tenant_id from lead
    let contractTenantId = null;
    const cid = form.companyId || leadId;
    if (cid) {
      const { data: leadRow } = await supabase.from("customer_companies").select("tenant_id").eq("id", cid).maybeSingle();
      contractTenantId = leadRow?.tenant_id || null;
    }

    const { error } = await supabase.from("contracts").insert({
      tenant_id: contractTenantId,
      company_id: form.companyId || null,
      lead_id: form.companyId || leadId || null,
      source_offer_id: sourceOfferId,
      title: (() => {
        const raw = form.title || "Office Room";
        // Remove "Offer – " or "Offer — " prefix if present
        const cleaned = raw.replace(/^Offer\s*[–—-]\s*/i, "");
        let t = `Contract – ${cleaned}`;
        if (Number(form.quantity) > 1) t += ` (×${form.quantity})`;
        return t;
      })(),
      quantity: form.quantity ? Number(form.quantity) : 1,
      status: "draft",
      signing_method: "esign",
      customer_name: form.customerName || null,
      customer_email: form.customerEmail || null,
      customer_phone: form.customerPhone || null,
      customer_company: form.customerCompany || null,
      property_id: form.propertyId || null,
      space_details: form.spaceDetails || null,
      monthly_price: form.monthlyPrice ? Number(form.monthlyPrice) : null,
      contract_length_months: form.contractLengthMonths ? Number(form.contractLengthMonths) : null,
      start_date: form.startDate || null,
      furniture_included: form.furnitureIncluded ?? false,
      furniture_description: form.furnitureDescription || null,
      furniture_monthly_price: form.furnitureMonthlyPrice ? Number(form.furnitureMonthlyPrice) : null,
      pricing_notes: form.pricingNotes || null,
      promo_code: form.promoCode || null,
      promo_discount: form.promoDiscount ?? null,
      promo_description: form.promoDescription || null,
      promo_type: form.promoType || null,
      promo_applies_to: form.promoAppliesTo || "all",
      intro_text: form.introText || null,
      terms_text: form.termsText || null,
      notes: form.notes || null,
      version: 1,
      parent_contract_id: null,
    });
    if (!error) onOfferAccepted?.();
  }

  function resolvePublicTokenForSave(shouldFork) {
    if (form.isTemplate) return null;
    if (shouldFork) return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
    const existing = form.publicToken?.trim();
    if (existing) return existing;
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
  }

  async function save(newStatus) {
    setSaving(true);
    setSaveMsg(null);
    const effectiveId = savedOfferId || offerId;
    const effectiveStatus = newStatus ?? form.status;
    const rowStatus = loadedRow?.status ?? "draft";
    const shouldFork = Boolean(effectiveId) && !form.isTemplate && NON_DRAFT_STATUSES.includes(rowStatus);
    const public_token = resolvePublicTokenForSave(shouldFork);

    const payload = {
      title: form.title,
      status: effectiveStatus,
      lead_id: form.companyId || leadId || null,
      company_id: form.companyId || null,
      customer_name: form.customerName || null,
      customer_email: form.customerEmail || null,
      customer_phone: form.customerPhone || null,
      customer_company: form.customerCompany || null,
      property_id: form.propertyId || null,
      space_details: form.spaceDetails || null,
      monthly_price: form.monthlyPrice ? Number(form.monthlyPrice) : null,
      contract_length_months: form.contractLengthMonths ? Number(form.contractLengthMonths) : null,
      start_date: form.startDate || null,
      furniture_included: form.furnitureIncluded ?? false,
      furniture_description: form.furnitureDescription || null,
      furniture_monthly_price: form.furnitureMonthlyPrice ? Number(form.furnitureMonthlyPrice) : null,
      pricing_notes: form.pricingNotes || null,
      promo_code: form.promoCode || null,
      promo_discount: form.promoDiscount ?? null,
      promo_description: form.promoDescription || null,
      promo_type: form.promoType || null,
      promo_applies_to: form.promoAppliesTo || "all",
      intro_text: form.introText || null,
      terms_text: form.termsText || null,
      notes: form.notes || null,
      template_name: form.isTemplate ? form.templateName || null : null,
      is_template: form.isTemplate,
      ...(form.isTemplate ? { public_token: null } : public_token ? { public_token } : {}),
      ...(effectiveStatus === "sent" ? { sent_at: new Date().toISOString() } : {}),
    };

    let error;
    let resultId = effectiveId;

    if (shouldFork) {
      const nextVersion = (loadedRow?.version ?? form.version ?? 1) + 1;
      const { data: inserted, error: insErr } = await supabase
        .from("offers")
        .insert({
          ...payload,
          version: nextVersion,
          parent_offer_id: effectiveId,
        })
        .select()
        .single();
      error = insErr;
      if (inserted) {
        resultId = inserted.id;
        setSavedOfferId(inserted.id);
        setForm((f) => ({
          ...f,
          version: nextVersion,
          status: effectiveStatus,
          publicToken: inserted.public_token ?? f.publicToken ?? "",
        }));
        setLoadedRow({
          id: inserted.id,
          status: effectiveStatus,
          version: nextVersion,
          parentOfferId: effectiveId,
          created_at: inserted.created_at ?? null,
        });
        buildOfferVersionChain(supabase, inserted.id).then(setVersionHistory);
      }
    } else if (effectiveId) {
      const { data: updated, error: upErr } = await supabase.from("offers").update(payload).eq("id", effectiveId).select().single();
      error = upErr;
      if (updated?.public_token) {
        setForm((f) => ({ ...f, publicToken: updated.public_token }));
      }
    } else {
      const { data: inserted, error: insErr } = await supabase.from("offers").insert(payload).select().single();
      error = insErr;
      if (inserted) {
        resultId = inserted.id;
        setSavedOfferId(inserted.id);
        setLoadedRow({
          id: inserted.id,
          status: effectiveStatus,
          version: inserted.version ?? 1,
          parentOfferId: inserted.parent_offer_id ?? null,
          created_at: inserted.created_at ?? null,
        });
        setForm((f) => ({
          ...f,
          version: inserted.version ?? 1,
          publicToken: inserted.public_token ?? f.publicToken ?? "",
        }));
        buildOfferVersionChain(supabase, inserted.id).then(setVersionHistory);
      }
    }

    setSaving(false);
    if (error) {
      setSaveMsg({ type: "error", text: error.message });
      return { error };
    }

    setSaveMsg({ type: "ok", text: newStatus === "sent" ? "Offer marked as sent!" : shouldFork ? "Saved as new version." : "Saved." });
    onSaved?.({ newOfferId: resultId !== effectiveId ? resultId : undefined });
    if (newStatus) setForm((f) => ({ ...f, status: newStatus }));
    if (effectiveId && !shouldFork) {
      setLoadedRow((lr) => (lr ? { ...lr, status: effectiveStatus, version: lr.version ?? form.version ?? 1 } : lr));
    }

    if (effectiveStatus === "accepted" && resultId) {
      await ensureContractDraftFromOffer(resultId);
    }
    return { error: null };
  }

  async function markAsSentNoEmail() {
    if (!savedOfferId) return;
    setMarkSentNote(false);
    const r = await save("sent");
    if (!r?.error) {
      setMarkSentNote(true);
      setSendEmailMsg(null);
    }
  }

  async function deleteOffer() {
    if (!loadedRow?.id) return;
    const ok = await confirm({
      title: "Archive this offer?",
      message:
        "This offer will be archived and the lead will be moved to Lost. You can restore it later. Any linked contracts will remain unchanged.",
      confirmLabel: "Archive",
      confirmDanger: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("offers")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", loadedRow.id);
    if (error) {
      setSaveMsg({ type: "error", text: error.message });
      return;
    }
    const leadToUpdate = form.companyId || leadId;
    if (leadToUpdate) {
      await supabase
        .from("customer_companies")
        .update({ stage: "lost", updated_at: new Date().toISOString() })
        .eq("id", leadToUpdate);
    }
    onDeleted?.();
  }

  async function sendOfferEmail() {
    const idToUse = savedOfferId ?? offerId ?? loadedRow?.id;
    if (!idToUse || !crmCompanyEmail) {
      setSendEmailMsg({ type: "error", text: !idToUse ? "Please save the offer first." : "No email on file." });
      return;
    }
    setSendEmailLoading(true);
    setSendEmailMsg(null);
    setMarkSentNote(false);
    try {
      const res = await fetch("/api/offers/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: idToUse, emailType: "offer_sent" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Failed to send email");
      const { error: upErr } = await supabase.from("offers").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", idToUse);
      if (upErr) throw new Error(upErr.message);
      setForm((f) => ({ ...f, status: "sent" }));
      setLoadedRow((lr) => (lr ? { ...lr, status: "sent" } : lr));
      setSendEmailMsg({ type: "ok", text: `Email sent to ${crmCompanyEmail}` });
    } catch (e) {
      setSendEmailMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to send email" });
    } finally {
      setSendEmailLoading(false);
    }
  }

  function copyPublicOfferLink() {
    if (!savedOfferId) return;
    const tok = form.publicToken?.trim();
    if (!tok) return;
    const url = `${window.location.origin}/offers/${tok}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  }

  const selectedProperty = properties.find((p) => String(p.id) === String(form.propertyId ?? ""));

  const previewHtml = useMemo(() => {
    const rentCol = c.primary;
    const baseRent = Number(form.monthlyPrice) || 0;
    const furnitureRent = form.furnitureIncluded ? Number(form.furnitureMonthlyPrice) || 0 : 0;
    const promoAppliesTo = form.promoAppliesTo || "all";
    const hasPromo = Boolean(form.promoDiscount);

    let spaceDiscount = 0;
    let furnitureDiscount = 0;

    if (hasPromo) {
      if (form.promoType === "discount_pct") {
        const pct = Number(form.promoDiscount) / 100;
        if (promoAppliesTo === "all" || promoAppliesTo === "space") spaceDiscount = Math.round(baseRent * pct * 100) / 100;
        if (promoAppliesTo === "all" || promoAppliesTo === "furniture") furnitureDiscount = Math.round(furnitureRent * pct * 100) / 100;
      } else if (form.promoType === "discount_fixed") {
        const fixed = Number(form.promoDiscount) || 0;
        if (promoAppliesTo === "all") {
          spaceDiscount = Math.min(fixed, baseRent + furnitureRent);
        } else if (promoAppliesTo === "space") {
          spaceDiscount = Math.min(fixed, baseRent);
        } else if (promoAppliesTo === "furniture") {
          furnitureDiscount = Math.min(fixed, furnitureRent);
        }
      }
    }

    const discountedRent = baseRent - spaceDiscount;
    const discountedFurniture = furnitureRent - furnitureDiscount;
    const totalAfterDiscount = discountedRent + discountedFurniture;

    return `
    <div style="font-family:Georgia,serif;max-width:680px;margin:0 auto;color:${c.text};line-height:1.7">
      <div style="border-bottom:3px solid ${c.primary};padding-bottom:16px;margin-bottom:24px">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${c.text};opacity:0.72">VillageWorks</div>
        <h1 style="margin:8px 0 4px;font-size:28px;font-weight:700;color:${c.text}">${form.title}</h1>
        <div style="font-size:13px;color:${c.text};opacity:0.72">Prepared for: <strong>${form.customerName || "—"}</strong>${form.customerCompany ? ` · ${form.customerCompany}` : ""}</div>
        <div style="font-size:12px;color:${c.text};opacity:0.6;margin-top:4px">Date: ${new Date(loadedRow?.created_at || Date.now()).toLocaleDateString("fi-FI")}</div>
      </div>
      <p style="font-size:15px">${(form.introText || "").replace(/\n/g, "<br>")}</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Offer date</td><td style="padding:10px 14px">${new Date(loadedRow?.created_at || Date.now()).toLocaleDateString("fi-FI")}</td></tr>
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Space</td><td style="padding:10px 14px">${form.spaceDetails || "—"}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:600">Location</td><td style="padding:10px 14px">${selectedProperty ? `${selectedProperty.name}, ${selectedProperty.address}, ${selectedProperty.city}` : "—"}</td></tr>
        ${baseRent ? `<tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Monthly rent</td><td style="padding:10px 14px;font-size:18px;font-weight:700;color:${rentCol}">${spaceDiscount > 0 ? `<span style="text-decoration:line-through;opacity:0.5;font-size:14px">€${baseRent.toLocaleString("en-IE")}</span> €${discountedRent.toLocaleString("en-IE")}` : `€${baseRent.toLocaleString("en-IE")}`} / month</td></tr>` : ""}${spaceDiscount > 0 ? `<tr style="background:#dcfce7"><td style="padding:10px 14px;font-weight:500;color:#166534;font-size:13px">↳ Promo discount</td><td style="padding:10px 14px;color:#166534;font-weight:600;font-size:13px">${form.promoDescription} (−€${spaceDiscount.toLocaleString("en-IE")}/month)</td></tr>` : ""}
        <tr><td style="padding:10px 14px;font-weight:600">Contract length</td><td style="padding:10px 14px">${form.contractLengthMonths ? `${form.contractLengthMonths} months` : "—"}</td></tr>
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Proposed start</td><td style="padding:10px 14px">${form.startDate || "To be agreed"}</td></tr>
        ${form.furnitureIncluded ? `<tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Furniture</td><td style="padding:10px 14px">${form.furnitureDescription || "Included"}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600">Furniture rent</td><td style="padding:10px 14px">${furnitureDiscount > 0 ? `<span style="text-decoration:line-through;opacity:0.5;font-size:12px">€${furnitureRent.toLocaleString("en-IE")}</span> €${discountedFurniture.toLocaleString("en-IE")}` : `€${furnitureRent.toLocaleString("en-IE")}`}/month excl. VAT</td></tr>${furnitureDiscount > 0 ? `<tr style="background:#dcfce7"><td style="padding:10px 14px;font-weight:500;color:#166534;font-size:13px">↳ Promo discount</td><td style="padding:10px 14px;color:#166534;font-weight:600;font-size:13px">${form.promoDescription} (−€${furnitureDiscount.toLocaleString("en-IE")}/month)</td></tr>` : ""}` : ""}<tr style="background:${c.primary}"><td style="padding:10px 14px;font-weight:700;color:${c.white}">Total monthly</td><td style="padding:10px 14px;font-weight:700;color:${c.white}">€${totalAfterDiscount.toLocaleString("en-IE")} / month excl. VAT</td></tr>
      </table>
      <h3 style="font-size:15px;border-bottom:1px solid ${c.border};padding-bottom:6px;color:${c.text}">Terms &amp; conditions</h3>
      <p style="font-size:13px;color:${c.text};opacity:0.85">${(form.termsText || "").replace(/\n/g, "<br>")}</p>
    </div>
  `;
  }, [form, selectedProperty, loadedRow?.created_at]);

  const stepIndex = OFFER_STEPS.findIndex((s) => s.key === activeTab);
  const currentStep = stepIndex >= 0 ? stepIndex : 0;

  const verLabel = `v${form.version ?? 1}.0`;

  async function nextFromDetails() {
    if (leadRequiresProperty && !hasLeadPropertySelected) {
      setSaveMsg({ type: "error", text: "Select a property for this lead." });
      return;
    }
    const r = await save();
    if (!r?.error) {
      setActiveTab("content");
    }
  }

  function trySetOfferStep(nextKey) {
    if (leadRequiresProperty && !hasLeadPropertySelected && nextKey !== "details") {
      setSaveMsg({ type: "error", text: "Select a property for this lead before continuing." });
      return;
    }
    setActiveTab(nextKey);
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 860, margin: "0 auto" }}>
      <ConfirmModal />
      <CreateContactModal
        isOpen={createContactOpen}
        onClose={() => setCreateContactOpen(false)}
        initialCompanyName={createContactQuery}
        defaultTenantId={primaryTenantId ?? ""}
        properties={properties}
        onCreated={(row) => {
          applyLeadProfile(row);
          setCreateContactOpen(false);
          window.setTimeout(() => void save(), 0);
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 className="vw-admin-page-title" style={{ margin: 0 }}>{form.title || "Offer editor"}</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.secondary }}>{verLabel}</span>
          <StatusBadge status={form.status} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.white,
                color: c.text,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
          ) : null}
          {loadedRow?.id ? (
            <button
              onClick={() => void deleteOffer()}
              disabled={saving}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${c.danger}`,
                background: c.white,
                color: c.danger,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13
              }}
            >
              Archive offer
            </button>
          ) : null}
          {templates.length > 0 && (
            <select onChange={(e) => applyTemplate(e.target.value)} defaultValue="" style={{ ...inputStyleBase, width: "auto", fontSize: 13 }}>
              <option value="" disabled>
                Load template…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => save()}
            disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${c.primary}`, background: c.white, color: c.primary, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            onClick={() => save("sent")}
            disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: c.primary, color: c.white, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
          >
            Mark as sent
          </button>
        </div>
      </div>

      {saveMsg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: saveMsg.type === "ok" ? c.hover : c.hover,
            color: saveMsg.type === "ok" ? c.success : c.danger,
            border: `1px solid ${c.border}`,
          }}
        >
          {saveMsg.text}
        </div>
      )}

      <div
        style={{
          background: c.white,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: "20px 16px 24px",
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 0, width: "100%", maxWidth: 720, margin: "0 auto" }}>
          {OFFER_STEPS.map((step, i) => {
            const active = i === currentStep;
            const completed = i < currentStep;
            const upcoming = i > currentStep;
            const circleSize = 36;
            const circleBase = {
              width: circleSize,
              height: circleSize,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
              boxSizing: "border-box",
            };
            let circleStyle;
            if (completed) {
              circleStyle = { ...circleBase, background: LIGHT_GREEN, color: c.success, border: `2px solid ${c.success}` };
            } else if (active) {
              circleStyle = { ...circleBase, background: c.primary, color: c.white, border: `2px solid ${c.primary}` };
            } else {
              circleStyle = {
                ...circleBase,
                background: "transparent",
                color: c.text,
                border: `2px solid ${c.border}`,
                opacity: 0.85,
              };
            }
            const labelOpacity = upcoming ? 0.45 : 1;
            const labelWeight = active ? 700 : 500;

            return (
              <Fragment key={step.key}>
                <button
                  type="button"
                  onClick={() => trySetOfferStep(step.key)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    flex: "0 0 auto",
                    minWidth: 0,
                    maxWidth: 130,
                  }}
                >
                  <span style={circleStyle}>{completed ? "✓" : i + 1}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: labelWeight,
                      color: c.text,
                      opacity: labelOpacity,
                      textAlign: "center",
                      lineHeight: 1.3,
                    }}
                  >
                    {step.label}
                  </span>
                </button>
                {i < OFFER_STEPS.length - 1 ? (
                  <div
                    aria-hidden
                    style={{
                      flex: "1 1 auto",
                      minWidth: 12,
                      height: circleSize,
                      display: "flex",
                      alignItems: "center",
                      alignSelf: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 3,
                        borderRadius: 2,
                        background: i < currentStep ? c.success : c.border,
                      }}
                    />
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      {activeTab === "details" && (
        <>
          <Section title="Offer settings">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                <Field label="Offer title">
                  <select value={form.title} onChange={(e) => set("title")(e.target.value)} style={inputStyleBase}>
                    <option value="">— Select service type —</option>
                    <option value={Number(form.quantity) >= 2 ? "Offer – Office Rooms" : "Offer – Office Room"}>
                      {Number(form.quantity) >= 2 ? "Offer – Office Rooms" : "Offer – Office Room"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Offer – Meeting Rooms" : "Offer – Meeting Room"}>
                      {Number(form.quantity) >= 2 ? "Offer – Meeting Rooms" : "Offer – Meeting Room"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Offer – Venues" : "Offer – Venue"}>
                      {Number(form.quantity) >= 2 ? "Offer – Venues" : "Offer – Venue"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Offer – Coworking Flex Desks" : "Offer – Coworking Flex Desk"}>
                      {Number(form.quantity) >= 2 ? "Offer – Coworking Flex Desks" : "Offer – Coworking Flex Desk"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Offer – Coworking Fixed Desks" : "Offer – Coworking Fixed Desk"}>
                      {Number(form.quantity) >= 2 ? "Offer – Coworking Fixed Desks" : "Offer – Coworking Fixed Desk"}
                    </option>
                    <option value="Offer – Virtual Office Service">Offer – Virtual Office Service</option>
                  </select>
                </Field>
                <Field label="Quantity">
                  <input type="number" min="1" value={form.quantity ?? 1} onChange={(e) => set("quantity")(e.target.value)} style={inputStyleBase} />
                </Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status")(e.target.value)} style={inputStyleBase}>
                  {["draft", "sent", "viewed", "accepted", "declined", "expired"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Internal notes" hint="Not shown to customer">
              <Textarea value={form.notes} onChange={set("notes")} placeholder="Internal notes…" rows={3} />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="is-template" checked={form.isTemplate} onChange={(e) => set("isTemplate")(e.target.checked)} />
              <label htmlFor="is-template" style={{ fontSize: 14, cursor: "pointer", color: c.text }}>
                Save as reusable template
              </label>
            </div>
            {form.isTemplate && (
              <Field label="Template name">
                <Input value={form.templateName} onChange={set("templateName")} placeholder="e.g. Standard 12-month office" />
              </Field>
            )}
          </Section>

          {leadId ? (
            <Section title="Property">
              {leadPropertyUiMode === "locked" && hasLeadPropertySelected ? (
                <Field label="Property">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
                      {selectedProperty?.name ?? "—"}
                    </span>
                    <button
                      type="button"
                      disabled={leadPropertySaving}
                      onClick={() => setLeadPropertyUiMode("pick")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        background: c.white,
                        color: c.primary,
                        fontWeight: 600,
                        cursor: leadPropertySaving ? "not-allowed" : "pointer",
                        fontSize: 13,
                      }}
                    >
                      Change
                    </button>
                  </div>
                </Field>
              ) : (
                <Field label="Property *" hint="Saved to this lead. Required before the next step.">
                  <select
                    value={form.propertyId ?? ""}
                    onChange={(e) => void onLeadPropertySelected(e.target.value)}
                    disabled={leadPropertySaving || properties.length === 0}
                    style={{
                      ...inputStyleBase,
                      opacity: leadPropertySaving ? 0.75 : 1,
                      cursor: leadPropertySaving ? "wait" : "pointer",
                    }}
                  >
                    <option value="" disabled>
                      {properties.length === 0 ? "Loading properties…" : "Select property…"}
                    </option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </Section>
          ) : null}

          <Section title="Company (CRM)">
            <Field
              label="CRM contact"
              hint="Single source: public.leads (same as CRM). Search, pick, or create a new lead — contact fields below fill from the selection."
            >
              <ContactSearchWithCreate
                colors={c}
                selectedLead={selectedLeadForSearch}
                onSelect={applyLeadProfile}
                onClearSelection={clearCrmSelection}
                onRequestCreate={(q) => {
                  setCreateContactQuery(q);
                  setCreateContactOpen(true);
                }}
                createDisabled={!primaryTenantId}
                createDisabledHint={!primaryTenantId ? "Sign in with a workspace membership to create contacts from here." : undefined}
              />
              <button
                type="button"
                disabled={!primaryTenantId}
                onClick={() => {
                  setCreateContactQuery("");
                  setCreateContactOpen(true);
                }}
                style={{
                  marginTop: 10,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${c.primary}`,
                  background: c.white,
                  color: c.primary,
                  fontWeight: 600,
                  cursor: primaryTenantId ? "pointer" : "not-allowed",
                  fontSize: 13,
                  width: "fit-content",
                }}
              >
                + Create new contact
              </button>
            </Field>
            {form.companyId ? (
              crmCompanyEmail ? (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: c.text, opacity: 0.55 }}>
                  CRM email on file: {crmCompanyEmail}
                </p>
              ) : (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: c.danger, lineHeight: 1.45 }}>
                  No email on file — add one in{" "}
                  <a href="/crm/contacts" style={{ color: c.danger, fontWeight: 700, textDecoration: "underline" }}>
                    CRM
                  </a>{" "}
                  before sending
                </p>
              )
            ) : null}
            {form.companyId ? (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: c.text, opacity: 0.75 }}>
                <a href={`/crm/leads/${form.companyId}`} style={{ color: c.primary, fontWeight: 600 }}>
                  Open in CRM →
                </a>
              </p>
            ) : null}
          </Section>

          <Section title="Version history">
            {versionHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: c.text, opacity: 0.65 }}>Save this offer to start a version history.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {versionHistory.map((row) => (
                  <li
                    key={row.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: row.id === offerId ? c.hover : c.background,
                      border: `1px solid ${c.border}`,
                      fontSize: 13,
                      color: c.text,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      v{row.version ?? 1}.0 · {row.status}
                      {row.id === offerId ? <span style={{ marginLeft: 8, color: c.accent }}>(current)</span> : null}
                    </span>
                    <span style={{ opacity: 0.75 }}>{row.created_at ? new Date(row.created_at).toLocaleString("en-GB") : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Contact person">
            {form.companyId ? (
              <p style={{ margin: 0, fontSize: 12, color: c.text, opacity: 0.65 }}>
                Filled from CRM. Use <strong>Change</strong> above to pick a different lead, or edit if you need a one-off override.
              </p>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Full name">
                <Input
                  value={form.customerName}
                  onChange={set("customerName")}
                  placeholder="Contact name"
                  readOnly={Boolean(form.companyId)}
                  style={form.companyId ? { ...inputStyleBase, opacity: 0.92, cursor: "default" } : undefined}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.customerEmail}
                  onChange={set("customerEmail")}
                  placeholder="email@company.fi"
                  type="email"
                  readOnly={Boolean(form.companyId)}
                  style={form.companyId ? { ...inputStyleBase, opacity: 0.92, cursor: "default" } : undefined}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.customerPhone}
                  onChange={set("customerPhone")}
                  placeholder="+358 …"
                  readOnly={Boolean(form.companyId)}
                  style={form.companyId ? { ...inputStyleBase, opacity: 0.92, cursor: "default" } : undefined}
                />
              </Field>
            </div>
          </Section>

          <Section title="Space & pricing">
            {!leadId ? (
              <Field label="Property">
                <select value={form.propertyId ?? ""} onChange={(e) => set("propertyId")(e.target.value)} style={inputStyleBase}>
                  <option value="">Select property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.city}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div style={{ width: "100%" }}>
              <Field label="Space / room" hint="Select from available rooms or type manually">
                {availableRooms.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <select
                      value=""
                      onChange={(e) => {
                        const room = availableRooms.find((r) => r.id === e.target.value);
                        if (!room) return;
                        const detail = [
                          room.name,
                          room.room_number ? `Room ${room.room_number}` : null,
                          room.size_m2 ? `${room.size_m2} m²` : null,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        const currentDetails = (form.spaceDetails || "").trim();
                        const newDetails = currentDetails ? `${currentDetails}\n${detail}` : detail;
                        setForm((f) => ({
                          ...f,
                          spaceDetails: newDetails,
                          monthlyPrice: !f.monthlyPrice && room.monthly_rent_eur ? String(room.monthly_rent_eur) : f.monthlyPrice,
                        }));
                      }}
                      style={{
                        flex: "0 0 auto",
                        minWidth: 280,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        fontSize: 14,
                        color: c.text,
                        background: c.white,
                      }}
                    >
                      <option value="">Select available room…</option>
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.room_number ? `${r.room_number}` : ""} — {r.name}
                          {r.size_m2 ? ` (${r.size_m2} m²)` : ""}
                          {r.monthly_rent_eur ? ` — €${Number(r.monthly_rent_eur).toLocaleString("en-IE")}/mo` : ""}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: c.secondary, marginTop: 10, whiteSpace: "nowrap" }}>
                      {availableRooms.length} available
                    </span>
                  </div>
                ) : form.propertyId ? (
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: c.secondary }}>No available rooms for this property</p>
                ) : null}
                <Textarea
                  value={form.spaceDetails}
                  onChange={set("spaceDetails")}
                  placeholder="Office 4B, 2nd floor, 24 m² — or select from dropdown above"
                  rows={2}
                  style={{ marginTop: availableRooms.length > 0 || form.propertyId ? 8 : 0 }}
                />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, width: "100%" }}>
              <div style={{ minWidth: 0 }}>
                <Field label="Monthly rent (€)" hint="Excl. VAT">
                  <Input value={form.monthlyPrice} onChange={set("monthlyPrice")} placeholder="1200" type="number" />
                </Field>
              </div>
              <div style={{ minWidth: 0 }}>
                <Field label="Contract length (months)">
                  <Input value={form.contractLengthMonths} onChange={set("contractLengthMonths")} placeholder="12" type="number" />
                </Field>
              </div>
              <div style={{ minWidth: 0 }}>
                <Field label="Proposed start date">
                  <Input value={form.startDate} onChange={set("startDate")} type="date" />
                </Field>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 16, paddingTop: 16, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, width: "100%" }}>
                <input
                  type="checkbox"
                  checked={form.furnitureIncluded ?? false}
                  onChange={(e) => set("furnitureIncluded")(e.target.checked)}
                  style={{ accentColor: c.primary }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>Include furniture package</span>
              </div>
              {form.furnitureIncluded && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <Field label="Furniture description" hint="e.g. Desks, chairs, monitor stands, storage cabinets">
                      <textarea
                        value={form.furnitureDescription ?? ""}
                        onChange={(e) => set("furnitureDescription")(e.target.value)}
                        placeholder="e.g. 2x height-adjustable desks, 2x ergonomic chairs, 1x storage cabinet"
                        style={{ ...inputStyleBase, minHeight: 60, resize: "vertical", width: "100%", boxSizing: "border-box" }}
                      />
                    </Field>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Field label="Furniture rent (€/month)">
                      <input
                        type="number"
                        min="0"
                        value={form.furnitureMonthlyPrice ?? ""}
                        onChange={(e) => set("furnitureMonthlyPrice")(e.target.value)}
                        placeholder="0"
                        style={{ ...inputStyleBase, width: "100%", boxSizing: "border-box" }}
                      />
                      <span style={{ fontSize: 11, color: c.secondary }}>Excl. VAT</span>
                    </Field>
                  </div>
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 16, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 8 }}>PROMO CODE</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={
                    availablePromos.some((p) => p.promo_code === (form.promoCode ?? "")) ? (form.promoCode ?? "") : ""
                  }
                  onChange={(e) => {
                    const selected = availablePromos.find((p) => p.promo_code === e.target.value);
                    if (selected) {
                      const isFree =
                        selected.offer_type === "free_months" || selected.offer_type === "free_period";
                      const discountDesc =
                        selected.offer_type === "discount_pct"
                          ? `${selected.discount_percentage}% off`
                          : selected.offer_type === "discount_fixed"
                            ? `€${selected.discount_fixed_amount} off`
                            : isFree
                              ? `${selected.free_months} free month(s)`
                              : selected.description || "Promo applied";
                      const discountAmount =
                        selected.offer_type === "discount_pct"
                          ? selected.discount_percentage
                          : selected.offer_type === "discount_fixed"
                            ? selected.discount_fixed_amount
                            : isFree
                              ? selected.free_months
                              : 0;
                      setForm((f) => ({
                        ...f,
                        promoCode: selected.promo_code,
                        promoDiscount: discountAmount,
                        promoDescription: discountDesc,
                        promoType: selected.offer_type,
                        promoAppliesTo: "all",
                      }));
                      setPromoStatus({ valid: true, message: discountDesc });
                      setManualPromoInput("");
                    } else {
                      setForm((f) => ({
                        ...f,
                        promoCode: "",
                        promoDiscount: null,
                        promoDescription: "",
                        promoType: "",
                        promoAppliesTo: "all",
                      }));
                      setPromoStatus(null);
                      setManualPromoInput("");
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    fontSize: 14,
                    color: c.text,
                    background: c.white,
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">— No promo code —</option>
                  {availablePromos.map((p) => {
                    const isFree = p.offer_type === "free_months" || p.offer_type === "free_period";
                    const labelSuffix =
                      p.offer_type === "discount_pct"
                        ? `${p.discount_percentage}% off`
                        : p.offer_type === "discount_fixed"
                          ? `€${p.discount_fixed_amount} off`
                          : isFree
                            ? `${p.free_months} free month(s)`
                            : p.description || "Promo";
                    return (
                      <option key={p.id} value={p.promo_code}>
                        {p.promo_code} — {p.name} ({labelSuffix})
                      </option>
                    );
                  })}
                </select>
                {(form.promoCode ?? "").trim() || form.promoDiscount != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        promoCode: "",
                        promoDiscount: null,
                        promoDescription: "",
                        promoType: "",
                        promoAppliesTo: "all",
                      }));
                      setPromoStatus(null);
                      setManualPromoInput("");
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${c.danger}`,
                      background: c.white,
                      color: c.danger,
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {form.promoDiscount ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.secondary, marginBottom: 4 }}>DISCOUNT APPLIES TO</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { value: "all", label: "All pricing" },
                      { value: "space", label: "Space rent only" },
                      { value: "furniture", label: "Furniture rent only" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set("promoAppliesTo")(opt.value)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: `1px solid ${form.promoAppliesTo === opt.value ? c.primary : c.border}`,
                          background: form.promoAppliesTo === opt.value ? c.primary : c.white,
                          color: form.promoAppliesTo === opt.value ? c.white : c.text,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: c.text, opacity: 0.75, width: "100%" }}>Or enter code manually:</span>
                <input
                  type="text"
                  value={manualPromoInput}
                  onChange={(e) => setManualPromoInput(e.target.value.toUpperCase())}
                  placeholder="Promo code"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    fontSize: 13,
                    color: c.text,
                    background: c.white,
                    fontFamily: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                />
                <button
                  type="button"
                  disabled={promoLoading || !manualPromoInput.trim()}
                  onClick={() => void applyManualPromoCode()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: !manualPromoInput.trim() ? c.border : c.primary,
                    color: c.white,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: !manualPromoInput.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {promoLoading ? "Checking..." : "Apply"}
                </button>
              </div>
              {promoStatus && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    background: promoStatus.valid ? "#dcfce7" : "#fef2f2",
                    color: promoStatus.valid ? "#166534" : "#991b1b",
                  }}
                >
                  {promoStatus.valid ? "✓ " : "✕ "}
                  {promoStatus.message}
                </div>
              )}
            </div>
            <Field label="Additional notes" hint="Shown in the offer/contract under pricing details">
              <textarea
                value={form.pricingNotes ?? ""}
                onChange={(e) => set("pricingNotes")(e.target.value)}
                placeholder="e.g. Price includes internet, cleaning, meeting room credits..."
                style={{ ...inputStyleBase, minHeight: 60, resize: "vertical" }}
              />
            </Field>
          </Section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
            <div />
            <button
              type="button"
              disabled={saving || (leadRequiresProperty && !hasLeadPropertySelected)}
              onClick={() => void nextFromDetails()}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: leadRequiresProperty && !hasLeadPropertySelected ? c.border : c.primary,
                color: c.white,
                fontWeight: 600,
                cursor: saving || (leadRequiresProperty && !hasLeadPropertySelected) ? "not-allowed" : "pointer",
                fontSize: 14
              }}
            >
              {saving ? "Saving…" : "Next → Write content"}
            </button>
          </div>
        </>
      )}

      {activeTab === "content" && (
        <>
          <Section title="Introduction text">
            <Field label="Opening paragraph" hint="Shown at the top of the offer">
              <Textarea value={form.introText} onChange={set("introText")} rows={8} />
            </Field>
          </Section>
          <Section title="Terms & conditions">
            <Field label="Terms" hint="Shown at the bottom of the offer">
              <Textarea value={form.termsText} onChange={set("termsText")} rows={10} />
            </Field>
          </Section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
            <button
              type="button"
              onClick={() => trySetOfferStep("details")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.white,
                color: c.text,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              ← Fill details
            </button>
            <button
              type="button"
              onClick={() => trySetOfferStep("preview")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: c.white,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              Next → Preview & send
            </button>
          </div>
        </>
      )}

      {activeTab === "preview" && (
        <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, padding: 32 }}>
          {!loadedRow?.id && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              color: "#92400e",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 16
            }}>
              Save the offer as a draft first before sending — use the "Save draft" button at the top right.
            </div>
          )}
          {!form.isTemplate ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <button
                type="button"
                disabled={!loadedRow?.id || !crmCompanyEmail}
                title={!loadedRow?.id ? "Save the offer first" : !crmCompanyEmail && form.companyId ? "No email on file for this company" : undefined}
                onClick={() => void sendOfferEmail()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: !loadedRow?.id || !crmCompanyEmail ? c.border : c.primary,
                  color: c.white,
                  fontWeight: 600,
                  cursor: !loadedRow?.id || !crmCompanyEmail ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                {sendEmailLoading ? "Sending…" : "Send email"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void confirm({
                    variant: "info",
                    title: "PDF",
                    message: "PDF generation coming soon",
                    confirmLabel: "Got it",
                  })
                }
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: `1px solid ${c.primary}`,
                  background: c.white,
                  color: c.primary,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Download PDF
              </button>
              <button
                type="button"
                disabled={saving || !loadedRow?.id}
                onClick={() => void markAsSentNoEmail()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: c.primary,
                  fontWeight: 600,
                  opacity: saving || !loadedRow?.id ? 0.5 : 1,
                  cursor: saving || !loadedRow?.id ? "not-allowed" : "pointer",
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Mark as sent
              </button>
              <button
                type="button"
                disabled={!loadedRow?.id || !form.publicToken?.trim()}
                onClick={copyPublicOfferLink}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: c.primary,
                  fontWeight: 600,
                  opacity: !loadedRow?.id || !form.publicToken?.trim() ? 0.5 : 1,
                  cursor: !loadedRow?.id || !form.publicToken?.trim() ? "not-allowed" : "pointer",
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {copiedLink ? "Copied!" : "Copy link"}
              </button>
              <button
                type="button"
                disabled={!loadedRow?.id || saving}
                onClick={async () => {
                  const result = await save("accepted");
                  if (!result?.error) {
                    setSaveMsg({ type: "ok", text: "Offer marked as accepted. Contract draft created." });
                  }
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: !loadedRow?.id ? c.border : c.success,
                  color: c.white,
                  fontWeight: 600,
                  cursor: !loadedRow?.id ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                {saving ? "Processing…" : "✓ Mark as Accepted"}
              </button>
            </div>
          ) : null}

          {!form.isTemplate && !form.publicToken?.trim() && offerId ? (
            <p style={{ margin: "0 0 16px", fontSize: 13, color: c.text, opacity: 0.75 }}>Save the offer to generate a public share link for copying.</p>
          ) : null}

          {sendEmailMsg ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                background: c.hover,
                color: sendEmailMsg.type === "ok" ? c.success : c.danger,
                border: `1px solid ${c.border}`,
              }}
            >
              {sendEmailMsg.text}
            </div>
          ) : null}

          {markSentNote ? <p style={{ margin: "0 0 16px", fontSize: 12, color: c.text, opacity: 0.55 }}>Marked as sent — no email was sent</p> : null}

          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />

          {loadedRow?.parentOfferId ? (
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.primary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Version history</div>
              {versionHistory.filter((row) => row.id !== offerId).length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: c.text, opacity: 0.65 }}>No previous versions loaded.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                  {versionHistory
                    .filter((row) => row.id !== offerId)
                    .map((row) => (
                      <li
                        key={row.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: c.background,
                          border: `1px solid ${c.border}`,
                          fontSize: 13,
                          color: c.text,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>v{row.version ?? 1}.0</span>
                        <span style={{ opacity: 0.85 }}>{row.sent_at ? new Date(row.sent_at).toLocaleString("en-GB") : "—"}</span>
                        <span style={{ fontWeight: 600 }}>{row.status}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
            <button
              type="button"
              onClick={() => trySetOfferStep("content")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.white,
                color: c.text,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              ← Write content
            </button>
            <div />
          </div>
        </div>
      )}
    </div>
  );
}
