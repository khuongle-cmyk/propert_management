"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        setError(error.message);
        return;
      }

      const { data: memberships } = await supabase.from("memberships").select("role");
      const roles = (memberships ?? []).map((m) => (m.role ?? "").toLowerCase());
      if (roles.includes("super_admin")) {
        router.push("/super-admin");
        return;
      }
      if (roles.includes("owner")) {
        router.push("/dashboard");
        return;
      }
      router.push("/bookings");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 12px" }}>Sign in</h1>
      <p style={{ marginTop: 0, marginBottom: 18, color: "#555" }}>
        Owners can view only their own properties.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        {error ? (
          <p style={{ margin: 0, color: "#b00020" }}>{error}</p>
        ) : (
          <div style={{ height: 18 }} />
        )}

        <button
          disabled={loading}
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#111",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

