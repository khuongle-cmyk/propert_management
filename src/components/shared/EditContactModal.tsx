"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { LEAD_STAGE_LABEL, LEAD_STAGES, type LeadStage } from "@/lib/crm";
import { normalizeLeadSource } from "@/lib/crm/lead-import-parse";

const PETROL = "#21524F";
const BORDER = "#E8E4DD";
const TEXT = "#1A1A1A";
const TEXT_SECONDARY = "#6B6560";

const SOURCE_OPTIONS = ["Website", "Chatbot", "Referral", "Cold call", "Email campaign", "Walk-in", "Other"] as const;
const COMPANY_SIZE_OPTIONS = ["1-5", "6-10", "11-25", "26-50", "51-100", "100+"] as const;

export type EditContactModalContact = {
  leadId: string;
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  yTunnus: string | null;
  companySize: string | null;
  source: string | null;
  notes: string | null;
  stage: LeadStage | null;
};

export type EditContactModalProps = {
  isOpen: boolean;
  contact: EditContactModalContact | null;
  canEdit: boolean;
  onClose: () => void;
  /** After successful save (not archive). */
  onSaved: () => void;
  onArchive: (leadId: string) => Promise<void>;
  /** After successful archive/delete from modal; defaults to onSaved if omitted. */
  onArchived?: () => void;
};

function mapUiSourceToDbSource(ui: string): string {
  const raw: Record<string, string> = {
    Website: "website",
    Chatbot: "chatbot",
    Referral: "referral",
    "Cold call": "phone",
    "Email campaign": "email",
    "Walk-in": "other",
    Other: "other",
  };
  return normalizeLeadSource(raw[ui] ?? "other");
}

function mapDbSourceToUi(db: string | null | undefined): (typeof SOURCE_OPTIONS)[number] {
  const s = (db ?? "").toLowerCase().trim();
  const m: Record<string, (typeof SOURCE_OPTIONS)[number]> = {
    website: "Website",
    chatbot: "Chatbot",
    referral: "Referral",
    phone: "Cold call",
    email: "Email campaign",
    other: "Other",
    social_media: "Other",
  };
  return m[s] ?? "Other";
}

const modalInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "'DM Sans', sans-serif",
  color: TEXT,
  background: "#FFFFFF",
};
const modalLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: TEXT_SECONDARY,
  display: "block",
  marginBottom: 6,
  fontFamily: "'DM Sans', sans-serif",
};

function defaultForm(c: EditContactModalContact) {
  const rawSize = c.companySize?.trim();
  return {
    companyName: c.companyName,
    contactName: c.contactName,
    email: c.email ?? "",
    phone: c.phone ?? "",
    businessId: c.yTunnus ?? "",
    companySize: rawSize && rawSize.length > 0 ? rawSize : "1-5",
    source: mapDbSourceToUi(c.source),
    notes: c.notes ?? "",
    stage: (c.stage && LEAD_STAGES.includes(c.stage) ? c.stage : "new") as LeadStage,
  };
}

