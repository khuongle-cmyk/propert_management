"use client";

/**
 * ContractEditor — Contract tool (table public.contracts, CRM company = public.leads)
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";
import { useConfirm } from "@/hooks/useConfirm";

const c = VILLAGEWORKS_BRAND.colors;

const DEFAULT_INTRO = `This contract sets out the terms under which VillageWorks will provide the agreed workspace services.

We look forward to a successful partnership.`;

const DEFAULT_TERMS = `1. This contract enters into force when signed by both parties.
2. Rent is exclusive of VAT unless otherwise stated.
3. Specific commercial terms are summarised in the schedule below.`;

const CONTRACT_STATUS_COLORS = {
  draft: { bg: c.hover, fg: c.text },
  sent: { bg: c.border, fg: c.primary },
  signed_digital: { bg: c.hover, fg: c.accent },
  signed_paper: { bg: c.hover, fg: c.warning },
  active: { bg: c.hover, fg: c.success },
};

const NON_DRAFT_CONTRACT_STATUSES = ["sent", "signed_digital", "signed_paper", "active"];

const CONTRACT_STEPS = [
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

function Input({ value, onChange, placeholder, type = "text", ...rest }) {
  return <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyleBase} {...rest} />;
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyleBase, resize: "vertical", lineHeight: 1.6 }} />;
}

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
  const s = CONTRACT_STATUS_COLORS[status] ?? CONTRACT_STATUS_COLORS.draft;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.fg }}>
      {status}
    </span>
  );
}

async function buildContractVersionChain(supabase, startId) {
  const chain = [];
  let cur = startId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const { data } = await supabase.from("contracts").select("id,version,created_at,status,parent_contract_id").eq("id", cur).maybeSingle();
    if (!data) break;
    chain.push(data);
    cur = data.parent_contract_id;
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

export default function ContractEditor({ leadId = null, initialData = {}, contractId = null, onSaved, onDeleted, onContractSigned }) {
  const supabase = getSupabaseClient();
  const [ConfirmModal, confirm] = useConfirm();

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [properties, setProperties] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState("details");
  const [loadedRow, setLoadedRow] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [lastPaperFileName, setLastPaperFileName] = useState("");
  const [sendEmailLoading, setSendEmailLoading] = useState(false);
  const [sendEmailMsg, setSendEmailMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savedContractId, setSavedContractId] = useState(contractId);
  const [users, setUsers] = useState([]);
  const [promoStatus, setPromoStatus] = useState(null);
  const [availablePromos, setAvailablePromos] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");

  const [form, setForm] = useState({
    title: "Contract",
    quantity: 1,
    status: "draft",
    version: 1,
    companyId: "",
    counterSignerUserId: "",
    requiresCounterSign: false,
    counterSignedByName: "",
    counterSignedAt: "",
    signingMethod: "esign",
    paperDocumentUrl: "",
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
    depositAmount: "",
    depositNotes: "",
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
    ...initialData,
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
    setCompanyQuery(row.company_name ?? "");
  }, []);

  useEffect(() => {
    if (!leadId || contractId) return;
    let cancelled = false;
    (async () => {
      const { data: raw } = await supabase.from("customer_companies").select(CRM_COMPANY_SELECT).eq("id", leadId).maybeSingle();
      if (cancelled || !raw) return;
      applyLeadProfile(mapCustomerCompanyRow(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, contractId, applyLeadProfile, supabase]);

  useEffect(() => {
    setSavedContractId(contractId);
  }, [contractId]);

  useEffect(() => {
    if (!contractId) {
      setLoadedRow(null);
      setVersionHistory([]);
      return;
    }
    let cancelled = false;
    supabase.from("contracts").select("*").eq("id", contractId).single().then(({ data }) => {
      if (cancelled || !data) return;
      setLoadedRow({
        id: data.id,
        status: data.status ?? "draft",
        version: data.version ?? 1,
        public_token: data.public_token ?? "",
        created_at: data.created_at ?? null,
        lead_id: data.lead_id ?? null,
        signed_at: data.signed_at ?? null,
      });
      setForm({
        title: data.title ?? "Contract",
        quantity: data.quantity ?? 1,
        status: data.status ?? "draft",
        version: data.version ?? 1,
        companyId: data.company_id ?? "",
        signingMethod: data.signing_method ?? "esign",
        paperDocumentUrl: data.paper_document_url ?? "",
        customerName: data.customer_name ?? "",
        customerEmail: data.customer_email ?? "",
        customerPhone: data.customer_phone ?? "",
        customerCompany: data.customer_company ?? "",
        propertyId: data.property_id ?? "",
        spaceDetails: data.space_details ?? "",
        monthlyPrice: data.monthly_price ?? "",
        contractLengthMonths: data.contract_length_months ?? 12,
        startDate: data.start_date ?? "",
        furnitureIncluded: data.furniture_included ?? false,
        furnitureDescription: data.furniture_description ?? "",
        furnitureMonthlyPrice: data.furniture_monthly_price != null ? String(data.furniture_monthly_price) : "",
        pricingNotes: data.pricing_notes ?? "",
        depositAmount: data.deposit_amount ?? "",
        depositNotes: data.deposit_notes ?? "",
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
      });
      setCompanyQuery(data.customer_company ?? "");
    });
    buildContractVersionChain(supabase, contractId).then((ch) => {
      if (!cancelled) setVersionHistory(ch);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId, supabase]);

  useEffect(() => {
    supabase.from("properties").select("id,name,address,city").order("name").then(({ data }) => setProperties(data ?? []));
    supabase
      .from("marketing_offers")
      .select("id, name, promo_code, offer_type, discount_percentage, discount_fixed_amount, free_months, valid_from, valid_until, description")
      .eq("status", "active")
      .then(({ data }) => {
        if (data) setAvailablePromos(data);
      });
    supabase
      .from("contracts")
      .select("id,template_name,intro_text,terms_text,space_details,monthly_price,contract_length_months")
      .eq("is_template", true)
      .order("template_name")
      .then(({ data }) => setTemplates(data ?? []));
    // Fetch only staff with manager/super_admin roles for counter-signing
    supabase
      .from("memberships")
      .select("user_id, role")
      .in("role", ["super_admin", "manager", "owner"])
      .then(async ({ data: members }) => {
        if (!members || members.length === 0) return;
        const userIds = [...new Set(members.map((m) => m.user_id))];
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", userIds);
        if (profiles) {
          setUsers(
            profiles
              .map((u) => ({
                id: u.user_id,
                display: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || u.user_id.slice(0, 8),
              }))
              .sort((a, b) => a.display.localeCompare(b.display)),
          );
        }
      });
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user?.id) return;
      const userId = data.user.id;
      supabase
        .from("memberships")
        .select("role")
        .eq("user_id", userId)
        .then(({ data: memberships }) => {
          if (memberships?.some((m) => m.role?.trim().toLowerCase() === "super_admin")) {
            setIsSuperAdmin(true);
          }
        });
      supabase
        .from("user_profiles")
        .select("first_name, last_name")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile) {
            setCurrentUserName([profile.first_name, profile.last_name].filter(Boolean).join(" ") || "");
          }
        });
    });
  }, [supabase]);

  useEffect(() => {
    const title = (form.title || "").toLowerCase();
    const needsCounterSign = title.includes("office room") || title.includes("virtual office") || title.includes("coworking");
    setForm((f) => ({ ...f, requiresCounterSign: needsCounterSign }));
  }, [form.title]);

  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyOpen, setCompanyOpen] = useState(false);

  useEffect(() => {
    const q = companyQuery.trim();
    if (q.length < 2) {
      setCompanyOptions([]);
      return;
    }
    const t = setTimeout(() => {
      supabase
        .from("customer_companies")
        .select(CRM_COMPANY_SELECT)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(25)
        .then(({ data }) => setCompanyOptions((data ?? []).map(mapCustomerCompanyRow)));
    }, 280);
    return () => clearTimeout(t);
  }, [companyQuery, supabase]);

  function set(field) {
    return (val) => setForm((f) => ({ ...f, [field]: val }));
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

  async function onPaperFile(file) {
    if (!file) return;
    setLastPaperFileName(file.name);
    const path = `contract-paper/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (error) {
      setSaveMsg({ type: "error", text: error.message || "Upload failed — add a public URL manually or configure the documents bucket." });
      return;
    }
    const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
    setForm((f) => ({ ...f, paperDocumentUrl: pub.publicUrl }));
  }

  function resolvePublicTokenForSave(shouldFork) {
    if (form.isTemplate) return null;
    if (shouldFork) return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
    const existing = String(loadedRow?.public_token ?? "").trim();
    if (existing) return existing;
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
  }

  async function sendContractEmail() {
    const idToUse = savedContractId ?? contractId ?? loadedRow?.id;
    if (!idToUse || !form.customerEmail) {
      setSendEmailMsg({ type: "error", text: !idToUse ? "Save the contract first." : "No customer email on file." });
      return;
    }
    setSendEmailLoading(true);
    setSendEmailMsg(null);
    try {
      const res = await fetch("/api/crm/contracts/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: idToUse }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to send email");
      setForm((f) => ({ ...f, status: "sent" }));
      setLoadedRow((lr) => (lr ? { ...lr, status: "sent" } : lr));
      setSendEmailMsg({ type: "ok", text: `Signing email sent to ${form.customerEmail}` });
    } catch (e) {
      setSendEmailMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to send" });
    } finally {
      setSendEmailLoading(false);
    }
  }

  function copySigningLink() {
    const idToUse = savedContractId ?? contractId ?? loadedRow?.id;
    if (!idToUse || !loadedRow?.public_token) return;
    const url = `${window.location.origin}/contracts/${loadedRow.public_token}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  }

  async function save(newStatus) {
    setSaving(true);
    setSaveMsg(null);
    const effectiveId = savedContractId || contractId;
    const effectiveStatus = newStatus ?? form.status;
    const rowStatus = loadedRow?.status ?? "draft";
    const shouldFork = Boolean(effectiveId) && !form.isTemplate && NON_DRAFT_CONTRACT_STATUSES.includes(rowStatus);
    const public_token = resolvePublicTokenForSave(shouldFork);

    const payload = {
      title: form.title,
      status: effectiveStatus,
      lead_id: leadId,
      company_id: form.companyId || null,
      counter_signer_user_id: form.counterSignerUserId || null,
      requires_counter_sign: form.requiresCounterSign ?? false,
      signing_method: form.signingMethod,
      paper_document_url: form.signingMethod === "paper" ? form.paperDocumentUrl || null : null,
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
      deposit_amount:
        form.depositAmount != null && String(form.depositAmount).trim()
          ? String(form.depositAmount).trim()
          : null,
      deposit_notes: form.depositNotes?.trim() || null,
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
        .from("contracts")
        .insert({
          ...payload,
          version: nextVersion,
          parent_contract_id: effectiveId,
        })
        .select()
        .single();
      error = insErr;
      if (inserted) {
        resultId = inserted.id;
        setForm((f) => ({ ...f, version: nextVersion, status: effectiveStatus }));
        setLoadedRow({
          id: inserted.id,
          status: effectiveStatus,
          version: nextVersion,
          public_token: inserted.public_token ?? "",
          created_at: inserted.created_at ?? null,
          lead_id: inserted.lead_id ?? null,
        });
        buildContractVersionChain(supabase, inserted.id).then(setVersionHistory);
      }
    } else if (effectiveId) {
      const { data: updated, error: upErr } = await supabase.from("contracts").update(payload).eq("id", effectiveId).select().single();
      error = upErr;
      if (updated) {
        setLoadedRow((lr) =>
          lr
            ? {
                ...lr,
                status: effectiveStatus,
                version: updated.version ?? lr.version ?? 1,
                public_token: updated.public_token ?? lr.public_token ?? "",
                created_at: updated.created_at ?? lr.created_at ?? null,
                lead_id: updated.lead_id ?? lr.lead_id ?? null,
              }
            : lr,
        );
      }
    } else {
      const { data: inserted, error: insErr } = await supabase.from("contracts").insert(payload).select().single();
      error = insErr;
      if (inserted) {
        resultId = inserted.id;
        setLoadedRow({
          id: inserted.id,
          status: effectiveStatus,
          version: inserted.version ?? 1,
          public_token: inserted.public_token ?? "",
          created_at: inserted.created_at ?? null,
          lead_id: inserted.lead_id ?? null,
        });
        setForm((f) => ({ ...f, version: inserted.version ?? 1 }));
        buildContractVersionChain(supabase, inserted.id).then(setVersionHistory);
      }
    }

    setSaving(false);
    if (error) {
      setSaveMsg({ type: "error", text: error.message });
      return { error };
    }
    setSavedContractId(resultId);
    setSaveMsg({ type: "ok", text: newStatus === "sent" ? "Contract marked as sent!" : shouldFork ? "Saved as new version." : "Saved." });
    onSaved?.({ newContractId: resultId !== effectiveId ? resultId : undefined });
    if (newStatus) setForm((f) => ({ ...f, status: newStatus }));
    return { error: null };
  }

  const selectedProperty = properties.find((p) => p.id === form.propertyId);

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
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${c.text};opacity:0.72">VillageWorks — Contract</div>
        <h1 style="margin:8px 0 4px;font-size:28px;font-weight:700;color:${c.text}">${form.title}</h1>
        <div style="font-size:13px;color:${c.text};opacity:0.72">Prepared for: <strong>${form.customerName || "—"}</strong>${form.customerCompany ? ` · ${form.customerCompany}` : ""}</div>
        <div style="font-size:12px;color:${c.text};opacity:0.6;margin-top:4px">Date: ${new Date(loadedRow?.created_at || Date.now()).toLocaleDateString("fi-FI")}</div>
        <div style="font-size:12px;margin-top:6px;color:${c.text};opacity:0.65">Signing: ${form.signingMethod === "paper" ? "Paper" : "E-sign via link"}</div>
               </div>
      <p style="font-size:15px">${(form.introText || "").replace(/\n/g, "<br>")}</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Contract date</td><td style="padding:10px 14px">${new Date(loadedRow?.created_at || Date.now()).toLocaleDateString("fi-FI")}</td></tr>
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Space</td><td style="padding:10px 14px">${form.spaceDetails || "—"}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:600">Location</td><td style="padding:10px 14px">${selectedProperty ? `${selectedProperty.name}, ${selectedProperty.address}, ${selectedProperty.city}` : "—"}</td></tr>
        ${baseRent ? `<tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Monthly rent</td><td style="padding:10px 14px;font-size:18px;font-weight:700;color:${rentCol}">${spaceDiscount > 0 ? `<span style="text-decoration:line-through;opacity:0.5;font-size:14px">€${baseRent.toLocaleString("en-IE")}</span> €${discountedRent.toLocaleString("en-IE")}` : `€${baseRent.toLocaleString("en-IE")}`} / month</td></tr>` : ""}${spaceDiscount > 0 ? `<tr style="background:#dcfce7"><td style="padding:10px 14px;font-weight:500;color:#166534;font-size:13px">↳ Promo discount</td><td style="padding:10px 14px;color:#166534;font-weight:600;font-size:13px">${form.promoDescription} (−€${spaceDiscount.toLocaleString("en-IE")}/month)</td></tr>` : ""}
        <tr><td style="padding:10px 14px;font-weight:600">Contract length</td><td style="padding:10px 14px">${form.contractLengthMonths ? `${form.contractLengthMonths} months` : "—"}</td></tr>
        <tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Start</td><td style="padding:10px 14px">${form.startDate || "To be agreed"}</td></tr>
        ${form.furnitureIncluded ? `<tr style="background:${c.hover}"><td style="padding:10px 14px;font-weight:600">Furniture</td><td style="padding:10px 14px">${form.furnitureDescription || "Included"}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600">Furniture rent</td><td style="padding:10px 14px">${furnitureDiscount > 0 ? `<span style="text-decoration:line-through;opacity:0.5;font-size:12px">€${furnitureRent.toLocaleString("en-IE")}</span> €${discountedFurniture.toLocaleString("en-IE")}` : `€${furnitureRent.toLocaleString("en-IE")}`}/month excl. VAT</td></tr>${furnitureDiscount > 0 ? `<tr style="background:#dcfce7"><td style="padding:10px 14px;font-weight:500;color:#166534;font-size:13px">↳ Promo discount</td><td style="padding:10px 14px;color:#166534;font-weight:600;font-size:13px">${form.promoDescription} (−€${furnitureDiscount.toLocaleString("en-IE")}/month)</td></tr>` : ""}` : ""}<tr style="background:${c.primary}"><td style="padding:10px 14px;font-weight:700;color:${c.white}">Total monthly</td><td style="padding:10px 14px;font-weight:700;color:${c.white}">€${totalAfterDiscount.toLocaleString("en-IE")} / month excl. VAT</td></tr>
      </table>
      <h3 style="font-size:15px;border-bottom:1px solid ${c.border};padding-bottom:6px;color:${c.text}">Terms &amp; conditions</h3>
      <p style="font-size:13px;color:${c.text};opacity:0.85">${(form.termsText || "").replace(/\n/g, "<br>")}</p>
      ${(form.depositAmount && String(form.depositAmount).trim()) || (form.depositNotes && form.depositNotes.trim())
        ? `
      <div style="margin-top:16px;padding:14px 18px;background:#f9f1e5;border-radius:8px;border:1px solid ${c.border}">
        <p style="margin:0;font-size:13px;font-weight:600;color:${c.text}">Deposit</p>
        <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:${c.text}">
          ${form.depositAmount && String(form.depositAmount).trim() ? `€${Number(form.depositAmount).toLocaleString("en-IE")}` : ""}${form.depositAmount && String(form.depositAmount).trim() && form.depositNotes?.trim() ? " — " : ""}${form.depositNotes?.trim() || ""}
        </p>
      </div>`
        : ""}
    </div>
  `;
  }, [form, selectedProperty, loadedRow?.created_at]);

  const stepIndex = CONTRACT_STEPS.findIndex((s) => s.key === activeTab);
  const currentStep = stepIndex >= 0 ? stepIndex : 0;

  const verLabel = `v${form.version ?? 1}.0`;

  async function nextFromDetails() {
    const r = await save();
    if (!r?.error) {
      setActiveTab("content");
    }
  }

  const statusLocksDelete = ["signed_digital", "signed_paper", "active"].includes(form.status);

  async function deleteContract() {
    if (!loadedRow?.id || statusLocksDelete) return;
    const ok = await confirm({
      title: "Delete this contract?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      confirmDanger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("contracts").delete().eq("id", loadedRow.id);
    if (error) {
      const msg = String(error.message || "");
      const text = msg.toLowerCase().includes("foreign key")
        ? "This contract cannot be deleted because it has linked records."
        : msg || "Failed to delete contract.";
      setSaveMsg({ type: "error", text });
      return;
    }
    onDeleted?.();
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 860, margin: "0 auto" }}>
      <ConfirmModal />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 className="vw-admin-page-title" style={{ margin: 0 }}>{form.title || "Contract editor"}</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.secondary }}>{verLabel}</span>
          <StatusBadge status={form.status} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          {loadedRow?.id ? (
            <button
              type="button"
              onClick={() => void deleteContract()}
              disabled={statusLocksDelete}
              title={statusLocksDelete ? "Signed contracts can only be deleted by a Super Admin" : undefined}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${c.danger}`,
                background: c.white,
                color: c.danger,
                fontWeight: 600,
                cursor: statusLocksDelete ? "not-allowed" : "pointer",
                fontSize: 13,
                opacity: statusLocksDelete ? 0.5 : 1,
              }}
            >
              Delete contract
            </button>
          ) : null}
          <button type="button" onClick={() => save()} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${c.primary}`, background: c.white, color: c.primary, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={() => save("sent")} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: c.primary, color: c.white, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            Mark as sent
          </button>
        </div>
      </div>

      {saveMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: c.hover, color: saveMsg.type === "ok" ? c.success : c.danger, border: `1px solid ${c.border}` }}>
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
          {CONTRACT_STEPS.map((step, i) => {
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
                  onClick={() => setActiveTab(step.key)}
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
                {i < CONTRACT_STEPS.length - 1 ? (
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
          <Section title="Contract settings">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                <Field label="Contract title">
                  <select value={form.title} onChange={(e) => set("title")(e.target.value)} style={inputStyleBase}>
                    <option value="">— Select service type —</option>
                    <option value={Number(form.quantity) >= 2 ? "Contract – Office Rooms" : "Contract – Office Room"}>
                      {Number(form.quantity) >= 2 ? "Contract – Office Rooms" : "Contract – Office Room"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Contract – Meeting Rooms" : "Contract – Meeting Room"}>
                      {Number(form.quantity) >= 2 ? "Contract – Meeting Rooms" : "Contract – Meeting Room"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Contract – Venues" : "Contract – Venue"}>
                      {Number(form.quantity) >= 2 ? "Contract – Venues" : "Contract – Venue"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Contract – Coworking Flex Desks" : "Contract – Coworking Flex Desk"}>
                      {Number(form.quantity) >= 2 ? "Contract – Coworking Flex Desks" : "Contract – Coworking Flex Desk"}
                    </option>
                    <option value={Number(form.quantity) >= 2 ? "Contract – Coworking Fixed Desks" : "Contract – Coworking Fixed Desk"}>
                      {Number(form.quantity) >= 2 ? "Contract – Coworking Fixed Desks" : "Contract – Coworking Fixed Desk"}
                    </option>
                    <option value="Contract – Virtual Office Service">Contract – Virtual Office Service</option>
                  </select>
                </Field>
                <Field label="Quantity">
                  <input type="number" min="1" value={form.quantity ?? 1} onChange={(e) => set("quantity")(e.target.value)} style={inputStyleBase} />
                </Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status")(e.target.value)} style={inputStyleBase}>
                  {["draft", "sent", "signed_digital", "signed_paper", "active"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.requiresCounterSign && (
              <div
                style={{
                  marginTop: 16,
                  padding: "16px 20px",
                  background: "#f0f9f4",
                  borderRadius: 10,
                  border: "1px solid #d1e7dd",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 12 }}>DUAL SIGNING REQUIRED</div>
                <p style={{ fontSize: 12, color: c.secondary, marginBottom: 12 }}>
                  This contract type requires signatures from both the client and a VillageWorks representative.
                </p>
                <Field label="VillageWorks counter-signer">
                  <select value={form.counterSignerUserId} onChange={(e) => set("counterSignerUserId")(e.target.value)} style={inputStyleBase}>
                    <option value="">— Select signer —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.counterSignedAt && (
                  <div style={{ fontSize: 12, color: c.success, marginTop: 8 }}>
                    ✓ Counter-signed by {form.counterSignedByName} on {new Date(form.counterSignedAt).toLocaleDateString("fi-FI")}
                  </div>
                )}
              </div>
            )}
            <Field label="Internal notes">
              <Textarea value={form.notes} onChange={set("notes")} placeholder="Internal notes…" rows={3} />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="ct-template" checked={form.isTemplate} onChange={(e) => set("isTemplate")(e.target.checked)} />
              <label htmlFor="ct-template" style={{ fontSize: 14, cursor: "pointer", color: c.text }}>
                Save as reusable template
              </label>
            </div>
            {form.isTemplate && (
              <Field label="Template name">
                <Input value={form.templateName} onChange={set("templateName")} placeholder="Template name…" />
              </Field>
            )}
          </Section>

          <Section title="Company (CRM)">
            <Field label="Search company">
              <div style={{ position: "relative" }}>
                <Input value={companyQuery} onChange={setCompanyQuery} placeholder="Type to search…" onFocus={() => setCompanyOpen(true)} onBlur={() => setTimeout(() => setCompanyOpen(false), 200)} />
                {companyOpen && companyOptions.length > 0 && (
                  <ul
                    style={{
                      position: "absolute",
                      zIndex: 10,
                      left: 0,
                      right: 0,
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      background: c.white,
                      border: `1px solid ${c.border}`,
                      borderRadius: 8,
                      marginTop: 4,
                      maxHeight: 220,
                      overflow: "auto",
                      boxShadow: `0 8px 24px ${c.primary}14`,
                    }}
                  >
                    {companyOptions.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => {
                            applyLeadProfile(row);
                            setCompanyOpen(false);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            border: "none",
                            background: c.white,
                            cursor: "pointer",
                            fontSize: 13,
                            color: c.text,
                            borderBottom: `1px solid ${c.border}`,
                          }}
                        >
                          <strong>{row.company_name}</strong>
                          {row.email ? <span style={{ opacity: 0.75 }}> · {row.email}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
            {form.companyId ? (
              <p style={{ margin: 0, fontSize: 13, color: c.text, opacity: 0.75 }}>
                Selected lead ID: <code style={{ color: c.primary }}>{form.companyId}</code>
              </p>
            ) : null}
          </Section>

          <Section title="Signing">
            <Field label="Signing method">
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: c.text }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="radio" name="signing_method" checked={form.signingMethod === "esign"} onChange={() => set("signingMethod")("esign")} />
                  E-sign via link
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="radio" name="signing_method" checked={form.signingMethod === "paper"} onChange={() => set("signingMethod")("paper")} />
                  Paper — upload later
                </label>
              </div>
            </Field>
            {form.signingMethod === "paper" && (
              <>
                <Field label="Paper document" hint="Uploads to Supabase Storage bucket documents/ (configure bucket & public access as needed)">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                    style={{ fontSize: 13, color: c.text }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onPaperFile(f);
                    }}
                  />
                  {lastPaperFileName ? <span style={{ fontSize: 12, color: c.text, opacity: 0.7 }}>Last file: {lastPaperFileName}</span> : null}
                </Field>
                <Field label="Or paste document URL">
                  <Input value={form.paperDocumentUrl} onChange={set("paperDocumentUrl")} placeholder="https://…" type="url" />
                </Field>
              </>
            )}
          </Section>

          <Section title="Version history">
            {versionHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: c.text, opacity: 0.65 }}>Save this contract to start a version history.</p>
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
                      background: row.id === contractId ? c.hover : c.background,
                      border: `1px solid ${c.border}`,
                      fontSize: 13,
                      color: c.text,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      v{row.version ?? 1}.0 · {row.status}
                      {row.id === contractId ? <span style={{ marginLeft: 8, color: c.accent }}>(current)</span> : null}
                    </span>
                    <span style={{ opacity: 0.75 }}>{row.created_at ? new Date(row.created_at).toLocaleString("en-GB") : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Contact person">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Full name">
                <Input value={form.customerName} onChange={set("customerName")} placeholder="Contact name" />
              </Field>
              <Field label="Email">
                <Input value={form.customerEmail} onChange={set("customerEmail")} type="email" placeholder="email@…" />
              </Field>
              <Field label="Phone">
                <Input value={form.customerPhone} onChange={set("customerPhone")} placeholder="+358 …" />
              </Field>
            </div>
          </Section>

          <Section title="Space & pricing">
            <Field label="Property">
              <select value={form.propertyId} onChange={(e) => set("propertyId")(e.target.value)} style={inputStyleBase}>
                <option value="">Select property…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.city}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ width: "100%" }}>
              <Field label="Space / room details">
                <Input value={form.spaceDetails} onChange={set("spaceDetails")} placeholder="Office 4B…" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, width: "100%" }}>
              <div style={{ minWidth: 0 }}>
                <Field label="Monthly rent (€)">
                  <Input value={form.monthlyPrice} onChange={set("monthlyPrice")} type="number" placeholder="1200" />
                </Field>
              </div>
              <div style={{ minWidth: 0 }}>
                <Field label="Contract length (months)">
                  <Input value={form.contractLengthMonths} onChange={set("contractLengthMonths")} type="number" placeholder="12" />
                </Field>
              </div>
              <div style={{ minWidth: 0 }}>
                <Field label="Start date">
                  <Input value={form.startDate} onChange={set("startDate")} type="date" />
                </Field>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
              <Field label="Deposit amount (€)" hint="Numeric amount for invoicing">
                <Input
                  value={form.depositAmount ?? ""}
                  onChange={set("depositAmount")}
                  placeholder="3000"
                  type="number"
                />
              </Field>
              <Field label="Deposit description" hint="Shown to client in contract">
                <Input
                  value={form.depositNotes ?? ""}
                  onChange={set("depositNotes")}
                  placeholder="e.g. 2 months rent, bank guarantee required"
                />
              </Field>
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
                {form.promoDiscount && (
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
                )}
              </div>
              {form.promoDiscount && (
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
              )}
              {promoStatus && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
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
            <div>{/* previous button or empty */}</div>
            <button
              type="button"
              onClick={() => void nextFromDetails()}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: c.primary, color: c.white, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
            >
              {saving ? "Saving…" : "Next → Write content"}
            </button>
          </div>
        </>
      )}

      {activeTab === "content" && (
        <>
          <Section title="Introduction">
            <Field label="Opening" hint="Shown at the top of the contract">
              <Textarea value={form.introText} onChange={set("introText")} rows={8} />
            </Field>
          </Section>
          <Section title="Terms">
            <Field label="Terms" hint="Shown at the bottom of the contract">
              <Textarea value={form.termsText} onChange={set("termsText")} rows={10} />
            </Field>
          </Section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
            <div>
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.white, color: c.text, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                ← Fill details
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: c.primary, color: c.white, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                Next → Preview & send
              </button>
            </div>
          </div>
        </>
      )}

      {activeTab === "preview" && (
        <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button
              type="button"
              disabled={!loadedRow?.id || !form.customerEmail || sendEmailLoading}
              onClick={() => void sendContractEmail()}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: !loadedRow?.id || !form.customerEmail ? c.border : c.primary,
                color: c.white,
                fontWeight: 600,
                cursor: !loadedRow?.id || !form.customerEmail ? "not-allowed" : "pointer",
                fontSize: 14,
              }}
            >
              {sendEmailLoading ? "Sending…" : "Send for signing"}
            </button>
            {form.requiresCounterSign && !form.counterSignedAt && (
              <button
                type="button"
                disabled={!loadedRow?.id || saving || !form.counterSignerUserId}
                onClick={async () => {
                  const signer = users.find((u) => u.id === form.counterSignerUserId);
                  const signerName = signer?.display || "VillageWorks";
                  const { data: prior } = await supabase
                    .from("contracts")
                    .select("signed_at, status")
                    .eq("id", loadedRow.id)
                    .maybeSingle();
                  const ts = new Date().toISOString();
                  const { error } = await supabase
                    .from("contracts")
                    .update({
                      counter_signed_by_name: signerName,
                      counter_signed_at: ts,
                      counter_signature_data: JSON.stringify({
                        method: "internal",
                        name: signerName,
                        timestamp: ts,
                      }),
                    })
                    .eq("id", loadedRow.id);
                  if (!error) {
                    setForm((f) => ({
                      ...f,
                      counterSignedByName: signerName,
                      counterSignedAt: ts,
                    }));
                    const clientHadSigned =
                      Boolean(loadedRow?.signed_at || prior?.signed_at) ||
                      form.status === "partially_signed" ||
                      prior?.status === "partially_signed";
                    if (clientHadSigned) {
                      // Both signed - mark as fully signed
                      await supabase.from("contracts").update({ status: "signed_digital" }).eq("id", loadedRow.id);
                      setForm((f) => ({ ...f, status: "signed_digital" }));
                      setLoadedRow((lr) => (lr ? { ...lr, status: "signed_digital" } : lr));

                      // Send confirmation email
                      try {
                        await fetch("/api/crm/contracts/send-signed-confirmation", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contractId: loadedRow.id }),
                        });
                      } catch (e) {
                        console.error("Error sending confirmation:", e);
                      }

                      setSaveMsg({ type: "ok", text: `Fully signed. Confirmation email sent to ${form.customerEmail}` });
                      const leadToWin = form.companyId || leadId;
                      if (leadToWin) {
                        const now = new Date().toISOString();
                        await supabase.from("customer_companies").update({
                          stage: "won",
                          status: "active",
                          stage_changed_at: now,
                          won_at: now,
                          updated_at: now,
                        }).eq("id", leadToWin);
                      }
                      onContractSigned?.();
                    } else {
                      setSaveMsg({ type: "ok", text: `Counter-signed by ${signerName}` });
                    }
                  }
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: !loadedRow?.id || !form.counterSignerUserId ? c.border : "#2563eb",
                  color: c.white,
                  fontWeight: 600,
                  cursor: !loadedRow?.id || !form.counterSignerUserId ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                ✍ Counter-sign (VW)
              </button>
            )}
            {isSuperAdmin && (
              <button
                type="button"
                disabled={!loadedRow?.id || saving}
                onClick={async () => {
                  if (form.requiresCounterSign && !form.counterSignedAt) {
                    setSaveMsg({
                      type: "error",
                      text: "Counter-signature from VillageWorks representative is required before marking as fully signed.",
                    });
                    return;
                  }
                  const result = await save("signed_digital");
                  if (!result?.error) {
                    // Record who marked it as signed
                    const effectiveContractId = savedContractId || contractId || loadedRow?.id;
                    if (effectiveContractId && currentUserName) {
                      await supabase.from("contracts").update({
                        counter_signed_by_name: currentUserName,
                        counter_signed_at: new Date().toISOString(),
                        signed_at: new Date().toISOString(),
                        signed_by_name: form.customerName || currentUserName,
                      }).eq("id", effectiveContractId);
                    }
                    const leadToWin = form.companyId || leadId;
                    if (leadToWin) {
                      const now = new Date().toISOString();
                      await supabase.from("customer_companies").update({
                        stage: "won",
                        status: "active",
                        stage_changed_at: now,
                        won_at: now,
                        updated_at: now,
                      }).eq("id", leadToWin);
                    }
                    setSaveMsg({ type: "ok", text: "Contract marked as signed. Lead moved to Won." });
                    onContractSigned?.();
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
                {saving ? "Processing…" : "✓ Mark as Signed"}
              </button>
            )}
            <button
              type="button"
              disabled={!loadedRow?.id || saving}
              onClick={async () => {
                const confirmed = window.confirm(
                  "Are you sure you want to mark this deal as lost? The lead will be moved to the Lost stage.",
                );
                if (!confirmed) return;
                const leadIdForLost = form.companyId || loadedRow?.lead_id;
                if (leadIdForLost) {
                  await supabase
                    .from("customer_companies")
                    .update({
                      stage: "lost",
                      stage_changed_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", leadIdForLost);
                }
                setSaveMsg({ type: "ok", text: "Deal marked as lost." });
                onSaved?.();
              }}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: `1px solid ${c.danger}`,
                background: "transparent",
                color: c.danger,
                fontWeight: 600,
                cursor: !loadedRow?.id ? "not-allowed" : "pointer",
                fontSize: 14,
              }}
            >
              ✕ Deal Lost
            </button>
            <button
              type="button"
              disabled={!loadedRow?.id || !loadedRow?.public_token}
              onClick={copySigningLink}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: c.primary,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
                textDecoration: "underline",
              }}
            >
              {copiedLink ? "✓ Copied!" : "Copy signing link"}
            </button>
          </div>
          {sendEmailMsg && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                background: sendEmailMsg.type === "ok" ? "#dcfce7" : "#fef2f2",
                color: sendEmailMsg.type === "ok" ? "#166534" : "#991b1b",
              }}
            >
              {sendEmailMsg.text}
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}`, display: "flex", gap: 10 }}>
            <button type="button" onClick={() => window.open(`/api/contracts/${contractId ?? "preview"}/pdf`, "_blank")} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: c.primary, color: c.white, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              Download PDF
            </button>
            {contractId ? (
              <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/contracts/${contractId}/view`)} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${c.primary}`, background: c.white, color: c.primary, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                Copy link
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
            <div>
              <button
                type="button"
                onClick={() => setActiveTab("content")}
                style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.white, color: c.text, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                ← Write content
              </button>
            </div>
            <div>{/* next button or empty */}</div>
          </div>
        </div>
      )}
    </div>
  );
}
