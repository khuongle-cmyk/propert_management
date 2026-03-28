import { NextResponse } from "next/server";
import { CMS_TRANSLATION_TARGET_LOCALES } from "@/lib/cms2/marketing-locales";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  action?: "describe" | "hero_image" | "translate" | "faq";
  /** Single-locale hint (e.g. source locale for copy). */
  locale?: string;
  /** When action is "translate", optional explicit target list; defaults to all marketing locales (7). */
  locales?: string[];
  context?: string;
};

/**
 * AI hooks for CMS 2 (Claude / DALL·E). Wire ANTHROPIC_API_KEY and OPENAI_API_KEY when ready.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase.from("memberships").select("role").eq("user_id", user.id);
  const ok = (memberships ?? []).some((m) => ["owner", "manager", "super_admin"].includes((m.role ?? "").toLowerCase()));
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  if (action === "translate") {
    const locales =
      Array.isArray(body.locales) && body.locales.length > 0
        ? body.locales
        : (CMS_TRANSLATION_TARGET_LOCALES as readonly string[]).slice();
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: "ANTHROPIC_API_KEY not configured (Claude copy / translate / FAQ).",
          locales,
        },
        { status: 501 },
      );
    }
    return NextResponse.json(
      {
        error: "Not implemented yet",
        locales,
        note: "Translate all should fill settings.translations for: " + locales.join(", "),
      },
      { status: 501 },
    );
  }

  if (action === "hero_image") {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured (DALL·E hero image)." },
        { status: 501 },
      );
    }
    return NextResponse.json({ error: "Not implemented yet" }, { status: 501 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured (Claude copy / translate / FAQ)." },
      { status: 501 },
    );
  }

  return NextResponse.json({ error: "Not implemented yet" }, { status: 501 });
}
