import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  const rawU = url.searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(rawU);
  } catch {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  if (token) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: rec } = await supabase
        .from("marketing_email_recipients")
        .select("id, email_id, click_count, clicked_at")
        .eq("tracking_token", token)
        .maybeSingle();
      if (rec) {
        const r = rec as { id: string; email_id: string; click_count: number; clicked_at: string | null };
        const now = new Date().toISOString();
        const first = !r.clicked_at;
        await supabase
          .from("marketing_email_recipients")
          .update({
            click_count: (r.click_count ?? 0) + 1,
            clicked_at: r.clicked_at ?? now,
            status: "clicked",
          })
          .eq("id", r.id);
        if (first) {
          const { data: em } = await supabase.from("marketing_emails").select("click_count").eq("id", r.email_id).maybeSingle();
          const cc = Number((em as { click_count: number } | null)?.click_count ?? 0);
          await supabase.from("marketing_emails").update({ click_count: cc + 1 }).eq("id", r.email_id);
        }
      }
    } catch {
      /* missing service key */
    }
  }

  return NextResponse.redirect(target.toString(), 302);
}
