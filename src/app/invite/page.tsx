"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/browser";

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(raw);
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function refreshFromAuth() {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userErr) {
        setError(userErr.message);
        setHasSession(false);
        setEmail(null);
        setLoading(false);
        return;
      }
      if (user?.email) {
        const qpEmail =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? null
            : null;
        const hashEmail = parseHashParams().get("email")?.trim().toLowerCase() ?? null;
        const hint = qpEmail ?? hashEmail;
        if (hint && hint !== user.email.toLowerCase()) {
          setError("This invite link is for a different email address than the signed-in account. Sign out and open the link again.");
          setHasSession(false);
          setEmail(null);
          setLoading(false);
          return;
        }
        setEmail(user.email);
        setHasSession(true);
      } else {
        setHasSession(false);
        setEmail(null);
      }
      setLoading(false);
    }

    void (async () => {
      // Parse hash-fragment tokens from the Supabase invite redirect.
      // @supabase/ssr 0.10.x does not auto-consume these, so we must call
      // setSession() explicitly. See: invite URL ends with #access_token=...&refresh_token=...
      if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        const hashParams = parseHashParams();
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: setSessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionErr) {
            setError(`Could not establish invite session: ${setSessionErr.message}`);
            setLoading(false);
            return;
          }
          // Clear tokens from URL so they don't stay in browser history
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
      await supabase.auth.getSession();
      await refreshFromAuth();
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void refreshFromAuth();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const passwordOk = useMemo(() => password.length >= 8, [password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!hasSession) {
      setError("Invite session not found. Please open the invite link from your email.");
      return;
    }
    if (!passwordOk) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      setSaving(false);
      setError(userErr?.message ?? "Could not verify your session.");
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setSaving(false);
      setError(updateErr.message);
      return;
    }

    const now = new Date().toISOString();
    const { error: actErr } = await supabase
      .from("customer_users")
      .update({ status: "active", activated_at: now, updated_at: now })
      .eq("auth_user_id", user.id)
      .eq("status", "invited");

    setSaving(false);

    if (actErr) {
      setError(
        `${actErr.message} If this persists, ensure database migration 01_customer_invite_hardening.sql has been applied.`,
      );
      return;
    }

    setMessage("Password set. Redirecting…");
    setTimeout(() => router.replace("/portal"), 900);
  }

  if (loading) return <p>Loading invite…</p>;

  return (
    <main style={{ maxWidth: 460, margin: "30px auto" }}>
      <h1 className="vw-admin-page-title" style={{ margin: "0 0 8px" }}>
        Set your password
      </h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        {email ? `Invited as ${email}.` : "Use your invite link to activate your account."}
      </p>

      {!hasSession ? (
        <p style={{ color: "#b00020" }}>
          Invite session not found. Please open the full invite link from your email.
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Set password and continue"}
          </button>
        </form>
      )}

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
      {message ? <p style={{ color: "#1b5e20" }}>{message}</p> : null}
    </main>
  );
}