export default function EditContactModal({
  isOpen,
  contact,
  canEdit,
  onClose,
  onSaved,
  onArchive,
  onArchived,
}: EditContactModalProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [form, setForm] = useState(() =>
    contact
      ? defaultForm(contact)
      : {
          companyName: "",
          contactName: "",
          email: "",
          phone: "",
          businessId: "",
          companySize: "1-5",
          source: "Website" as (typeof SOURCE_OPTIONS)[number],
          notes: "",
          stage: "new" as LeadStage,
        },
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!isOpen || !contact) return;
    setForm(defaultForm(contact));
    setError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, contact]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contact?.leadId || !canEdit) return;

    const company = form.companyName.trim();
    const name = form.contactName.trim();
    const email = form.email.trim().toLowerCase();
    if (!company || !name || !email) {
      setError("Company name, contact name, and email are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      company_name: company,
      contact_person_name: name,
      email,
      phone: form.phone.trim() || null,
      business_id: form.businessId.trim() || null,
      company_size: form.companySize || null,
      source: mapUiSourceToDbSource(form.source),
      notes: form.notes.trim() || null,
      stage: form.stage,
    };

    const { error: upErr } = await supabase.from("leads").update(payload).eq("id", contact.leadId);
    if (upErr) {
      setError(upErr.message);
      setSubmitting(false);
      return;
    }

    onSaved();
    onClose();
    setSubmitting(false);
  }

  async function confirmArchive() {
    if (!contact?.leadId || !canEdit) return;
    setArchiving(true);
    setError(null);
    try {
      await onArchive(contact.leadId);
      setShowDeleteConfirm(false);
      onClose();
      if (onArchived) onArchived();
      else onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove contact.");
    } finally {
      setArchiving(false);
    }
  }

  if (!isOpen || !contact) return null;

  const companySizeUnknown =
    form.companySize && !(COMPANY_SIZE_OPTIONS as readonly string[]).includes(form.companySize);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
        fontFamily: "'DM Sans', sans-serif",
      }}
      onClick={() => {
        if (!submitting && !archiving && !showDeleteConfirm) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-contact-title"
        onClick={(ev) => ev.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 24,
          maxWidth: 560,
          width: "100%",
          maxHeight: "min(90vh, 900px)",
          overflowY: "auto",
          boxSizing: "border-box",
          border: `1px solid ${BORDER}`,
          boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
        }}
      >
        <h2
          id="edit-contact-title"
          style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: TEXT, fontFamily: "'DM Sans', sans-serif" }}
        >
          Edit contact
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.45 }}>
          Update contact and pipeline stage. This record is stored in the <code style={{ fontSize: 12 }}>leads</code> table.
        </p>
        <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 14 }}>
          <label style={modalLabel}>
            Company name *
            <input
              required
              disabled={!canEdit}
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            />
          </label>
          <label style={modalLabel}>
            Y-tunnus (business ID)
            <input
              type="text"
              disabled={!canEdit}
              value={form.businessId}
              onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))}
              placeholder="e.g. 1234567-8"
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            />
          </label>
          <label style={modalLabel}>
            Contact name *
            <input
              required
              disabled={!canEdit}
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            />
          </label>
          <label style={modalLabel}>
            Email *
            <input
              required
              type="email"
              disabled={!canEdit}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            />
          </label>
          <label style={modalLabel}>
            Phone
            <input
              disabled={!canEdit}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            />
          </label>
          <label style={modalLabel}>
            Pipeline stage
            <select
              disabled={!canEdit}
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as LeadStage }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label style={modalLabel}>
            Company size
            <select
              disabled={!canEdit}
              value={form.companySize}
              onChange={(e) => setForm((f) => ({ ...f, companySize: e.target.value }))}
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            >
              {companySizeUnknown ? <option value={form.companySize}>{form.companySize}</option> : null}
              {COMPANY_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={modalLabel}>
            Source
            <select
              disabled={!canEdit}
              value={form.source}
              onChange={(e) =>
                setForm((f) => ({ ...f, source: e.target.value as (typeof SOURCE_OPTIONS)[number] }))
              }
              style={{ ...modalInput, opacity: canEdit ? 1 : 0.7 }}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={modalLabel}>
            Notes
            <textarea
              disabled={!canEdit}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              style={{ ...modalInput, resize: "vertical", fontFamily: "inherit" }}
            />
          </label>

          {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              {canEdit ? (
                <button
                  type="button"
                  disabled={submitting || archiving}
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "1px solid #dc2626",
                    background: "#FFFFFF",
                    color: "#dc2626",
                    fontWeight: 600,
                    cursor: submitting || archiving ? "not-allowed" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Delete contact
                </button>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={submitting || archiving}
                onClick={() => onClose()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: "#FFFFFF",
                  color: TEXT,
                  fontWeight: 600,
                  cursor: submitting || archiving ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canEdit || submitting || archiving}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: PETROL,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: !canEdit || submitting || archiving ? "not-allowed" : "pointer",
                  opacity: !canEdit || submitting || archiving ? 0.6 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showDeleteConfirm ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => !archiving && setShowDeleteConfirm(false)}
        >
          <div
            role="dialog"
            style={{
              background: "#FFFFFF",
              borderRadius: 12,
              padding: 20,
              maxWidth: 400,
              width: "100%",
              border: `1px solid ${BORDER}`,
              fontFamily: "'DM Sans', sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: "0 0 12px", color: TEXT, fontSize: 15, fontWeight: 600 }}>Remove this contact?</p>
            <p style={{ margin: "0 0 16px", color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.45 }}>
              This archives the lead in the pipeline (same as Delete on the list). You can restore from Supabase if needed.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={archiving}
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: "#fff",
                  fontWeight: 600,
                  cursor: archiving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => void confirmArchive()}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #dc2626",
                  background: "#fff",
                  color: "#dc2626",
                  fontWeight: 600,
                  cursor: archiving ? "not-allowed" : "pointer",
                }}
              >
                {archiving ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
