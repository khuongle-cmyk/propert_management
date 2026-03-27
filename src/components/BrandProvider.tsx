"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_BRAND } from "@/lib/brand/default";
import type { BrandSettings } from "@/lib/brand/types";

type BrandContextValue = {
  brand: BrandSettings;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandContext = createContext<BrandContextValue>({
  brand: DEFAULT_BRAND,
  loading: true,
  refresh: async () => {},
});

function applyCssVariables(brand: BrandSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", brand.primary_color);
  root.style.setProperty("--brand-secondary", brand.secondary_color);
  root.style.setProperty("--brand-sidebar", brand.sidebar_color);
  root.style.setProperty("--brand-background", brand.background_color);
  root.style.setProperty("--brand-text", brand.text_color);
  root.style.setProperty("--brand-accent", brand.accent_color);
  root.style.setProperty("--brand-logo", brand.logo_url ?? "");
}

export default function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  async function loadBrand() {
    try {
      const r = await fetch("/api/brand/current", { cache: "no-store" });
      const j = (await r.json()) as { brand?: BrandSettings };
      if (r.ok && j.brand) setBrand(j.brand);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBrand();
  }, []);

  useEffect(() => {
    applyCssVariables(brand);
  }, [brand]);

  const value = useMemo<BrandContextValue>(
    () => ({
      brand,
      loading,
      refresh: loadBrand,
    }),
    [brand, loading],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  return useContext(BrandContext);
}

