'use client';

import { useState, useEffect, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const OfferEditor = dynamic(() => import('@/components/OfferEditor'), { ssr: false });
const ContractEditor = dynamic(() => import('@/components/ContractEditor'), { ssr: false }) as ComponentType<{
  leadId?: string | null;
  contractId?: string | null;
  initialData?: Record<string, unknown>;
  onSaved?: () => void;
  onContractSigned?: () => void;
  onDeleted?: () => void;
}>;

interface EditLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  onSave: () => void;
  onDelete?: () => void;
}

export default function EditLeadModal({ isOpen, onClose, leadId, onSave, onDelete }: EditLeadModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [agents, setAgents] = useState<{ id: string; display: string }[]>([]);
  const [showOfferEditor, setShowOfferEditor] = useState(false);
  const [showContractEditor, setShowContractEditor] = useState(false);
  const [showAcceptedNotice, setShowAcceptedNotice] = useState(false);
  const [showSignedNotice, setShowSignedNotice] = useState(false);
  const [existingOfferId, setExistingOfferId] = useState<string | null>(null);
  const [existingContractId, setExistingContractId] = useState<string | null>(null);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    company_name: '',
    y_tunnus: '',
    vat_number: '',
    company_type: '',
    industry: '',
    company_size: '',
    website: '',
    contact_first_name: '',
    contact_last_name: '',
    email: '',
    phone: '',
    contact_title: '',
    contact_phone_direct: '',
    billing_address: '',
    billing_postal_code: '',
    billing_city: '',
    billing_email: '',
    e_invoice_address: '',
    e_invoice_operator: '',
    e_invoice_operator_code: '',
    stage: 'new',
    source: '',
    notes: '',
    interested_space_type: '',
    approx_size_m2: '',
    budget_eur_month: '',
    preferred_move_in_date: '',
    next_action: '',
    next_action_date: '',
    pipeline_owner: '',
    assigned_agent_user_id: '',
  });

  useEffect(() => {
    if (leadId && isOpen) {
      fetchLead();
      fetchAgents();
      setShowDeleteConfirm(false);
    }
  }, [leadId, isOpen]);

  const fetchAgents = async () => {
    // cross-user read: relies on Membership read same tenant RLS policy + super_admin override
    const { data: members } = await supabase.from('memberships').select('user_id, role');
    if (!members) return;
    const userIds = [...new Set(members.map(m => m.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, first_name, last_name, email')
      .in('user_id', userIds);
    if (profiles) {
      setAgents(profiles.map(p => ({
        id: p.user_id,
        display: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || p.user_id.slice(0, 8),
      })).sort((a, b) => a.display.localeCompare(b.display)));
    }
  };

  const fetchLead = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_companies")
        .select(
          `
          *,
          contacts:customer_users!company_id (
            id, first_name, last_name, email, phone, title, direct_phone, is_primary_contact
          )
        `,
        )
        .eq("id", leadId)
        .single();
      if (error) throw error;
      if (data) {
        const contacts = (data.contacts ?? []) as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          direct_phone: string | null;
          is_primary_contact: boolean | null;
        }>;
        const primary = contacts.find((u) => u.is_primary_contact) || contacts[0];
        setPrimaryContactId(primary?.id ?? null);
        const yt = String(data.y_tunnus ?? "").trim();
        const vatPref = /^FI/i.test(yt) ? yt.toUpperCase() : "";
        setFormData({
          company_name: (data.name as string) || "",
          y_tunnus: vatPref ? "" : yt,
          vat_number: vatPref,
          company_type: data.company_type || "",
          industry: data.industry || "",
          company_size: data.company_size || "",
          website: data.website || "",
          contact_first_name: primary?.first_name || "",
          contact_last_name: primary?.last_name || "",
          email: (primary?.email || data.email || "") as string,
          phone: (primary?.phone || data.phone || "") as string,
          contact_title: primary?.title || "",
          contact_phone_direct: primary?.direct_phone || "",
          billing_address: data.billing_address || "",
          billing_postal_code: data.billing_postal_code || "",
          billing_city: data.billing_city || "",
          billing_email: data.billing_email || "",
          e_invoice_address: (data as { einvoice_address?: string | null }).einvoice_address || "",
          e_invoice_operator: (data as { einvoice_operator?: string | null }).einvoice_operator || "",
          e_invoice_operator_code: (data as { einvoice_operator_code?: string | null }).einvoice_operator_code || "",
          stage: data.stage || "new",
          source: data.source || "",
          notes: data.notes || "",
          interested_space_type: data.interested_space_type || "",
          approx_size_m2: data.approx_size_m2 ? String(data.approx_size_m2) : "",
          budget_eur_month: data.budget_eur_month ? String(data.budget_eur_month) : "",
          preferred_move_in_date: data.preferred_move_in_date || "",
          next_action: data.next_action || "",
          next_action_date: data.next_action_date || "",
          pipeline_owner: data.pipeline_owner || "",
          assigned_agent_user_id: data.assigned_agent_user_id || "",
        });
      }
    } catch (err) {
      console.error("Error fetching lead:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const vatOrYt = (formData.vat_number || formData.y_tunnus || "").trim();
      const yTunnusFinal = vatOrYt ? vatOrYt.toUpperCase() : null;
      const companyUpdate: Record<string, unknown> = {
        name: formData.company_name,
        y_tunnus: yTunnusFinal,
        company_type: formData.company_type || null,
        industry: formData.industry || null,
        company_size: formData.company_size || null,
        website: formData.website || null,
        email: formData.email || null,
        phone: formData.phone || null,
        billing_address: formData.billing_address || null,
        billing_postal_code: formData.billing_postal_code || null,
        billing_city: formData.billing_city || null,
        billing_email: formData.billing_email || null,
        einvoice_address: formData.e_invoice_address || null,
        einvoice_operator: formData.e_invoice_operator || null,
        einvoice_operator_code: formData.e_invoice_operator_code || null,
        stage: formData.stage,
        source: formData.source || null,
        notes: formData.notes || null,
        interested_space_type: formData.interested_space_type.trim() || null,
        approx_size_m2: formData.approx_size_m2 ? Number(formData.approx_size_m2) : null,
        budget_eur_month: formData.budget_eur_month ? Number(formData.budget_eur_month) : null,
        preferred_move_in_date: formData.preferred_move_in_date || null,
        next_action: formData.next_action || null,
        next_action_date: formData.next_action_date || null,
        pipeline_owner: formData.pipeline_owner || null,
        assigned_agent_user_id: formData.assigned_agent_user_id || null,
        updated_at: new Date().toISOString(),
      };
      const { error: coErr } = await supabase.from("customer_companies").update(companyUpdate).eq("id", leadId);
      if (coErr) throw coErr;

      const contactPayload = {
        first_name: formData.contact_first_name,
        last_name: formData.contact_last_name || "—",
        email: (formData.email || "").trim().toLowerCase() || null,
        phone: formData.phone || null,
        title: formData.contact_title || null,
        direct_phone: formData.contact_phone_direct || null,
      };
      if (primaryContactId) {
        const { error: uErr } = await supabase.from("customer_users").update(contactPayload).eq("id", primaryContactId);
        if (uErr) throw uErr;
      } else {
        const { error: insErr } = await supabase.from("customer_users").insert({
          company_id: leadId,
          ...contactPayload,
          is_primary_contact: true,
          role: "company_admin",
          status: "invited",
        });
        if (insErr) throw insErr;
      }
      onSave();
      onClose();
    } catch (err) {
      console.error("Error updating lead:", JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!leadId) return;
    setDeleting(true);
    try {
      await supabase.from("customer_companies").update({
        won_room_id: null, won_proposal_id: null,
        assigned_agent_user_id: null, interested_property_id: null,
      }).eq('id', leadId);
      const { error } = await supabase.from("customer_companies").delete().eq('id', leadId);
      if (error) throw error;
      setShowDeleteConfirm(false);
      onDelete?.();
      onSave();
      onClose();
    } catch (err) {
      console.error('Error deleting lead:', JSON.stringify(err, null, 2));
    } finally {
      setDeleting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  const colors = {
    petrolGreen: '#21524F', petrolDark: '#1a4340', petrolLight: '#e8f0ee',
    cream: '#faf8f5', creamDark: '#f0ece6', beige: '#F3DFC6',
    warmGray: '#6b6560', warmGrayLight: '#9a9590',
    textPrimary: '#2c2825', textSecondary: '#6b6560',
    white: '#ffffff', red: '#c0392b', redLight: '#fdf0ee',
    border: '#e5e0da', borderFocus: '#21524F', overlay: 'rgba(0,0,0,0.4)',
  };
  const fonts = { heading: "'Instrument Serif', Georgia, serif", body: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

  const sectionTitleStyle: React.CSSProperties = {
    fontFamily: fonts.heading, fontSize: '18px', fontWeight: 400,
    color: colors.petrolGreen, marginBottom: '16px', paddingBottom: '8px',
    borderBottom: `1px solid ${colors.border}`,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: fonts.body, fontSize: '13px', fontWeight: 500,
    color: colors.textSecondary, marginBottom: '4px', display: 'block',
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: fonts.body, fontSize: '14px', color: colors.textPrimary,
    backgroundColor: colors.white, border: `1px solid ${colors.border}`,
    borderRadius: '8px', padding: '10px 14px', width: '100%',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box',
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6560' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: '36px',
  };

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = colors.borderFocus;
    e.target.style.boxShadow = `0 0 0 3px ${colors.petrolLight}`;
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = colors.border;
    e.target.style.boxShadow = 'none';
  };

  const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' };
  const gridThree: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: colors.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px',
    }} onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={{
        backgroundColor: colors.cream, borderRadius: '16px', width: '100%',
        maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.08)', overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '28px 32px 20px', borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px',
        }}>
          <div>
            <h2 style={{ fontFamily: fonts.heading, fontSize: '26px', fontWeight: 400, color: colors.textPrimary, margin: 0, lineHeight: 1.2 }}>
              Edit Lead
            </h2>
            <p style={{ fontFamily: fonts.body, fontSize: '13px', color: colors.warmGrayLight, margin: '6px 0 0', lineHeight: 1.4 }}>
              Update lead details. Y-tunnus and e-invoice fields support Finnish invoicing (Finvoice).
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: colors.warmGrayLight, borderRadius: '6px',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colors.warmGrayLight)}
            aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '60px 0', fontFamily: fonts.body, fontSize: '14px', color: colors.warmGrayLight,
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ marginRight: '10px', animation: 'spin 1s linear infinite' }}>
                <circle cx="10" cy="10" r="8" stroke={colors.petrolGreen} strokeWidth="2" fill="none" strokeDasharray="36 14" />
              </svg>
              Loading lead details...
            </div>
          ) : (
            <>
              <h3 style={sectionTitleStyle}>1. Company Information</h3>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>
                  Company name <span style={{ color: colors.red, marginLeft: '3px' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name || ''}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Y-tunnus</label>
                  <input
                    type="text"
                    value={formData.y_tunnus || ''}
                    onChange={(e) => handleChange('y_tunnus', e.target.value)}
                    placeholder="1234567-8"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>VAT number (ALV-numero)</label>
                  <input
                    type="text"
                    value={formData.vat_number || ''}
                    onChange={(e) => handleChange('vat_number', e.target.value)}
                    placeholder="FI12345678"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Company type</label>
                  <select
                    value={formData.company_type || ''}
                    onChange={(e) => handleChange('company_type', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="oy">Oy (Ltd)</option>
                    <option value="oyj">Oyj (Plc)</option>
                    <option value="tmi">Tmi (Sole trader)</option>
                    <option value="ky">Ky (Partnership)</option>
                    <option value="ay">Ay (General partnership)</option>
                    <option value="osk">Osk (Cooperative)</option>
                    <option value="ry">Ry (Association)</option>
                    <option value="saatio">Säätiö (Foundation)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Industry</label>
                  <select
                    value={formData.industry || ''}
                    onChange={(e) => handleChange('industry', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="technology">Technology</option>
                    <option value="finance">Finance & Banking</option>
                    <option value="consulting">Consulting</option>
                    <option value="legal">Legal</option>
                    <option value="marketing">Marketing & Media</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education</option>
                    <option value="retail">Retail & E-commerce</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="nonprofit">Non-profit</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Company size</label>
                  <select
                    value={formData.company_size || ''}
                    onChange={(e) => handleChange('company_size', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="1-10">1–10 employees</option>
                    <option value="11-50">11–50 employees</option>
                    <option value="51-200">51–200 employees</option>
                    <option value="200+">200+ employees</option>
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Website</label>
                  <input
                    type="text"
                    value={formData.website || ''}
                    onChange={(e) => handleChange('website', e.target.value)}
                    placeholder="https://"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <h3 style={{ ...sectionTitleStyle, marginTop: '28px' }}>2. Contact Person</h3>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>
                    First name <span style={{ color: colors.red, marginLeft: '3px' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.contact_first_name || ''}
                    onChange={(e) => handleChange('contact_first_name', e.target.value)}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>
                    Last name <span style={{ color: colors.red, marginLeft: '3px' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.contact_last_name || ''}
                    onChange={(e) => handleChange('contact_last_name', e.target.value)}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="name@company.com"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="+358"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Title / Role</label>
                  <input
                    type="text"
                    value={formData.contact_title || ''}
                    onChange={(e) => handleChange('contact_title', e.target.value)}
                    placeholder="e.g. CEO, Office Manager"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Direct phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone_direct || ''}
                    onChange={(e) => handleChange('contact_phone_direct', e.target.value)}
                    placeholder="+358"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <h3 style={{ ...sectionTitleStyle, marginTop: '28px' }}>3. Billing Address</h3>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Street address</label>
                <input
                  type="text"
                  value={formData.billing_address || ''}
                  onChange={(e) => handleChange('billing_address', e.target.value)}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
              <div style={gridThree}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Postal code</label>
                  <input
                    type="text"
                    value={formData.billing_postal_code || ''}
                    onChange={(e) => handleChange('billing_postal_code', e.target.value)}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>City</label>
                  <input
                    type="text"
                    value={formData.billing_city || ''}
                    onChange={(e) => handleChange('billing_city', e.target.value)}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Billing email</label>
                  <input
                    type="email"
                    value={formData.billing_email || ''}
                    onChange={(e) => handleChange('billing_email', e.target.value)}
                    placeholder="billing@company.com"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <h3 style={{ ...sectionTitleStyle, marginTop: '28px' }}>4. E-Invoicing (Finvoice)</h3>
              <div style={gridThree}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>E-invoice address</label>
                  <input
                    type="text"
                    value={formData.e_invoice_address || ''}
                    onChange={(e) => handleChange('e_invoice_address', e.target.value)}
                    placeholder="003712345678"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Operator name</label>
                  <input
                    type="text"
                    value={formData.e_invoice_operator || ''}
                    onChange={(e) => handleChange('e_invoice_operator', e.target.value)}
                    placeholder="e.g. Basware"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Operator code</label>
                  <input
                    type="text"
                    value={formData.e_invoice_operator_code || ''}
                    onChange={(e) => handleChange('e_invoice_operator_code', e.target.value)}
                    placeholder="e.g. BAWCFI22"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <h3 style={{ ...sectionTitleStyle, marginTop: '28px' }}>5. Space Interest</h3>
              <div style={gridThree}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Space type</label>
                  <select
                    value={formData.interested_space_type || ''}
                    onChange={(e) => handleChange('interested_space_type', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="office">Office</option>
                    <option value="meeting_room">Meeting Room</option>
                    <option value="venue">Venue</option>
                    <option value="hot_desk">Coworking / Hot Desk</option>
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Approx. size (m²)</label>
                  <input
                    type="number"
                    value={formData.approx_size_m2 || ''}
                    onChange={(e) => handleChange('approx_size_m2', e.target.value)}
                    placeholder="e.g. 50"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Budget (€/month)</label>
                  <input
                    type="number"
                    value={formData.budget_eur_month || ''}
                    onChange={(e) => handleChange('budget_eur_month', e.target.value)}
                    placeholder="e.g. 2000"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Preferred move-in date</label>
                  <input
                    type="date"
                    value={formData.preferred_move_in_date || ''}
                    onChange={(e) => handleChange('preferred_move_in_date', e.target.value)}
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Pipeline owner</label>
                  <input
                    type="text"
                    value={formData.pipeline_owner || ''}
                    onChange={(e) => handleChange('pipeline_owner', e.target.value)}
                    placeholder="e.g. platform"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <h3 style={{ ...sectionTitleStyle, marginTop: '28px' }}>6. Lead Status & Assignment</h3>
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Stage</label>
                  <select
                    value={formData.stage || ''}
                    onChange={(e) => handleChange('stage', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="viewing">Viewing</option>
                    <option value="offer">Offer</option>
                    <option value="contract">Contract</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Source</label>
                  <select
                    value={formData.source || ''}
                    onChange={(e) => handleChange('source', e.target.value)}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">— Select —</option>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="tour">Office Tour</option>
                    <option value="cold_call">Cold Call</option>
                    <option value="event">Event</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="partner">Partner</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Assigned agent */}
              <div style={gridTwo}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Assigned to</label>
                  <select value={formData.assigned_agent_user_id}
                    onChange={(e) => handleChange('assigned_agent_user_id', e.target.value)}
                    style={selectStyle} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Unassigned —</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.display}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Next action</label>
                  <input
                    type="text"
                    value={formData.next_action || ''}
                    onChange={(e) => handleChange('next_action', e.target.value)}
                    placeholder="e.g. Send proposal, Schedule tour"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Next action date</label>
                <input
                  type="date"
                  value={formData.next_action_date || ''}
                  onChange={(e) => handleChange('next_action_date', e.target.value)}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Internal notes about this lead..."
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }}
                  onFocus={onFocus as any} onBlur={onBlur as any} />
              </div>

              {/* Delete */}
              <div style={{
                marginTop: '32px', padding: '16px 20px',
                backgroundColor: colors.redLight, borderRadius: '10px', border: '1px solid #f0d0cc',
              }}>
                {!showDeleteConfirm ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontFamily: fonts.body, fontSize: '14px', fontWeight: 600, color: colors.red, margin: 0 }}>Danger zone</p>
                      <p style={{ fontFamily: fonts.body, fontSize: '12px', color: colors.warmGray, margin: '2px 0 0' }}>
                        Permanently delete this lead and all associated data.
                      </p>
                    </div>
                    <button onClick={() => setShowDeleteConfirm(true)} style={{
                      fontFamily: fonts.body, fontSize: '13px', fontWeight: 500,
                      color: colors.red, backgroundColor: 'transparent',
                      border: `1px solid ${colors.red}`, borderRadius: '8px',
                      padding: '9px 18px', cursor: 'pointer', transition: 'background-color 0.2s, color 0.2s',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.red; e.currentTarget.style.color = colors.white; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.red; }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M2 3.5h10M5.5 6v4M8.5 6v4M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8M5 3.5V2a1 1 0 011-1h2a1 1 0 011 1v1.5" />
                        </svg>
                        Delete lead
                      </span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontFamily: fonts.body, fontSize: '14px', fontWeight: 600, color: colors.red, margin: '0 0 4px' }}>Are you sure?</p>
                    <p style={{ fontFamily: fonts.body, fontSize: '12px', color: colors.warmGray, margin: '0 0 12px' }}>
                      This action cannot be undone. The lead &quot;{formData.company_name || 'Unnamed'}&quot; will be permanently removed.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={handleDelete} disabled={deleting} style={{
                        fontFamily: fonts.body, fontSize: '13px', fontWeight: 500,
                        color: colors.white, backgroundColor: colors.red,
                        border: `1px solid ${colors.red}`, borderRadius: '8px',
                        padding: '9px 18px', cursor: 'pointer', opacity: deleting ? 0.6 : 1,
                      }}>{deleting ? 'Deleting...' : 'Yes, delete permanently'}</button>
                      <button onClick={() => setShowDeleteConfirm(false)} style={{
                        fontFamily: fonts.body, fontSize: '14px', fontWeight: 500,
                        color: colors.textSecondary, backgroundColor: 'transparent',
                        border: `1px solid ${colors.border}`, borderRadius: '8px',
                        padding: '10px 20px', cursor: 'pointer',
                      }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 32px', borderTop: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', gap: '12px',
          backgroundColor: colors.creamDark,
        }}>
          {formData.stage === 'offer' && leadId && (
            <button
              type="button"
              onClick={async () => {
                const { data: existingOffer } = await supabase
                  .from('offers')
                  .select('id')
                  .eq('lead_id', leadId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                setExistingOfferId(existingOffer?.id || null);
                setShowOfferEditor(true);
              }}
              style={{
                fontFamily: fonts.body,
                fontSize: '14px',
                fontWeight: 600,
                color: colors.white,
                backgroundColor: '#b45309',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: 'auto',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M7 1h6v6M13 1L6 8M5 3H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V9" />
              </svg>
              Open Offer Editor
            </button>
          )}
          {formData.stage === 'contract' && leadId && (
            <button
              type="button"
              onClick={async () => {
                const { data: existingContract } = await supabase
                  .from('contracts')
                  .select('id')
                  .eq('lead_id', leadId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                setExistingContractId(existingContract?.id || null);
                setShowContractEditor(true);
              }}
              style={{
                fontFamily: fonts.body,
                fontSize: '14px',
                fontWeight: 600,
                color: colors.white,
                backgroundColor: '#0f766e',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: 'auto',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 1H3a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5L8 1z" />
                <path d="M8 1v4h4M6 7h2M6 9h4" />
              </svg>
              Open Contract Editor
            </button>
          )}
          {formData.stage === 'won' && leadId && (
            <button
              type="button"
              onClick={async () => {
                const { data: contract } = await supabase
                  .from('contracts')
                  .select('public_token')
                  .eq('lead_id', leadId)
                  .in('status', ['signed_digital', 'signed_paper', 'active'])
                  .order('signed_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (contract?.public_token) {
                  window.open(`/contracts/${contract.public_token}`, '_blank');
                } else {
                  alert('No signed contract found for this lead.');
                }
              }}
              style={{
                fontFamily: fonts.body,
                fontSize: '14px',
                fontWeight: 600,
                color: colors.white,
                backgroundColor: '#27ae60',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: 'auto',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 1H3a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5L8 1z" />
                <path d="M8 1v4h4" />
              </svg>
              View Signed Contract
            </button>
          )}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginLeft: (formData.stage === 'offer' || formData.stage === 'contract' || formData.stage === 'won') && leadId ? undefined : 'auto',
          }}>
            <button onClick={onClose} style={{
              fontFamily: fonts.body, fontSize: '14px', fontWeight: 500,
              color: colors.textSecondary, backgroundColor: 'transparent',
              border: `1px solid ${colors.border}`, borderRadius: '8px',
              padding: '10px 20px', cursor: 'pointer',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.white; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >Cancel</button>
            <button onClick={handleSave} disabled={loading} style={{
              fontFamily: fonts.body, fontSize: '14px', fontWeight: 600,
              color: colors.white, backgroundColor: colors.petrolGreen,
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              cursor: 'pointer', transition: 'background-color 0.2s', opacity: loading ? 0.6 : 1,
            }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = colors.petrolDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.petrolGreen; }}
            >{loading ? 'Saving...' : 'Save changes'}</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {showOfferEditor && leadId && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            overflow: 'auto',
          }}
        >
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '40px 20px',
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '1100px',
              padding: '24px',
              position: 'relative',
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowOfferEditor(false);
                  setShowAcceptedNotice(false);
                }}
                style={{
                  position: 'absolute', top: '16px', right: '16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '20px', color: '#8a8580', zIndex: 10,
                  padding: '4px 8px', borderRadius: '6px',
                }}
              >✕</button>
              <OfferEditor
                leadId={leadId}
                offerId={existingOfferId}
                initialData={{
                  companyId: leadId,
                  customerName: [formData.contact_first_name, formData.contact_last_name].filter(Boolean).join(' ') || '',
                  customerEmail: formData.email || '',
                  customerPhone: formData.phone || '',
                  customerCompany: formData.company_name || '',
                  propertyId: null,
                }}
                onSaved={() => {
                  // Refresh offer ID in case a new one was created
                  supabase
                    .from('offers')
                    .select('id')
                    .eq('lead_id', leadId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                    .then(({ data }) => {
                      if (data) setExistingOfferId(data.id);
                    });
                }}
                onOfferAccepted={async () => {
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  setShowAcceptedNotice(true);
                }}
                onCancel={() => {
                  setShowOfferEditor(false);
                  setShowAcceptedNotice(false);
                }}
              />
            </div>
          </div>
          {showAcceptedNotice && (
            <div style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{
                backgroundColor: '#faf8f5',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: '#eafaf1', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 16px',
                }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 14l6 6L22 8" />
                  </svg>
                </div>
                <h3 style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '22px', fontWeight: 400, color: '#2c2825',
                  margin: '0 0 8px',
                }}>Offer Accepted</h3>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px', color: '#6b6560', lineHeight: 1.5,
                  margin: '0 0 24px',
                }}>
                  The offer has been accepted and the lead has been moved to the <strong style={{ color: '#21524F' }}>Contract</strong> stage.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAcceptedNotice(false);
                    setShowOfferEditor(false);
                    onSave();
                    onClose();
                  }}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px', fontWeight: 600, color: '#fff',
                    backgroundColor: '#21524F', border: 'none',
                    borderRadius: '10px', padding: '12px 32px',
                    cursor: 'pointer', transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a4340'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#21524F'; }}
                >
                  Close & Return to Pipeline
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showContractEditor && leadId && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            overflow: 'auto',
          }}
        >
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '40px 20px',
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '1100px',
              padding: '24px',
              position: 'relative',
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowContractEditor(false);
                  setShowSignedNotice(false);
                }}
                style={{
                  position: 'absolute', top: '16px', right: '16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '20px', color: '#8a8580', zIndex: 10,
                  padding: '4px 8px', borderRadius: '6px',
                }}
              >✕</button>
              <ContractEditor
                leadId={leadId}
                contractId={existingContractId}
                initialData={{
                  companyId: leadId,
                  customerName: [formData.contact_first_name, formData.contact_last_name].filter(Boolean).join(' ') || '',
                  customerEmail: formData.email || '',
                  customerPhone: formData.phone || '',
                  customerCompany: formData.company_name || '',
                }}
                onSaved={() => {
                  supabase
                    .from('contracts')
                    .select('id')
                    .eq('lead_id', leadId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                    .then(({ data }) => {
                      if (data) setExistingContractId(data.id);
                    });
                }}
                onContractSigned={() => {
                  setShowSignedNotice(true);
                }}
                onDeleted={() => {
                  setShowContractEditor(false);
                  setExistingContractId(null);
                }}
              />
            </div>
          </div>
          {showSignedNotice && (
            <div style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{
                backgroundColor: '#faf8f5',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: '#eafaf1', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 16px',
                }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 14l6 6L22 8" />
                  </svg>
                </div>
                <h3 style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '22px', fontWeight: 400, color: '#2c2825',
                  margin: '0 0 8px',
                }}>Contract Signed</h3>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px', color: '#6b6560', lineHeight: 1.5,
                  margin: '0 0 24px',
                }}>
                  The contract has been signed and the lead has been moved to the <strong style={{ color: '#27ae60' }}>Won</strong> stage. Onboarding tasks have been created.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignedNotice(false);
                    setShowContractEditor(false);
                    onSave();
                    onClose();
                  }}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px', fontWeight: 600, color: '#fff',
                    backgroundColor: '#21524F', border: 'none',
                    borderRadius: '10px', padding: '12px 32px',
                    cursor: 'pointer', transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a4340'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#21524F'; }}
                >
                  Close & Return to Pipeline
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}