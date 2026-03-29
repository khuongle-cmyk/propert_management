/** Wrap <a href="..."> in HTML with click-tracking URLs (per-recipient token). */
export function wrapEmailLinksForTracking(html: string, baseUrl: string, trackingToken: string): string {
  const encT = encodeURIComponent(trackingToken);
  return html.replace(/href\s*=\s*["']([^"']+)["']/gi, (full, rawUrl: string) => {
    const url = String(rawUrl).trim();
    const lower = url.toLowerCase();
    if (lower.startsWith("mailto:") || lower.startsWith("#") || lower.includes("/api/marketing/unsubscribe")) {
      return full;
    }
    if (lower.includes("/api/marketing/track/click")) return full;
    try {
      const u = new URL(url, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return full;
    } catch {
      return full;
    }
    const track = `${baseUrl.replace(/\/$/, "")}/api/marketing/track/click?t=${encT}&u=${encodeURIComponent(url)}`;
    return `href="${track}"`;
  });
}
