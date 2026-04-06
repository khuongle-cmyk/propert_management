"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useMarketingTenant } from "@/contexts/MarketingTenantContext";

type Offer = {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  offer_type: string;
  discount_percentage: number | null;
  discount_fixed_amount: number | null;
  promo_code: string | null;
  status: string;
  current_uses: number;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  applicable_to: string | null;
  free_months: number | null;
  bundle_description: string | null;
  referral_bonus_amount: number | null;
  property_id: string | null;
  terms: string | null;
  created_at: string | null;
};

function orgColumnLabel(tenantId: string | null | undefined, tenants: { id: string; name: string }[]): string {
  if (tenantId == null || tenantId === "") return "All";
  return tenants.find((t) => t.id === tenantId)?.name ?? tenantId;
}

function statusBadgeStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, display: "inline-block" };
  switch (status) {
    case "active":
      return { ...base, background: "#21524F", color: "#fff" };
    case "draft":
      return { ...base, background: "rgba(33,82,79,0.08)", color: "#21524F" };
    case "paused":
      return { ...base, background: "#F3DFC6", color: "#1a2e2a" };
    case "expired":
      return { ...base, background: "rgba(180,35,24,0.1)", color: "#b42318" };
    default:
      return { ...base, background: "rgba(33,82,79,0.06)", color: "#5a6b68" };
  }
}

function isExpired(offer: Offer): boolean {
  if (!offer.valid_until) return false;
  return new Date(offer.valid_until) < new Date(new Date().toISOString().slice(0, 10));
}

