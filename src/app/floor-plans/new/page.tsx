"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";

type PropertyRow = { id: string; name: string | null };

export default function NewFloorPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preProperty = searchParams.get("propertyId")?.trim() ?? "";

  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [propertyId, setPropertyId] = useState(preProperty);
  const [name, setName] = useState("");
  const [floorNumber, setFloorNumber] = useState(1);
  const [widthM, setWidthM] = useState(20);
  const [heightM, setHeightM] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: mems } = await supabase.from("memberships").select("tenant_id");
      const tenantIds = [...new Set((mems ?? []).map((m) => m.tenant_id).filter(Boolean))] as string[];
      if (!tenantIds.length) return;
      const { data: props } = await supabase.from("properties").select("id, name").in("tenant_id", tenantIds).order("name");
      if (!cancelled) setProperties(props ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      setError("Select a property");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/floor-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          name: name.trim() || "Untitled floor plan",
          floorNumber,
          widthMeters: widthM,
          heightMeters: heightM,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Create failed");
        return;
      }
      if (json.id) router.push(`/floor-plans/${json.id}/edit`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px" }}>
      <Link href="/floor-plans" style={{ fontSize: 14 }}>
        ← Floor plans
      </Link>
      <h1 style={{ marginTop: 16 }}>New floor plan</h1>
      <p style={{ color: "#555" }}>Choose property and dimensions. You can upload a background image in the editor.</p>

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 14, marginTop: 20 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Property</span>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="">Select…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.id}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Erottaja2 — Floor 1" style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Floor number</span>
          <input
            type="number"
            value={floorNumber}
            onChange={(e) => setFloorNumber(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Width (meters)</span>
          <input type="number" min={1} step={0.1} value={widthM} onChange={(e) => setWidthM(Number(e.target.value))} style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Depth (meters)</span>
          <input type="number" min={1} step={0.1} value={heightM} onChange={(e) => setHeightM(Number(e.target.value))} style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "12px 18px",
            background: busy ? "#9ca3af" : "#1a4a4a",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Creating…" : "Open editor"}
        </button>
      </form>
    </main>
  );
}
