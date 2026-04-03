"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  furniture_included: boolean;
  furniture_description: string | null;
  furniture_monthly_price: number | null;
  pricing_notes: string | null;
};

type PropertyRow = { name: string | null; address: string | null; city: string | null } | null;

export default function ContractSignPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

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

  useEffect(() => {
    if (!token) return;
    fetch(`/api/contracts/${token}/sign`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setContract(data.contract);
          setProperty(data.property);
          setCompanyName(data.companyName);
          if (data.contract?.signed_at) setSigned(true);
          if (data.contract?.customer_name) setSignerName(data.contract.customer_name);
        }
      })
      .catch(() => setError("Failed to load contract"))
      .finally(() => setLoading(false));
  }, [token]);

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
          signatureData: JSON.stringify({
            method: "typed_name",
            name: signerName.trim(),
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
          }),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sign");
      setSigned(true);
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

  const totalMonthly = (contract.monthly_price || 0) + (contract.furniture_monthly_price || 0);

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
                    <td style={{ padding: "10px 14px", color: textDark }}>€{contract.monthly_price.toLocaleString()}/month excl. VAT</td>
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
                        <td style={{ padding: "10px 14px", color: textDark }}>€{contract.furniture_monthly_price.toLocaleString()}/month excl. VAT</td>
                      </tr>
                    )}
                  </>
                )}
                {totalMonthly > 0 && contract.furniture_included && (
                  <tr style={{ background: petrol }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: white }}>Total monthly</td>
                    <td style={{ padding: "10px 14px", color: white, fontWeight: 600 }}>€{totalMonthly.toLocaleString()}/month excl. VAT</td>
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
            </div>
          )}
        </div>

        {/* Signing section */}
        {!signed && contract.signing_method === "esign" && (
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

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "32px 0", color: textMuted, fontSize: 12 }}>
          <p>© {new Date().getFullYear()} VillageWorks Finland Oy · All rights reserved</p>
        </div>
      </div>
    </div>
  );
}