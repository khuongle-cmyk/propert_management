"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: "todo" | "in_progress" | "done" | "skipped";
  priority: "urgent" | "high" | "medium" | "low";
  assigned_to_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  property_id: string | null;
};

const C = {
  darkGreen: "#21524F",
  darkGreenHover: "#1a4340",
  beige: "#F3DFC6",
  white: "#FFFFFF",
  offWhite: "#faf8f5",
  textPrimary: "#1a1a1a",
  textSecondary: "#5a5550",
  textMuted: "#8a8580",
  border: "#e5e0da",
  borderLight: "#f0ebe5",
  red: "#c0392b",
  yellow: "#d4a017",
  yellowLight: "#fef9e7",
  green: "#27ae60",
  greenLight: "#eafaf1",
} as const;

const F = {
  heading: "'Instrument Serif', Georgia, serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

const priorityColors: Record<Task["priority"], string> = {
  urgent: "#c0392b",
  high: "#d4a017",
  medium: "#2980b9",
  low: "#8a8580",
};

const categoryIcons: Record<string, string> = {
  access: "🔑",
  it: "💻",
  furniture: "🪑",
  admin: "📋",
  welcome: "👋",
  invoicing: "💰",
  portal: "🌐",
  orientation: "🏢",
  email: "📧",
  other: "📌",
};

const CATS = ["access", "it", "furniture", "admin", "welcome", "invoicing", "portal", "orientation", "email", "other"] as const;

function normalizeTaskRow(t: Task): Task {
  let priority: Task["priority"] = "medium";
  if (t.priority === "urgent" || t.priority === "high" || t.priority === "medium" || t.priority === "low") {
    priority = t.priority;
  }
  let status: Task["status"] = "todo";
  if (t.status === "todo" || t.status === "in_progress" || t.status === "done" || t.status === "skipped") {
    status = t.status;
  }
  return { ...t, priority, status };
}

export default function ClientTasksPage() {
  const params = useParams();
  const clientId = typeof params.id === "string" ? params.id : "";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [propertyName, setPropertyName] = useState<string>("");
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!clientId) return;
      setLoading(true);
      const supabase = getSupabaseClient();

      const { data: cu } = await supabase
        .from("customer_users")
        .select("first_name, last_name, customer_companies(name)")
        .eq("id", clientId)
        .maybeSingle();
      if (cu) {
        const emb = cu.customer_companies as { name: string | null } | { name: string | null }[] | null;
        const co = Array.isArray(emb) ? emb[0] : emb;
        setClientName(
          co?.name?.trim() ||
            [cu.first_name, cu.last_name].filter(Boolean).join(" ").trim() ||
            "Client",
        );
      } else {
        const { data: co2 } = await supabase.from("customer_companies").select("name").eq("id", clientId).maybeSingle();
        if (co2) setClientName((co2.name as string) || "Client");
      }

      const r = await fetch(`/api/tasks?view=all&clientId=${encodeURIComponent(clientId)}`);
      const j = (await r.json()) as { tasks?: Task[] };
      const loadedTasks = (j.tasks ?? []).map((row) => normalizeTaskRow(row as Task));
      setTasks(loadedTasks);

      const propId = loadedTasks.find((t) => t.property_id)?.property_id;
      if (propId) {
        const { data: prop } = await supabase.from("properties").select("name").eq("id", propId).maybeSingle();
        if (prop) setPropertyName(prop.name || "");
      }

      const userIds = [...new Set(loadedTasks.map((t) => t.assigned_to_user_id).filter(Boolean))] as string[];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, first_name, last_name, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const names: Record<string, string> = {};
          for (const p of profiles) {
            names[p.user_id] =
              p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
          }
          setMemberNames(names);
        }
      }

      setLoading(false);
    }
    void load();
  }, [clientId]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    return { total, done, inProgress, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((t) => t.status !== "done" && t.status !== "skipped" && t.due_date && t.due_date < today);
  }, [tasks]);

  async function toggleTask(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: newStatus, completed_at: newStatus === "done" ? new Date().toISOString() : null }
          : t,
      ),
    );
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const d = dateStr.includes("T") ? new Date(dateStr) : new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short", year: "numeric" });
  }

  if (loading) {
    return (
      <main style={{ backgroundColor: C.offWhite, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: F.body }}>
        <p style={{ color: C.textMuted, fontSize: 14 }}>Loading tasks...</p>
      </main>
    );
  }

  return (
    <main style={{ backgroundColor: C.offWhite, minHeight: "100vh", fontFamily: F.body, color: C.textPrimary, padding: "0 0 60px" }}>
      <div style={{ backgroundColor: C.darkGreen, color: C.white, padding: "32px 40px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#F3DFC6" />
            <text x="14" y="19" textAnchor="middle" fill="#21524F" fontSize="14" fontWeight="700" fontFamily="Georgia, serif">
              V
            </text>
          </svg>
          <span
            style={{
              fontFamily: F.body,
              fontSize: 12,
              fontWeight: 500,
              opacity: 0.7,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            VillageWorks
          </span>
        </div>
        <h1 style={{ margin: 0, fontFamily: F.heading, fontSize: 28, fontWeight: 400, lineHeight: 1.2 }}>
          {clientName || "Client"} — Onboarding
        </h1>
        {propertyName ? (
          <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.75, fontFamily: F.body }}>{propertyName}</p>
        ) : null}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
            <p
              style={{
                fontFamily: F.body,
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                margin: "0 0 4px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Total
            </p>
            <p style={{ fontFamily: F.heading, fontSize: 24, fontWeight: 400, color: C.darkGreen, margin: 0 }}>{progress.total}</p>
          </div>
          <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
            <p
              style={{
                fontFamily: F.body,
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                margin: "0 0 4px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Completed
            </p>
            <p style={{ fontFamily: F.heading, fontSize: 24, fontWeight: 400, color: C.green, margin: 0 }}>{progress.done}</p>
          </div>
          <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
            <p
              style={{
                fontFamily: F.body,
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                margin: "0 0 4px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              In progress
            </p>
            <p style={{ fontFamily: F.heading, fontSize: 24, fontWeight: 400, color: C.yellow, margin: 0 }}>{progress.inProgress}</p>
          </div>
          <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
            <p
              style={{
                fontFamily: F.body,
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                margin: "0 0 4px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Overdue
            </p>
            <p style={{ fontFamily: F.heading, fontSize: 24, fontWeight: 400, color: overdueTasks.length > 0 ? C.red : C.textMuted, margin: 0 }}>
              {overdueTasks.length}
            </p>
          </div>
        </div>

        <div style={{ backgroundColor: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: C.textPrimary }}>Overall progress</span>
            <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: C.darkGreen }}>{progress.pct}%</span>
          </div>
          <div style={{ height: 12, background: C.borderLight, borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${progress.pct}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${C.darkGreen}, #2a6b67)`,
                borderRadius: 999,
                transition: "width 0.5s ease",
              }}
            />
          </div>
          <p style={{ fontFamily: F.body, fontSize: 12, color: C.textMuted, margin: "8px 0 0" }}>
            {progress.done} of {progress.total} tasks completed
          </p>
        </div>

        {CATS.map((cat) => {
          const rows = tasks.filter((t) => t.category === cat);
          if (!rows.length) return null;
          const catDone = rows.filter((t) => t.status === "done").length;
          const catIcon = categoryIcons[cat] || "📌";
          const today = new Date().toISOString().slice(0, 10);

          return (
            <section
              key={cat}
              style={{
                backgroundColor: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                marginBottom: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  backgroundColor: C.beige,
                  padding: "12px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{catIcon}</span>
                  <span
                    style={{
                      fontFamily: F.body,
                      fontSize: 15,
                      fontWeight: 600,
                      color: C.textPrimary,
                      textTransform: "capitalize",
                    }}
                  >
                    {cat.replace("_", " ")}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: F.body,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.darkGreen,
                    backgroundColor: C.white,
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {catDone}/{rows.length}
                </span>
              </div>
              <div>
                {rows.map((t, idx) => {
                  const overdue = t.status !== "done" && t.status !== "skipped" && t.due_date && t.due_date < today;
                  const isDone = t.status === "done";
                  const isSkipped = t.status === "skipped";
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 20px",
                        borderBottom: idx < rows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                        backgroundColor: isDone ? "#fafdf8" : isSkipped ? "#fafafa" : "transparent",
                        transition: "background-color 0.15s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isDone) e.currentTarget.style.backgroundColor = C.offWhite;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isDone ? "#fafdf8" : isSkipped ? "#fafafa" : "transparent";
                      }}
                      onClick={() => void toggleTask(t)}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          flexShrink: 0,
                          border: isDone ? "none" : `2px solid ${C.border}`,
                          backgroundColor: isDone ? C.green : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                        }}
                      >
                        {isDone ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7l3 3 5-5" />
                          </svg>
                        ) : null}
                      </div>

                      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: priorityColors[t.priority || "medium"], flexShrink: 0 }} title={t.priority} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: F.body,
                            fontSize: 14,
                            fontWeight: 500,
                            color: isDone ? C.textMuted : C.textPrimary,
                            textDecoration: isDone ? "line-through" : "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.title}
                        </div>
                        {t.assigned_to_user_id && memberNames[t.assigned_to_user_id] ? (
                          <span style={{ fontFamily: F.body, fontSize: 11, color: C.textMuted }}>{memberNames[t.assigned_to_user_id]}</span>
                        ) : null}
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {isDone ? (
                          <span
                            style={{
                              fontFamily: F.body,
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.green,
                              backgroundColor: C.greenLight,
                              padding: "3px 10px",
                              borderRadius: 999,
                            }}
                          >
                            Done {t.completed_at ? formatDate(t.completed_at) : ""}
                          </span>
                        ) : isSkipped ? (
                          <span
                            style={{
                              fontFamily: F.body,
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.textMuted,
                              backgroundColor: C.borderLight,
                              padding: "3px 10px",
                              borderRadius: 999,
                            }}
                          >
                            Skipped
                          </span>
                        ) : (
                          <span
                            style={{
                              fontFamily: F.body,
                              fontSize: 11,
                              fontWeight: 600,
                              color: overdue ? C.red : C.textSecondary,
                              backgroundColor: overdue ? "#fde8e8" : C.borderLight,
                              padding: "3px 10px",
                              borderRadius: 999,
                            }}
                          >
                            {overdue ? "Overdue" : "Due"} {formatDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div style={{ textAlign: "center", marginTop: 32, padding: "20px 0", borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: F.body, fontSize: 12, color: C.textMuted, margin: 0 }}>VillageWorks Finland Oy — WorkspaceOS</p>
        </div>
      </div>
    </main>
  );
}
