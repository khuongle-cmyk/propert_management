import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";
import type { BrandSettings } from "@/lib/brand/types";

export const DEFAULT_BRAND: BrandSettings = {
  brand_name: "VillageWorks",
  custom_domain: null,
  logo_url: VILLAGEWORKS_BRAND.logoPetrol,
  logo_white_url: VILLAGEWORKS_BRAND.logoWhite,
  favicon_url: null,
  primary_color: VILLAGEWORKS_BRAND.colors.primary,
  secondary_color: VILLAGEWORKS_BRAND.colors.secondary,
  background_color: VILLAGEWORKS_BRAND.colors.background,
  sidebar_color: VILLAGEWORKS_BRAND.colors.sidebar,
  text_color: VILLAGEWORKS_BRAND.colors.text,
  accent_color: VILLAGEWORKS_BRAND.colors.accent,
  font_family: VILLAGEWORKS_BRAND.fontStack,
  login_page_headline: "Welcome to VillageWorks",
  login_page_subheadline: "Manage properties, rooms, bookings, CRM, and reporting in one platform.",
  login_page_background_image_url: null,
  email_sender_name: "VillageWorks",
  email_sender_address: null,
  email_footer_text: "VillageWorks",
  email_logo_url: VILLAGEWORKS_BRAND.logoPetrol,
  support_email: null,
  support_phone: null,
  support_url: null,
  hide_powered_by: false,
  powered_by_text: "Powered by VillageWorks",
  is_active: true,
};

