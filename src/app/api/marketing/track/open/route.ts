import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const GIF =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** 1×1 tracking pixel — increments open_count (service role; no user session). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  if (!token) {
    return new NextResponse(Buffer.from(GIF, "base64"), {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
    });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: rec, error } = await supabase
      .from("marketing_email_recipients")
      .select("id, email_id, open_count, opened_at")
      .eq("tracking_token", token)
      .maybeSingle();

    if (!error && rec) {
      const r = rec as { id: string; email_id: string; open_count: number; opened_at: string | null };
      const now = new Date().toISOString();
      const firstOpen = !r.opened_at;
      await supabase
        .from("marketing_email_recipients")
        .update({
          open_count: (r.open_count ?? 0) + 1,
          opened_at: r.opened_at ?? now,
          status: "opened",
        })
        .eq("id", r.id);

      if (firstOpen) {
        const { data: em } = await supabase.from("marketing_emails").select("open_count").eq("id", r.email_id).maybeSingle();
        const oc = Number((em as { open_count: number } | null)?.open_count ?? 0);
        await supabase.from("marketing_emails").update({ open_count: oc + 1 }).eq("id", r.email_id);
      }
    }
  } catch {
    /* missing service key — still return pixel */
  }

  return new NextResponse(Buffer.from(GIF, "base64"), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}
