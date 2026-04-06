"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const petrol = "#21524F";
const cream = "#faf8f5";
const white = "#ffffff";
const textDark = "#2c2825";
const textMuted = "#8a8580";
const border = "#e5e0da";
const green = "#27ae60";
const red = "#c0392b";

type ContractData = {
  id: string;
  title: string | null;
  status: string;
  customer_name: string | null;
  customer_company: string | null;
  space_details: string | null;
  monthly_price: number | null;
  contract_length_months: number | null;
  start_date: string | null;
  intro_text: string | null;
  terms_text: string | null;
  contract_body: string | null;
  signing_method: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  requires_counter_sign: boolean;
  counter_signed_by_name: string | null;
  counter_signed_at: string | null;
  counter_signer_user_id: string | null;
  furniture_included: boolean;
  furniture_description: string | null;
  furniture_monthly_price: number | null;
  pricing_notes: string | null;
  promo_code: string | null;
  promo_discount: number | null;
  promo_description: string | null;
  promo_type: string | null;
  promo_applies_to: string | null;
  deposit_amount: string | number | null;
  deposit_notes: string | null;
};

type PropertyRow = { name: string | null; address: string | null; city: string | null } | null;

export default function ContractSignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = typeof params.token === "string" ? params.token : "";
  const isCounterSigner = searchParams.get("role") === "counter";

  const [contract, setContract] = useState<ContractData | null>(null);
  const [property, setProperty] = useState<PropertyRow>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signing state
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const applyContractPayload = useCallback(
    (data: { contract: ContractData; property?: PropertyRow; companyName?: string | null }) => {
      setContract(data.contract);
      if (data.property !== undefined) setProperty(data.property);
      if (data.companyName !== undefined) setCompanyName(data.companyName);
      const c = data.contract;
      const reqCounter = Boolean(c.requires_counter_sign);
      const fullyDone =
        c.status === "signed_digital" ||
        c.status === "signed_paper" ||
        c.status === "active" ||
        Boolean(c.signed_at && !reqCounter) ||
        Boolean(reqCounter && c.signed_at && c.counter_signed_at);
      setSigned(fullyDone);
      if (c.customer_name && !isCounterSigner) setSignerName(c.customer_name);
    },
    [isCounterSigner],
  );

  useEffect(() => {
    if (!token) return;
    fetch(`/api/contracts/${token}/sign`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          applyContractPayload({
            contract: data.contract,
            property: data.property,
            companyName: data.companyName,
          });
        }
      })
      .catch(() => setError("Failed to load contract"))
      .finally(() => setLoading(false));
  }, [token, applyContractPayload]);

  const handleSign = async () => {
    if (!signerName.trim() || signerName.trim().length < 2) {
      setSignError("Please enter your full name.");
      return;
    }
    if (!agreed) {
      setSignError("Please confirm that you agree to the terms.");
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      const res = await fetch(`/api/contracts/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedByName: signerName.trim(),
          isCounterSign: isCounterSigner,
          signatureData: JSON.stringify({
            method: isCounterSigner ? "counter_sign_typed" : "typed_name",
            name: signerName.trim(),
            role: isCounterSigner ? "villageworks_representative" : "client",
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
          }),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sign");
      const refresh = await fetch(`/api/contracts/${token}/sign`).then((r) => r.json());
      if (!refresh.error && refresh.contract) {
        applyContractPayload({
          contract: refresh.contract,
          property: refresh.property,
          companyName: refresh.companyName,
        });
      } else {
        setSigned(true);
      }
      setAgreed(false);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "Failed to sign contract");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: textMuted }}>Loading contract...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: white, padding: 40, borderRadius: 16, textAlign: "center", maxWidth: 400, border: `1px solid ${border}` }}>
          <h2 style={{ color: red, margin: "0 0 12px" }}>Error</h2>
          <p style={{ color: textDark }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!contract) return null;

  const clientAwaitingCounterSign =
    !isCounterSigner &&
    contract.signing_method === "esign" &&
    contract.requires_counter_sign &&
    Boolean(contract.signed_at) &&
    !contract.counter_signed_at;

  const baseRent = Number(contract.monthly_price) || 0;
  const furnitureRent = contract.furniture_included ? Number(contract.furniture_monthly_price) || 0 : 0;
  const promoAppliesTo = contract.promo_applies_to || "all";
  const hasPromo = Boolean(contract.promo_discount);

  let spaceDiscount = 0;
  let furnitureDiscount = 0;

  if (hasPromo) {
    if (contract.promo_type === "discount_pct") {
      const pct = Number(contract.promo_discount) / 100;
      if (promoAppliesTo === "all" || promoAppliesTo === "space") spaceDiscount = Math.round(baseRent * pct * 100) / 100;
      if (promoAppliesTo === "all" || promoAppliesTo === "furniture") furnitureDiscount = Math.round(furnitureRent * pct * 100) / 100;
    } else if (contract.promo_type === "discount_fixed") {
      const fixed = Number(contract.promo_discount) || 0;
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
  const totalMonthly = discountedRent + discountedFurniture;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cream, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: petrol, padding: "20px 32px" }}>
        <h1 style={{ color: white, margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "0.03em" }}>
          VILLAGEWORKS
        </h1>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        {/* Already signed banner */}
        {signed && (
          <div style={{
            background: "#eafaf1", border: `1px solid ${green}`, borderRadius: 12,
            padding: "20px 24px", marginBottom: 24, textAlign: "center",
          }}>
            <h2 style={{ color: green, margin: "0 0 8px", fontSize: 20 }}>
              ✓ Contract Signed
            </h2>
            <p style={{ color: textDark, margin: 0, fontSize: 14 }}>
              {contract.signed_by_name
                ? `Signed by ${contract.signed_by_name} on ${new Date(contract.signed_at || "").toLocaleDateString("fi-FI")}`
                : `This contract has been signed. Thank you!`}
            </p>
          </div>
        )}

        {clientAwaitingCounterSign ? (
          <div
            style={{
              maxWidth: 600,
              margin: "40px auto",
              padding: 48,
              textAlign: "center",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: petrol,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 28,
                fontWeight: 400,
                color: "#1a1a1a",
                margin: "0 0 12px",
              }}
            >
              Your Signature Has Been Received
            </h2>
            <p style={{ fontSize: 16, color: "#666", lineHeight: 1.6, margin: "0 0 24px" }}>
              Thank you for signing! Your contract is now awaiting a counter-signature from VillageWorks. You&apos;ll receive a confirmation email
              once the contract is fully executed.
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 20px",
                backgroundColor: "#FFF8E7",
                borderRadius: 8,
                fontSize: 14,
                color: "#8B6914",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Awaiting counter-signature
            </div>
            <p style={{ fontSize: 13, color: "#999", marginTop: 32 }}>
              If you have any questions, contact us at{" "}
              <a href="mailto:info@villageworks.com" style={{ color: petrol }}>
                info@villageworks.com
              </a>
            </p>
          </div>
        ) : (
          <>
        {/* Contract document */}
        <div style={{
          background: white, borderRadius: 16, border: `1px solid ${border}`,
          overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}>
          {/* Document header */}
          <div style={{ padding: "32px 40px", borderBottom: `1px solid ${border}` }}>
            <p style={{ fontSize: 12, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
              VILLAGEWORKS
            </p>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 28, fontWeight: 400, color: textDark, margin: "0 0 8px" }}>
              {contract.title || "Contract"}
            </h1>
            <p style={{ fontSize: 14, color: textMuted, margin: 0 }}>
              Prepared for: <strong style={{ color: textDark }}>{contract.customer_name || "—"}</strong>
              {contract.customer_company ? ` · ${contract.customer_company}` : ""}
              {companyName ? ` · ${companyName}` : ""}
            </p>
            <p style={{ fontSize: 12, color: textMuted, margin: "4px 0 0" }}>
              Date: {new Date(contract.signed_at || contract.start_date || "").toLocaleDateString("fi-FI") || "—"}
            </p>
          </div>

          {/* Intro */}
          {contract.intro_text && (
            <div style={{ padding: "24px 40px" }}>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: textDark, whiteSpace: "pre-wrap", margin: 0 }}>
                {contract.intro_text}
              </p>
            </div>
          )}

          {/* Details table */}
          <div style={{ padding: "0 40px 24px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {property && (
                  <tr style={{ background: "#f9f1e5" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Property</td>
                    <td style={{ padding: "10px 14px", color: textDark }}>
                      {property.name}{property.address ? `, ${property.address}` : ""}{property.city ? `, ${property.city}` : ""}
                    </td>
                  </tr>
                )}
                {contract.space_details && (
                  <tr>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Space</td>
                    <td style={{ padding: "10px 14px", color: textDark }}>{contract.space_details}</td>
                  </tr>
                )}
                {contract.monthly_price && (
                  <tr style={{ background: "#f9f1e5" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Monthly rent</td>
                    <td style={{ padding: "10px 14px", color: textDark }}>
                      {spaceDiscount > 0 ? (
                        <>
                          <span style={{ textDecoration: "line-through", opacity: 0.5, fontSize: 12 }}>€{baseRent.toLocaleString("en-IE")}</span>{" "}
                          €{discountedRent.toLocaleString("en-IE")}/month excl. VAT
                        </>
                      ) : (
                        `€${baseRent.toLocaleString("en-IE")}/month excl. VAT`
                      )}
                    </td>
                  </tr>
                )}
                {spaceDiscount > 0 && (
                  <tr style={{ background: "#dcfce7" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500, color: "#166534", fontSize: 13 }}>↳ Promo discount</td>
                    <td style={{ padding: "10px 14px", color: "#166534", fontWeight: 600, fontSize: 13 }}>
                      {contract.promo_description} (−€{spaceDiscount.toLocaleString("en-IE")}/month)
                    </td>
                  </tr>
                )}
                {contract.furniture_included && (
                  <>
                    <tr>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Furniture</td>
                      <td style={{ padding: "10px 14px", color: textDark }}>{contract.furniture_description || "Included"}</td>
                    </tr>
                    {contract.furniture_monthly_price && (
                      <tr style={{ background: "#f9f1e5" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Furniture rent</td>
                        <td style={{ padding: "10px 14px", color: textDark }}>
                          {furnitureDiscount > 0 ? (
                            <>
                              <span style={{ textDecoration: "line-through", opacity: 0.5, fontSize: 12 }}>€{furnitureRent.toLocaleString("en-IE")}</span>{" "}
                              €{discountedFurniture.toLocaleString("en-IE")}/month excl. VAT
                            </>
                          ) : (
                            `€${furnitureRent.toLocaleString("en-IE")}/month excl. VAT`
                          )}
                        </td>
                      </tr>
                    )}
                    {furnitureDiscount > 0 && (
                      <tr style={{ background: "#dcfce7" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 500, color: "#166534", fontSize: 13 }}>↳ Promo discount</td>
                        <td style={{ padding: "10px 14px", color: "#166534", fontWeight: 600, fontSize: 13 }}>
                          {contract.promo_description} (−€{furnitureDiscount.toLocaleString("en-IE")}/month)
                        </td>
                      </tr>
                    )}
                  </>
                )}
                {totalMonthly > 0 && (
                  <tr style={{ background: petrol }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: white }}>Total monthly</td>
                    <td style={{ padding: "10px 14px", color: white, fontWeight: 600 }}>€{totalMonthly.toLocaleString("en-IE")}/month excl. VAT</td>
                  </tr>
                )}
                {contract.contract_length_months && (
                  <tr>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Contract length</td>
                    <td style={{ padding: "10px 14px", color: textDark }}>{contract.contract_length_months} months</td>
                  </tr>
                )}
                {contract.start_date && (
                  <tr style={{ background: "#f9f1e5" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: textDark }}>Start date</td>
                    <td style={{ padding: "10px 14px", color: textDark }}>{new Date(contract.start_date).toLocaleDateString("fi-FI")}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {contract.pricing_notes && (
              <p style={{ fontSize: 13, color: textMuted, marginTop: 8 }}>{contract.pricing_notes}</p>
            )}
          </div>

          {/* Contract body */}
          {contract.contract_body && (
            <div style={{ padding: "0 40px 24px" }}>
              <div style={{
                background: "#f9f8f5", borderRadius: 8, padding: "20px 24px",
                fontSize: 14, lineHeight: 1.7, color: textDark, whiteSpace: "pre-wrap",
              }}>
                {contract.contract_body}
              </div>
            </div>
          )}

          {/* Terms */}
          {contract.terms_text && (
            <div style={{ padding: "0 40px 32px" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: textDark, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Terms & Conditions
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: textDark, whiteSpace: "pre-wrap", margin: 0 }}>
                {contract.terms_text}
              </p>
              {(contract.deposit_amount != null || (contract.deposit_notes && contract.deposit_notes.trim())) && (
                <div style={{ marginTop: 16, padding: "14px 18px", background: "#f9f1e5", borderRadius: 8, border: "1px solid #e5e0da" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: textDark }}>
                    Deposit
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.6, color: textDark }}>
                    {contract.deposit_amount != null ? `€${Number(contract.deposit_amount).toLocaleString("en-IE")}` : ""}
                    {contract.deposit_amount != null && contract.deposit_notes?.trim() ? " — " : ""}
                    {contract.deposit_notes?.trim() || ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {contract.requires_counter_sign && (
            <div style={{ padding: "0 40px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div style={{ padding: 20, border: `1px solid ${border}`, borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: textMuted, margin: "0 0 8px", textTransform: "uppercase" }}>Client Signature</p>
                {contract.signed_at ? (
                  <>
                    <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, color: petrol, margin: "0 0 4px", fontStyle: "italic" }}>
                      {contract.signed_by_name}
                    </p>
                    <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
                      Signed: {new Date(contract.signed_at).toLocaleDateString("fi-FI")}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 14, color: textMuted, fontStyle: "italic" }}>Awaiting signature</p>
                )}
              </div>
              <div style={{ padding: 20, border: `1px solid ${border}`, borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: textMuted, margin: "0 0 8px", textTransform: "uppercase" }}>VillageWorks Representative</p>
                {contract.counter_signed_at ? (
                  <>
                    <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, color: "#2563eb", margin: "0 0 4px", fontStyle: "italic" }}>
                      {contract.counter_signed_by_name}
                    </p>
                    <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
                      Signed: {new Date(contract.counter_signed_at).toLocaleDateString("fi-FI")}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 14, color: textMuted, fontStyle: "italic" }}>Awaiting counter-signature</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Signing section */}
        {!signed &&
          !isCounterSigner &&
          contract.signing_method === "esign" && (
          <div style={{
            background: white, borderRadius: 16, border: `1px solid ${border}`,
            padding: "32px 40px", marginTop: 24,
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}>
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: textDark, margin: "0 0 8px" }}>
              Sign this contract
            </h2>
            <p style={{ fontSize: 14, color: textMuted, margin: "0 0 24px" }}>
              By signing below, you agree to all terms and conditions outlined in this contract.
            </p>

            {/* Name input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: textDark, display: "block", marginBottom: 6 }}>
                Full legal name *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                style={{
                  width: "100%", padding: "12px 16px", fontSize: 16,
                  border: `1px solid ${border}`, borderRadius: 8,
                  outline: "none", boxSizing: "border-box",
                  fontFamily: "'Instrument Serif', Georgia, serif",
                }}
              />
            </div>

            {/* Signature preview */}
            {signerName.trim() && (
              <div style={{
                background: "#f9f8f5", border: `1px dashed ${border}`, borderRadius: 8,
                padding: "24px 32px", marginBottom: 20, textAlign: "center",
              }}>
                <p style={{ fontSize: 11, color: textMuted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Signature preview
                </p>
                <p style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: 32, color: petrol, margin: 0, fontStyle: "italic",
                }}>
                  {signerName.trim()}
                </p>
              </div>
            )}

            {/* Agreement checkbox */}
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
              marginBottom: 24, fontSize: 14, color: textDark, lineHeight: 1.5,
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ accentColor: petrol, marginTop: 3, width: 18, height: 18 }}
              />
              <span>
                I, <strong>{signerName.trim() || "___"}</strong>, confirm that I have read and agree to all terms and conditions in this contract.
                I understand this constitutes a legally binding electronic signature.
              </span>
            </label>

            {signError && (
              <div style={{
                background: "#fdf0ee", border: `1px solid ${red}`, borderRadius: 8,
                padding: "10px 14px", marginBottom: 16, fontSize: 13, color: red,
              }}>
                {signError}
              </div>
            )}

            <button
              onClick={handleSign}
              disabled={signing || !signerName.trim() || !agreed}
              style={{
                width: "100%", padding: "14px 24px",
                background: !signerName.trim() || !agreed ? border : petrol,
                color: white, border: "none", borderRadius: 10,
                fontSize: 16, fontWeight: 600, cursor: !signerName.trim() || !agreed ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {signing ? "Signing..." : "✍ Sign Contract"}
            </button>

            <p style={{ fontSize: 12, color: textMuted, textAlign: "center", marginTop: 12 }}>
              Your IP address and timestamp will be recorded for verification purposes.
            </p>
          </div>
        )}

        {isCounterSigner && !contract.counter_signed_at && contract.requires_counter_sign && (
          <div
            style={{
              background: white,
              borderRadius: 16,
              border: `1px solid ${border}`,
              padding: "32px 40px",
              marginTop: 24,
              boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: textDark, margin: "0 0 8px" }}>
              Counter-sign this contract
            </h2>
            <p style={{ fontSize: 14, color: textMuted, margin: "0 0 24px" }}>
              As the VillageWorks representative, please review and counter-sign this contract.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: textDark, display: "block", marginBottom: 6 }}>
                Your full name *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: 16,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "'Instrument Serif', Georgia, serif",
                }}
              />
            </div>
            {signerName.trim() && (
              <div
                style={{
                  background: "#f0f9f4",
                  border: "1px dashed #d1e7dd",
                  borderRadius: 8,
                  padding: "24px 32px",
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 11, color: textMuted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Counter-signature preview
                </p>
                <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 32, color: "#2563eb", margin: 0, fontStyle: "italic" }}>
                  {signerName.trim()}
                </p>
                <p style={{ fontSize: 11, color: textMuted, margin: "8px 0 0" }}>VillageWorks Representative</p>
              </div>
            )}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                marginBottom: 24,
                fontSize: 14,
                color: textDark,
                lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ accentColor: "#2563eb", marginTop: 3, width: 18, height: 18 }}
              />
              <span>
                I, <strong>{signerName.trim() || "___"}</strong>, confirm that I am authorized to sign this contract on behalf of VillageWorks Finland Oy.
              </span>
            </label>
            {signError && (
              <div
                style={{
                  background: "#fdf0ee",
                  border: `1px solid ${red}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontSize: 13,
                  color: red,
                }}
              >
                {signError}
              </div>
            )}
            <button
              onClick={handleSign}
              disabled={signing || !signerName.trim() || !agreed}
              style={{
                width: "100%",
                padding: "14px 24px",
                background: !signerName.trim() || !agreed ? border : "#2563eb",
                color: white,
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 600,
                cursor: !signerName.trim() || !agreed ? "not-allowed" : "pointer",
              }}
            >
              {signing ? "Signing..." : "✍ Counter-Sign Contract"}
            </button>
          </div>
        )}

          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "32px 0", color: textMuted, fontSize: 12 }}>
          <p>© {new Date().getFullYear()} VillageWorks Finland Oy · All rights reserved</p>
        </div>
      </div>
    </div>
  );
}
