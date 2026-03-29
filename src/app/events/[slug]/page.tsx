"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";

type EventRow = {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  location: string | null;
  max_attendees: number | null;
  registration_required: boolean;
  registration_deadline: string | null;
  price: number;
  cover_image_url: string | null;
};

export default function PublicEventPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ev, setEv] = useState<EventRow | null>(null);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      const supabase = getSupabaseClient();
      const { data, error: qErr } = await supabase
        .from("marketing_events")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .eq("is_public", true)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      else if (!data) setError("Event not found.");
      else setEv(data as EventRow);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (!ev) return;
    const dl = ev.registration_deadline ? new Date(ev.registration_deadline).getTime() : null;
    if (dl != null && dl < Date.now()) {
      setError("Registration is closed.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = getSupabaseClient();
    const { error: insErr } = await supabase.from("marketing_event_registrations").insert({
      event_id: ev.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company.trim() || null,
      status: "registered",
    });
    setSubmitting(false);
    if (insErr) setError(insErr.message);
    else setDone(true);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "48px auto", padding: 24, fontFamily: "var(--font-dm-sans), sans-serif" }}>
        Loading…
      </div>
    );
  }

  if (!ev) {
    return (
      <div style={{ maxWidth: 640, margin: "48px auto", padding: 24, fontFamily: "var(--font-dm-sans), sans-serif" }}>
        <p>{error ?? "Not found."}</p>
      </div>
    );
  }

  const start = new Date(ev.start_datetime);
  const end = new Date(ev.end_datetime);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 64px",
        fontFamily: "var(--font-dm-sans), sans-serif",
        color: "var(--petrol, #1a4a4a)",
      }}
    >
      {ev.cover_image_url ? (
        <img src={ev.cover_image_url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 24 }} />
      ) : null}
      <h1 style={{ fontFamily: "var(--font-instrument-serif), serif", fontWeight: 400, fontSize: "2rem", margin: "0 0 12px" }}>
        {ev.name}
      </h1>
      <p style={{ opacity: 0.85, marginBottom: 8 }}>
        {start.toLocaleString()} — {end.toLocaleTimeString()}
      </p>
      {ev.location ? <p style={{ marginBottom: 16 }}>{ev.location}</p> : null}
      {ev.description ? (
        <p style={{ marginBottom: 24, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{ev.description}</p>
      ) : null}
      <p style={{ fontWeight: 600 }}>
        {Number(ev.price) > 0 ? `€${ev.price}` : "Free"}
      </p>

      {ev.registration_required === false ? (
        <p style={{ marginTop: 24 }}>No registration required.</p>
      ) : done ? (
        <p style={{ marginTop: 24, color: "#0d6b4d" }}>You are registered. See you there.</p>
      ) : (
        <form onSubmit={(e) => void onRegister(e)} style={{ marginTop: 28, display: "grid", gap: 12, maxWidth: 400 }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Register</h2>
          {error ? <p style={{ color: "#b42318", margin: 0 }}>{error}</p> : null}
          <input
            required
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(26,74,74,0.25)" }}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(26,74,74,0.25)" }}
          />
          <input
            placeholder="Company (optional)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(26,74,74,0.25)" }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--petrol, #1a4a4a)",
              color: "#fff",
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Submitting…" : "Register"}
          </button>
        </form>
      )}
    </div>
  );
}
