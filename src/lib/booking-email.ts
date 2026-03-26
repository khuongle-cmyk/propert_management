import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBookingIcs } from "@/lib/calendar-ics";

export type BookingEmailKind = "created" | "approved" | "rejected";

type BookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  purpose: string | null;
  total_price: number | string | null;
  visitor_email: string | null;
  visitor_name: string | null;
  booker_type: string;
  booker_user_id: string | null;
  rejection_reason: string | null;
  bookable_spaces: { name: string } | { name: string }[] | null;
  properties: { name: string } | { name: string }[] | null;
};

function relName(rel: { name: string } | { name: string }[] | null | undefined): string | undefined {
  if (!rel) return undefined;
  if (Array.isArray(rel)) return rel[0]?.name;
  return rel.name;
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function formatWhen(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleString()} – ${e.toLocaleString()}`;
  } catch {
    return `${start} – ${end}`;
  }
}

async function loadBooking(
  client: SupabaseClient,
  bookingId: string
): Promise<{ booking: BookingRow; recipientEmail: string; recipientName: string } | null> {
  const { data: booking, error } = await client
    .from("bookings")
    .select(
      `
      id,
      start_at,
      end_at,
      status,
      purpose,
      total_price,
      visitor_email,
      visitor_name,
      booker_type,
      booker_user_id,
      rejection_reason,
      bookable_spaces ( name ),
      properties ( name )
    `
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) return null;

  let recipientEmail: string | null = null;
  let recipientName = "Guest";

  if (booking.booker_type === "visitor") {
    recipientEmail = booking.visitor_email;
    recipientName = booking.visitor_name ?? "Guest";
  } else if (booking.booker_user_id) {
    const { data: u, error: uErr } = await client
      .from("users")
      .select("email, display_name")
      .eq("id", booking.booker_user_id)
      .maybeSingle();
    if (!uErr && u) {
      recipientEmail = u.email;
      recipientName = u.display_name ?? u.email;
    }
  }

  if (!recipientEmail) return null;

  const row = booking as unknown as BookingRow;
  return { booking: row, recipientEmail, recipientName };
}

export async function sendBookingEmailNotification(params: {
  client: SupabaseClient;
  bookingId: string;
  kind: BookingEmailKind;
  rejectionReason?: string | null;
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: true, skipped: "RESEND_API_KEY not set" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Property bookings <onboarding@resend.dev>";

  const loaded = await loadBooking(params.client, params.bookingId);
  if (!loaded) {
    return { ok: false, error: "Booking not found or no recipient email" };
  }

  const { booking, recipientEmail, recipientName } = loaded;
  const spaceName = relName(booking.bookable_spaces) ?? "Space";
  const propertyName = relName(booking.properties) ?? "Property";
  const when = formatWhen(booking.start_at, booking.end_at);
  const price =
    booking.total_price === null || booking.total_price === undefined
      ? "—"
      : String(booking.total_price);

  const ics = buildBookingIcs({
    uid: `${booking.id}@property-pms.booking`,
    startAt: booking.start_at,
    endAt: booking.end_at,
    summary: `${spaceName} — ${propertyName}`,
    description: [
      booking.purpose ? `Purpose: ${booking.purpose}` : "",
      `Status: ${booking.status}`,
      `Total: ${price}`,
    ]
      .filter(Boolean)
      .join("\\n"),
    location: `${propertyName}`,
  });

  const baseLines = [
    `<p>Hi ${escapeHtml(recipientName)},</p>`,
    `<p><strong>${escapeHtml(spaceName)}</strong> at ${escapeHtml(propertyName)}</p>`,
    `<p><strong>When:</strong> ${escapeHtml(when)}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(booking.status)}</p>`,
    `<p><strong>Total:</strong> ${escapeHtml(price)}</p>`,
  ];

  let subject: string;
  let html: string;

  if (params.kind === "rejected") {
    subject = `Booking update: not approved — ${spaceName}`;
    const reason = params.rejectionReason ?? booking.rejection_reason ?? "";
    html = [
      ...baseLines,
      `<p>Your booking request could not be approved.</p>`,
      reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : "",
      `<p>If you have questions, please reply to this email.</p>`,
    ].join("");
    await resend.emails.send({
      from,
      to: recipientEmail,
      subject,
      html,
    });
    return { ok: true };
  }

  if (params.kind === "approved") {
    subject = `Booking confirmed — ${spaceName}`;
    html = [
      ...baseLines,
      `<p>Your booking has been <strong>confirmed</strong>.</p>`,
      `<p>We attached a calendar invite you can add to your calendar.</p>`,
    ].join("");
    await resend.emails.send({
      from,
      to: recipientEmail,
      subject,
      html,
      attachments: [{ filename: "booking.ics", content: Buffer.from(ics, "utf8") }],
    });
    return { ok: true };
  }

  // created
  const pendingNote =
    booking.status === "pending"
      ? "<p>Your request is <strong>pending approval</strong>. We will email you when it is confirmed.</p>"
      : "<p>Your booking is <strong>confirmed</strong>.</p>";

  subject =
    booking.status === "pending"
      ? `Booking received (pending) — ${spaceName}`
      : `Booking confirmed — ${spaceName}`;
  html = [...baseLines, pendingNote, `<p>A calendar invite is attached.</p>`].join("");

  await resend.emails.send({
    from,
    to: recipientEmail,
    subject,
    html,
    attachments: [{ filename: "booking.ics", content: Buffer.from(ics, "utf8") }],
  });

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
