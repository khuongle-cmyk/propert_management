export type BrandPlan = "starter" | "professional" | "enterprise";

export type BrandSettings = {
  id?: string;
  tenant_id?: string | null;
  brand_name: string;
  custom_domain: string | null;
  logo_url: string | null;
  logo_white_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  sidebar_color: string;
  text_color: string;
  accent_color: string;
  font_family: string | null;
  login_page_headline: string | null;
  login_page_subheadline: string | null;
  login_page_background_image_url: string | null;
  email_sender_name: string | null;
  email_sender_address: string | null;
  email_footer_text: string | null;
  email_logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_url: string | null;
  hide_powered_by: boolean;
  powered_by_text: string;
  is_active: boolean;
};

export const BRAND_HEX_RE = /^#[0-9a-fA-F]{6}$/;