export default function MarketingOffersPage() {
  const { tenantId, tenants, querySuffix, dataReady, allOrganizations } = useMarketingTenant();
  const [rows, setRows] = useState<Offer[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [offerType, setOfferType] = useState("discount_pct");
  const [pct, setPct] = useState("10");
  const [promo, setPromo] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [freeMonthsCreate, setFreeMonthsCreate] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    offer_type: "discount_pct",
    discount_percentage: "",
    discount_fixed_amount: "",
    promo_code: "",
    status: "draft",
    max_uses: "",
    valid_from: "",
    valid_until: "",
    applicable_to: "all",
    free_months: "",
    bundle_description: "",
    referral_bonus_amount: "",
    terms: "",
  });
  const [editBusy, setEditBusy] = useState(false);

  const loadOffers = useCallback(async () => {
    if (!dataReady) return;
    try {
      const res = await fetch(`/api/marketing/offers${querySuffix}`, { cache: "no-store" });
      const j = (await res.json()) as { offers?: Offer[]; error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Failed to load offers";
        console.error("Offers list error:", j);
        setErr(msg);
        return;
      }
      setErr(null);
      setRows(j.offers ?? []);
    } catch (e) {
      console.error("Offers list unexpected error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      alert("Unexpected error loading offers: " + msg);
    }
  }, [dataReady, querySuffix]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  function openEdit(offer: Offer) {
    setEditingOffer(offer);
    setEditForm({
      name: offer.name,
      description: offer.description ?? "",
      offer_type: offer.offer_type ?? "discount_pct",
      discount_percentage: offer.discount_percentage != null ? String(offer.discount_percentage) : "",
      discount_fixed_amount: offer.discount_fixed_amount != null ? String(offer.discount_fixed_amount) : "",
      promo_code: offer.promo_code ?? "",
      status: offer.status ?? "draft",
      max_uses: offer.max_uses != null ? String(offer.max_uses) : "",
      valid_from: offer.valid_from ?? "",
      valid_until: offer.valid_until ?? "",
      applicable_to: offer.applicable_to ?? "all",
      free_months: offer.free_months != null ? String(offer.free_months) : "",
      bundle_description: offer.bundle_description ?? "",
      referral_bonus_amount: offer.referral_bonus_amount != null ? String(offer.referral_bonus_amount) : "",
      terms: offer.terms ?? "",
    });
  }

  async function saveEdit() {
    if (!editingOffer) return;
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      alert("Offer name is required.");
      return;
    }

    setEditBusy(true);
    try {
      const payload: Record<string, unknown> = {
        id: editingOffer.id,
        name: trimmedName,
        description: editForm.description.trim() || null,
        offer_type: editForm.offer_type,
        discount_percentage: editForm.offer_type === "discount_pct" && editForm.discount_percentage ? Number(editForm.discount_percentage) : null,
        discount_fixed_amount:
          editForm.offer_type === "discount_fixed" && editForm.discount_fixed_amount
            ? Number(editForm.discount_fixed_amount)
            : null,
        promo_code: editForm.promo_code.trim() || null,
        status: editForm.status,
        max_uses: editForm.max_uses ? Number(editForm.max_uses) : null,
        valid_from: editForm.valid_from || null,
        valid_until: editForm.valid_until || null,
        applicable_to: editForm.applicable_to,
        free_months: editForm.offer_type === "free_period" && editForm.free_months ? Number(editForm.free_months) : null,
        bundle_description: editForm.offer_type === "bundle" ? editForm.bundle_description.trim() || null : null,
        referral_bonus_amount:
          editForm.offer_type === "referral_bonus" && editForm.referral_bonus_amount
            ? Number(editForm.referral_bonus_amount)
            : null,
        terms: editForm.terms.trim() || null,
      };

      const res = await fetch("/api/marketing/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert("Error: " + (j.error ?? "Failed to update"));
        return;
      }
      setEditingOffer(null);
      await loadOffers();
    } catch (e) {
      alert("Unexpected error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEditBusy(false);
    }
  }

  async function createOffer() {
    const trimmed = name.trim();
    if (!trimmed) {
      const msg = "Offer name is required.";
      setErr(msg);
      alert(msg);
      return;
    }
    if (!allOrganizations && !tenantId) {
      const msg = "Select an organization in the header (or All organizations).";
      setErr(msg);
      alert(msg);
      return;
    }

    const pctNum = Number(pct);
    const discountPct = offerType === "discount_pct" && !Number.isNaN(pctNum) ? pctNum : null;
    const discountFixed = offerType === "discount_fixed" && !Number.isNaN(pctNum) ? pctNum : null;
    const freeMo =
      offerType === "free_period" && freeMonthsCreate.trim() && !Number.isNaN(Number(freeMonthsCreate))
        ? Number(freeMonthsCreate)
        : null;

    const applicable_to = "all";

    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        name: trimmed,
        offer_type: offerType,
        discount_percentage: discountPct,
        discount_fixed_amount: discountFixed,
        free_months: freeMo,
        promo_code: promo.trim() || undefined,
        status: "draft",
        applicable_to,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
        max_uses: maxUses ? Number(maxUses) : undefined,
      };
      if (allOrganizations) payload.allOrganizations = true;
      else payload.tenantId = tenantId;

      const res = await fetch("/api/marketing/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { offer?: Offer; error?: string };

      if (!res.ok) {
        const msg = j.error ?? "Failed to create offer";
        console.error("Create offer error:", j);
        alert("Error: " + msg);
        setErr(msg);
        return;
      }

      setName("");
      setPromo("");
      setPct("10");
      setOfferType("discount_pct");
      setValidFrom("");
      setValidUntil("");
      setMaxUses("");
      setFreeMonthsCreate("");
      await loadOffers();
    } catch (e) {
      console.error("Unexpected error creating offer:", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert("Unexpected error: " + msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!dataReady) return null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 900 }}>
      <h2
        style={{
          margin: 0,
          fontSize: "1.25rem",
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: "#21524F",
          fontWeight: 600,
        }}
      >
        Offers & discounts
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: "#5a6b68", lineHeight: 1.5 }}>
        Apply promo codes during booking/contract flows in a follow-up; usage is tracked on the offer row. Rows with organization{" "}
        <strong style={{ color: "#1a2e2a" }}>All</strong> apply across every organization (stored with no tenant).
      </p>
      {err ? <p style={{ fontSize: 14, color: "#b42318" }}>{err}</p> : null}
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 16,
          border: "1px solid rgba(33,82,79,0.1)",
          boxShadow: "0 1px 3px rgba(33,82,79,0.06)",
          display: "grid",
          gap: 10,
        }}
      >
        <input placeholder="Offer name (required)" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
        <select value={offerType} onChange={(e) => setOfferType(e.target.value)} style={inp}>
          <option value="discount_pct">% discount</option>
          <option value="discount_fixed">Fixed discount</option>
          <option value="free_period">Free months</option>
          <option value="bundle">Bundle</option>
          <option value="referral_bonus">Referral bonus</option>
        </select>
        {offerType === "discount_pct" || offerType === "discount_fixed" ? (
          <input
            placeholder={offerType === "discount_pct" ? "%" : "Amount"}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            style={inp}
          />
        ) : null}
        {offerType === "free_period" ? (
          <input
            type="number"
            min={1}
            placeholder="Free months"
            value={freeMonthsCreate}
            onChange={(e) => setFreeMonthsCreate(e.target.value)}
            style={inp}
          />
        ) : null}
        <input placeholder="Promo code (auto if empty)" value={promo} onChange={(e) => setPromo(e.target.value)} style={inp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} style={inp} aria-label="Valid from" />
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={inp} aria-label="Valid until" />
        </div>
        <input
          type="number"
          min={1}
          placeholder="Max uses (unlimited if empty)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          style={inp}
        />
        <button
          type="button"
          onClick={() => void createOffer()}
          disabled={busy}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            background: "#21524F",
            color: "#fff",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            opacity: busy ? 0.85 : 1,
          }}
        >
          {busy ? "Creating…" : `Create${allOrganizations ? " (all organizations)" : ""}`}
        </button>
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid rgba(33,82,79,0.1)",
          boxShadow: "0 1px 3px rgba(33,82,79,0.06)",
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(33,82,79,0.12)", background: "rgba(33,82,79,0.04)" }}>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Name</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Organization</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Code</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Type</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Uses</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Valid Until</th>
              <th style={{ padding: 12, fontFamily: "'DM Sans', sans-serif" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => openEdit(r)}
                style={{
                  borderBottom: "1px solid rgba(33,82,79,0.06)",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(33,82,79,0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <td style={{ padding: 12, fontWeight: 500, color: "#1a2e2a" }}>{r.name}</td>
                <td style={{ padding: 12, color: "#5a6b68" }}>{orgColumnLabel(r.tenant_id, tenants)}</td>
                <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, color: "#1a2e2a" }}>{r.promo_code ?? "—"}</td>
                <td style={{ padding: 12, color: "#5a6b68" }}>{r.offer_type}</td>
                <td style={{ padding: 12, color: "#1a2e2a" }}>
                  {r.current_uses}
                  {r.max_uses != null ? ` / ${r.max_uses}` : ""}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  {r.valid_until ? (
                    <span style={{ color: isExpired(r) ? "#b42318" : "#5a6b68" }}>
                      {r.valid_until}
                      {isExpired(r) ? " ⚠" : ""}
                    </span>
                  ) : (
                    <span style={{ color: "#8a9b98" }}>No expiry</span>
                  )}
                </td>
                <td style={{ padding: 12 }}>
                  <span style={statusBadgeStyle(r.status)}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p style={{ padding: 16, color: "#5a6b68", fontFamily: "'DM Sans', sans-serif" }}>No offers.</p>
        ) : null}
      </div>

      {editingOffer ? (
        <div
          role="presentation"
          onClick={() => setEditingOffer(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-offer-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              overflow: "auto",
              padding: 28,
              boxShadow: "0 8px 32px rgba(33,82,79,0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3
                id="edit-offer-title"
                style={{ margin: 0, fontSize: "1.15rem", fontFamily: "'Instrument Serif', Georgia, serif", color: "#21524F" }}
              >
                Edit Offer
              </h3>
              <button
                type="button"
                onClick={() => setEditingOffer(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#5a6b68", padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <label style={labelStyle}>
                <span>Name *</span>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  style={modalInputStyle}
                />
              </label>

              <label style={labelStyle}>
                <span>Description</span>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </label>

              <label style={labelStyle}>
                <span>Offer type</span>
                <select
                  value={editForm.offer_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, offer_type: e.target.value }))}
                  style={modalInputStyle}
                >
                  <option value="discount_pct">% discount</option>
                  <option value="discount_fixed">Fixed discount</option>
                  <option value="free_period">Free months</option>
                  <option value="bundle">Bundle</option>
                  <option value="referral_bonus">Referral bonus</option>
                </select>
              </label>

              {editForm.offer_type === "discount_pct" ? (
                <label style={labelStyle}>
                  <span>Discount %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.discount_percentage}
                    onChange={(e) => setEditForm((f) => ({ ...f, discount_percentage: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              ) : null}
              {editForm.offer_type === "discount_fixed" ? (
                <label style={labelStyle}>
                  <span>Discount amount (€)</span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.discount_fixed_amount}
                    onChange={(e) => setEditForm((f) => ({ ...f, discount_fixed_amount: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              ) : null}
              {editForm.offer_type === "free_period" ? (
                <label style={labelStyle}>
                  <span>Free months</span>
                  <input
                    type="number"
                    min={1}
                    value={editForm.free_months}
                    onChange={(e) => setEditForm((f) => ({ ...f, free_months: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              ) : null}
              {editForm.offer_type === "bundle" ? (
                <label style={labelStyle}>
                  <span>Bundle description</span>
                  <textarea
                    value={editForm.bundle_description}
                    onChange={(e) => setEditForm((f) => ({ ...f, bundle_description: e.target.value }))}
                    rows={2}
                    style={{ ...modalInputStyle, resize: "vertical" }}
                  />
                </label>
              ) : null}
              {editForm.offer_type === "referral_bonus" ? (
                <label style={labelStyle}>
                  <span>Referral bonus (€)</span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.referral_bonus_amount}
                    onChange={(e) => setEditForm((f) => ({ ...f, referral_bonus_amount: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              ) : null}

              <label style={labelStyle}>
                <span>Promo code</span>
                <input
                  value={editForm.promo_code}
                  onChange={(e) => setEditForm((f) => ({ ...f, promo_code: e.target.value }))}
                  style={modalInputStyle}
                  placeholder="Leave empty for auto-generated"
                />
              </label>

              <label style={labelStyle}>
                <span>Status</span>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  style={modalInputStyle}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label style={labelStyle}>
                <span>Max uses (leave empty for unlimited)</span>
                <input
                  type="number"
                  min={1}
                  value={editForm.max_uses}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_uses: e.target.value }))}
                  style={modalInputStyle}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  <span>Valid from</span>
                  <input
                    type="date"
                    value={editForm.valid_from}
                    onChange={(e) => setEditForm((f) => ({ ...f, valid_from: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span>Valid until</span>
                  <input
                    type="date"
                    value={editForm.valid_until}
                    onChange={(e) => setEditForm((f) => ({ ...f, valid_until: e.target.value }))}
                    style={modalInputStyle}
                  />
                </label>
              </div>

              <label style={labelStyle}>
                <span>Terms & conditions</span>
                <textarea
                  value={editForm.terms}
                  onChange={(e) => setEditForm((f) => ({ ...f, terms: e.target.value }))}
                  rows={3}
                  style={{ ...modalInputStyle, resize: "vertical" }}
                  placeholder="Optional terms for this offer"
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setEditingOffer(null)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  background: "transparent",
                  color: "#21524F",
                  border: "1px solid rgba(33,82,79,0.2)",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={editBusy}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  background: "#21524F",
                  color: "#fff",
                  border: "none",
                  cursor: editBusy ? "wait" : "pointer",
                  opacity: editBusy ? 0.7 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {editBusy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inp: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(33,82,79,0.2)",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  color: "#1a2e2a",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
  color: "#5a6b68",
  fontFamily: "'DM Sans', sans-serif",
};

const modalInputStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(33,82,79,0.2)",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  color: "#1a2e2a",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
