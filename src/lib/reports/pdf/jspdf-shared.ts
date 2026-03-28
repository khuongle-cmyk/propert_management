import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";

export function eurPdf(n: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits,
  }).format(n);
}

/** Try brand logo, then VillageWorks default PNG (no Chromium). */
export async function resolveLogoDataUrl(primaryUrl: string | null | undefined): Promise<{
  dataUrl: string;
  format: "PNG" | "JPEG" | "WEBP";
} | null> {
  const candidates = [primaryUrl, VILLAGEWORKS_BRAND.logoPetrol].filter(Boolean) as string[];
  for (const url of candidates) {
    const img = await fetchImageDataUrl(url);
    if (img) return img;
  }
  return null;
}

async function fetchImageDataUrl(url: string): Promise<{
  dataUrl: string;
  format: "PNG" | "JPEG" | "WEBP";
} | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const b64 = buf.toString("base64");
    const ct = (res.headers.get("content-type") ?? "image/png").toLowerCase();
    let format: "PNG" | "JPEG" | "WEBP" = "PNG";
    if (ct.includes("jpeg") || ct.includes("jpg")) format = "JPEG";
    else if (ct.includes("webp")) format = "WEBP";
    else if (ct.includes("png")) format = "PNG";
    return { dataUrl: `data:${ct};base64,${b64}`, format };
  } catch {
    return null;
  }
}
