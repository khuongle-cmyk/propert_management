"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  property_id: string;
  name: string;
  floor_number: number;
  status: string;
  updated_at: string;
  property_name: string | null;
  room_count: number;
};

export default function FloorPlansListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterPropertyId = searchParams.get("propertyId")?.trim() ?? "";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const q = filterPropertyId ? `?propertyId=${encodeURIComponent(filterPropertyId)}` : "";
    const res = await fetch(`/api/floor-plans${q}`);
    const json = (await res.json()) as { floorPlans?: Row[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      setRows([]);
      return;
    }
    setRows(json.floorPlans ?? []);
  }, [filterPropertyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onDuplicate(id: string) {
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
    const json = (await res.json()) as { id?: string; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Duplicate failed");
      return;
    }
    if (json.id) router.push(`/floor-plans/${encodeURIComponent(json.id)}/edit`);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this floor plan?")) return;
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setError(json.error ?? "Delete failed");
    else await load();
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard" style={{ fontSize: 14 }}>
          ← Dashboard
        </Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Floor plans</h1>
        <Link
          href={filterPropertyId ? `/floor-plans/new?propertyId=${encodeURIComponent(filterPropertyId)}` : "/floor-plans/new"}
          style={{
            padding: "10px 18px",
            background: "#1a4a4a",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          New floor plan
        </Link>
      </div>

      {filterPropertyId ? (
        <p style={{ color: "#555", marginTop: 0 }}>
          Filtered by property.{" "}
          <Link href="/floor-plans" style={{ color: "#1a4a4a" }}>
            Show all
          </Link>
        </p>
      ) : null}

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "#666" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#666" }}>No floor plans yet. Create one to start drawing.</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={{ padding: 12 }}>Property</th>
                <th style={{ padding: 12 }}>Floor</th>
                <th style={{ padding: 12 }}>Name</th>
                <th style={{ padding: 12 }}>Rooms</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Updated</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>{r.property_name ?? "—"}</td>
                  <td style={{ padding: 12 }}>{r.floor_number}</td>
                  <td style={{ padding: 12 }}>{r.name}</td>
                  <td style={{ padding: 12 }}>{r.room_count}</td>
                  <td style={{ padding: 12 }}>{r.status}</td>
                  <td style={{ padding: 12, color: "#555" }}>{new Date(r.updated_at).toLocaleString()}</td>
                  <td style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Link href={`/floor-plans/${r.id}/edit`} style={{ color: "#1a4a4a" }}>
                      Edit
                    </Link>
                    <Link href={`/floor-plans/${r.id}/view`} style={{ color: "#1a4a4a" }}>
                      View
                    </Link>
                    <button type="button" style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }} onClick={() => onDuplicate(r.id)}>
                      Duplicate
                    </button>
                    <button type="button" style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", padding: 0 }} onClick={() => onDelete(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
