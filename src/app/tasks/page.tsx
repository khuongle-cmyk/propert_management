"use client";

import Link from "next/link";
import type { CSSProperties, FocusEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/date/format";
import { getSupabaseClient } from "@/lib/supabase/browser";

/** VillageWorks design tokens (aligned with Sales Pipeline). */
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
  overlay: "rgba(0,0,0,0.4)",
} as const;

const F = {
  heading: "'Instrument Serif', Georgia, serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

type Task = {
  id: string;
  tenant_id?: string | null;
  title: string;
  description: string | null;
  contact_id: string | null;
  property_id: string | null;
  room_id: string | null;
  category: string;
  status: "todo" | "in_progress" | "done" | "skipped";
  assigned_to_user_id: string | null;
  due_date: string | null;
  notes: string | null;
};

const onInputFocus = (e: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = C.darkGreen;
  e.target.style.boxShadow = "0 0 0 3px rgba(33, 82, 79, 0.15)";
};
const onInputBlur = (e: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = C.border;
  e.target.style.boxShadow = "none";
};

const inputBase: CSSProperties = {
  fontFamily: F.body,
  fontSize: 14,
  color: C.textPrimary,
  backgroundColor: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 14px",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  boxSizing: "border-box",
};

const selectBase: CSSProperties = {
  ...inputBase,
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235a5550' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: 36,
  cursor: "pointer",
};

const btnPrimary: CSSProperties = {
  fontFamily: F.body,
  fontSize: 14,
  fontWeight: 600,
  color: C.white,
  backgroundColor: C.darkGreen,
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  cursor: "pointer",
  transition: "background-color 0.2s",
};

const btnSecondary: CSSProperties = {
  fontFamily: F.body,
  fontSize: 14,
  fontWeight: 600,
  color: C.textPrimary,
  backgroundColor: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 18px",
  cursor: "pointer",
};

function statusBadgeStyle(s: Task["status"]): CSSProperties {
  const map: Record<Task["status"], { bg: string; fg: string }> = {
    todo: { bg: C.border, fg: C.textSecondary },
    in_progress: { bg: C.yellowLight, fg: C.yellow },
    done: { bg: C.greenLight, fg: C.green },
    skipped: { bg: C.borderLight, fg: C.textMuted },
  };
  return {
    fontFamily: F.body,
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 999,
    backgroundColor: map[s].bg,
    color: map[s].fg,
    display: "inline-block",
    textTransform: "capitalize" as const,
  };
}

function statusLabelPretty(s: Task["status"]): string {
  if (s === "in_progress") return "in progress";
  return s;
}

const categoryBadgeStyle: CSSProperties = {
  fontFamily: F.body,
  fontSize: 11,
  fontWeight: 600,
  color: C.darkGreen,
  backgroundColor: C.beige,
  borderRadius: 8,
  padding: "4px 10px",
  display: "inline-block",
  textTransform: "capitalize" as const,
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({ myTasksToday: 0, overdue: 0, dueThisWeek: 0, completedThisMonth: 0 });
  const [view, setView] = useState<"my" | "all">("my");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"list" | "board">("list");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [timeline, setTimeline] = useState<Array<{ id: string; type: string; created_at: string; actor_user_id: string | null; actor_name?: string | null; text: string }>>([]);
  const [members, setMembers] = useState<Array<{ user_id: string; role: string | null; name?: string; label: string }>>([]);
  const [allMemberNames, setAllMemberNames] = useState<Record<string, string>>({});
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [propertyNames, setPropertyNames] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState("");

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    category: "admin",
    status: "todo" as Task["status"],
    assigned_to_user_id: "",
    due_date: "",
    contact_id: "",
    property_id: "",
    notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; company_name: string }>>([]);
  const [assignableMembers, setAssignableMembers] = useState<
    Array<{ user_id: string; role: string | null; name?: string; label: string }>
  >([]);
  /** Per company section (property + contact): when true, task table is collapsed. */
  const [companyTasksCollapsed, setCompanyTasksCollapsed] = useState<Record<string, boolean>>({});

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (propertyFilter) {
      result = result.filter((t) => t.property_id === propertyFilter);
    }
    return result;
  }, [tasks, propertyFilter]);

  const groupedTasks = useMemo(() => {
    type CompanyGroup = { companyName: string; contactId: string; tasks: Task[] };
    type PropertyGroup = { propertyName: string; propertyId: string; companies: Record<string, CompanyGroup> };

    const properties: Record<string, PropertyGroup> = {};
    const ungrouped: Task[] = [];

    const rows = q.trim()
      ? filteredTasks.filter((t) =>
          `${t.title} ${t.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : filteredTasks;

    for (const task of rows) {
      const propId = task.property_id || "_no_property";
      const contactId = task.contact_id || "_no_company";
      const propName = task.property_id ? propertyNames[task.property_id] || "Unknown property" : "No property";
      const compName = task.contact_id ? companyNames[task.contact_id] || "Unknown company" : "General tasks";

      if (!task.property_id && !task.contact_id) {
        ungrouped.push(task);
        continue;
      }

      if (!properties[propId]) {
        properties[propId] = { propertyName: propName, propertyId: propId, companies: {} };
      }
      if (!properties[propId].companies[contactId]) {
        properties[propId].companies[contactId] = { companyName: compName, contactId, tasks: [] };
      }
      properties[propId].companies[contactId].tasks.push(task);
    }

    return { properties, ungrouped };
  }, [filteredTasks, companyNames, propertyNames, q]);

  const grouped = useMemo(() => {
    const out: Record<string, Task[]> = { todo: [], in_progress: [], done: [], skipped: [] };
    for (const t of filteredTasks) out[t.status].push(t);
    return out;
  }, [filteredTasks]);

  const sortedPropertyEntries = useMemo(
    () =>
      Object.entries(groupedTasks.properties).sort((a, b) =>
        a[1].propertyName.localeCompare(b[1].propertyName, undefined, { sensitivity: "base" }),
      ),
    [groupedTasks.properties],
  );

  const supabase = useMemo(() => getSupabaseClient(), []);

  async function load() {
    const params = new URLSearchParams();
    params.set("view", view);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    const r = await fetch(`/api/tasks?${params.toString()}`);
    const j = (await r.json()) as { tasks?: Task[]; stats?: typeof stats };
    if (r.ok) {
      const nextTasks = j.tasks ?? [];
      setTasks(nextTasks);
      setStats(j.stats ?? stats);
      const tenantIds = [...new Set(nextTasks.map((t) => String(t.tenant_id ?? "")).filter(Boolean))];
      if (tenantIds.length) {
        const rm = await fetch(`/api/tasks/members?tenantIds=${encodeURIComponent(tenantIds.join(","))}`);
        const jm = (await rm.json()) as { members?: Array<{ user_id: string; name?: string; label: string }> };
        if (rm.ok) {
          const map: Record<string, string> = {};
          for (const m of jm.members ?? []) map[m.user_id] = m.name ?? m.label;
          setAllMemberNames(map);
        }
      } else {
        setAllMemberNames({});
      }

      const contactIds = [...new Set(nextTasks.map((t) => t.contact_id).filter(Boolean))] as string[];
      if (contactIds.length) {
        const { data: leads } = await supabase.from("leads").select("id, company_name").in("id", contactIds);
        if (leads) {
          const names: Record<string, string> = {};
          for (const l of leads) names[l.id] = l.company_name || "Unknown";
          setCompanyNames(names);
        } else {
          setCompanyNames({});
        }
      } else {
        setCompanyNames({});
      }

      const propIds = [...new Set(nextTasks.map((t) => t.property_id).filter(Boolean))] as string[];
      if (propIds.length) {
        const { data: props } = await supabase.from("properties").select("id, name").in("id", propIds);
        if (props) {
          const names: Record<string, string> = {};
          for (const p of props) names[p.id] = p.name || "Unknown";
          setPropertyNames(names);
        } else {
          setPropertyNames({});
        }
      } else {
        setPropertyNames({});
      }
    }
  }
  useEffect(() => {
    void load();
  }, [view, status, category]);

  useEffect(() => {
    async function loadDropdowns() {
      const supabase = getSupabaseClient();
      const { data: props } = await supabase.from("properties").select("id, name").order("name");
      if (props) setProperties(props);
      const { data: leads } = await supabase
        .from("leads")
        .select("id, company_name")
        .eq("archived", false)
        .order("company_name");
      if (leads) setContacts(leads);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAssignableMembers([]);
        return;
      }
      const { data: mems } = await supabase.from("memberships").select("tenant_id").eq("user_id", user.id);
      const tenantIds = [...new Set((mems ?? []).map((m) => m.tenant_id).filter(Boolean))] as string[];
      if (!tenantIds.length) {
        setAssignableMembers([]);
        return;
      }
      const rm = await fetch(`/api/tasks/members?tenantIds=${encodeURIComponent(tenantIds.join(","))}`);
      const jm = (await rm.json()) as { members?: Array<{ user_id: string; role: string | null; name?: string; label: string }> };
      if (rm.ok) {
        const seen = new Set<string>();
        const uniq = (jm.members ?? []).filter((m) => {
          if (seen.has(m.user_id)) return false;
          seen.add(m.user_id);
          return true;
        });
        setAssignableMembers(uniq);
      } else {
        setAssignableMembers([]);
      }
    }
    void loadDropdowns();
  }, []);

  async function quickComplete(task: Task) {
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }),
    });
    await load();
  }

  async function openDetail(task: Task) {
    setOpenTask(task);
    const [ra, rm] = await Promise.all([
      fetch(`/api/tasks/activity?taskId=${encodeURIComponent(task.id)}`),
      fetch(`/api/tasks/members?taskId=${encodeURIComponent(task.id)}`),
    ]);
    const ja = (await ra.json()) as { timeline?: Array<{ id: string; type: string; created_at: string; actor_user_id: string | null; actor_name?: string | null; text: string }> };
    const jm = (await rm.json()) as { members?: Array<{ user_id: string; role: string | null; name?: string; label: string }> };
    if (ra.ok) setTimeline(ja.timeline ?? []);
    if (rm.ok) setMembers(jm.members ?? []);
  }

  async function addComment() {
    if (!openTask || !commentText.trim()) return;
    await fetch("/api/tasks/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: openTask.id, comment: commentText.trim() }),
    });
    setCommentText("");
    await openDetail(openTask);
  }

  async function updateTaskDetail(patch: Partial<Pick<Task, "assigned_to_user_id" | "due_date" | "status">>) {
    if (!openTask) return;
    await fetch(`/api/tasks/${openTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
    await openDetail({ ...openTask, ...patch } as Task);
  }

  async function handleCreateTask() {
    if (!newTask.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description || null,
          category: newTask.category,
          status: newTask.status,
          assigned_to_user_id: newTask.assigned_to_user_id || null,
          due_date: newTask.due_date || null,
          contact_id: newTask.contact_id || null,
          property_id: newTask.property_id || null,
          notes: newTask.notes || null,
        }),
      });
      if (res.ok) {
        setShowCreateTask(false);
        setNewTask({
          title: "",
          description: "",
          category: "admin",
          status: "todo",
          assigned_to_user_id: "",
          due_date: "",
          contact_id: "",
          property_id: "",
          notes: "",
        });
        await load();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Could not create task");
      }
    } catch (err) {
      console.error("Error creating task:", err);
    } finally {
      setCreating(false);
    }
  }

  const memberNameById = new Map(members.map((m) => [m.user_id, m.name ?? m.label]));

  const cellBase: CSSProperties = {
    padding: "12px 14px",
    borderBottom: `1px solid ${C.border}`,
    fontFamily: F.body,
    fontSize: 13,
    color: C.textPrimary,
  };

  function renderTaskRow(t: Task) {
    const overdue = t.status !== "done" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
    return (
      <tr
        key={t.id}
        style={{ transition: "background-color 0.15s ease" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = C.offWhite;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <td style={{ ...cellBase, width: 44 }}>
          <input
            type="checkbox"
            checked={t.status === "done"}
            onChange={() => void quickComplete(t)}
            style={{ width: 18, height: 18, accentColor: C.darkGreen, cursor: "pointer" }}
          />
        </td>
        <td style={cellBase}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.title}</div>
          {t.contact_id ? (
            <Link
              href={`/tasks/client/${encodeURIComponent(t.contact_id)}`}
              style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.darkGreen, textDecoration: "none" }}
            >
              Client view
            </Link>
          ) : null}
        </td>
        <td style={cellBase}>
          <span style={categoryBadgeStyle}>{t.category}</span>
        </td>
        <td style={{ ...cellBase, color: C.textSecondary }}>
          {t.assigned_to_user_id
            ? allMemberNames[t.assigned_to_user_id] ??
              memberNameById.get(t.assigned_to_user_id) ??
              `${t.assigned_to_user_id.slice(0, 8)}…`
            : "Unassigned"}
        </td>
        <td style={{ ...cellBase, color: overdue ? C.red : C.textPrimary, fontWeight: overdue ? 600 : 400 }}>{t.due_date ?? "—"}</td>
        <td style={cellBase}>
          <span style={statusBadgeStyle(t.status)}>{statusLabelPretty(t.status)}</span>
        </td>
        <td style={cellBase}>
          <button
            type="button"
            onClick={() => void openDetail(t)}
            style={{ ...btnSecondary, padding: "8px 14px", fontSize: 13 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = C.darkGreen;
              e.currentTarget.style.color = C.darkGreen;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = C.border;
              e.currentTarget.style.color = C.textPrimary;
            }}
          >
            Details
          </button>
        </td>
      </tr>
    );
  }

  const thStyle: CSSProperties = {
    textAlign: "left",
    padding: "12px 14px",
    borderBottom: `1px solid ${C.border}`,
    fontFamily: F.body,
    fontSize: 12,
    fontWeight: 600,
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    backgroundColor: C.beige,
  };

  const tableHead = (
    <thead>
      <tr>
        {["", "Task", "Category", "Assignee", "Due", "Status", "Actions"].map((h) => (
          <th key={h} style={thStyle}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  const boardStageLabel = (s: Task["status"]) =>
    ({ todo: "To do", in_progress: "In progress", done: "Done", skipped: "Skipped" } as const)[s];

  return (
    <main
      style={{
        backgroundColor: C.offWhite,
        minHeight: "100vh",
        fontFamily: F.body,
        color: C.textPrimary,
        boxSizing: "border-box",
        padding: "28px 28px 40px",
        display: "grid",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: F.heading,
            fontSize: 32,
            fontWeight: 400,
            color: C.textPrimary,
            lineHeight: 1.15,
          }}
        >
          Tasks
        </h1>
        <button
          type="button"
          onClick={() => setShowCreateTask(true)}
          style={{
            fontFamily: F.body,
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            backgroundColor: "#21524F",
            border: "none",
            borderRadius: 10,
            padding: "11px 22px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          + Add Task
        </button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, maxWidth: 960 }}>
        <Stat label="My tasks today" value={stats.myTasksToday} />
        <Stat label="Overdue" value={stats.overdue} danger />
        <Stat label="Due this week" value={stats.dueThisWeek} />
        <Stat label="Completed this month" value={stats.completedThisMonth} />
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "16px 0",
          borderBottom: "1px solid #e5e0da",
          marginBottom: 20,
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 300 }}>
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            stroke="#8a8580"
            strokeWidth={1.5}
            strokeLinecap="round"
            aria-hidden
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx={7} cy={7} r={5} />
            <line x1={11} y1={11} x2={14} y2={14} />
          </svg>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks or client..."
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: "#1a1a1a",
              backgroundColor: "#fff",
              border: "1px solid #e5e0da",
              borderRadius: 8,
              padding: "8px 12px 8px 36px",
              width: "100%",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={view}
          onChange={(e) => setView(e.target.value as "my" | "all")}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e0da",
            backgroundColor: "#fff",
            color: "#1a1a1a",
            outline: "none",
          }}
        >
          <option value="my">My tasks</option>
          <option value="all">All tasks</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e0da",
            backgroundColor: "#fff",
            color: "#1a1a1a",
            outline: "none",
          }}
        >
          <option value="">All status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e0da",
            backgroundColor: "#fff",
            color: "#1a1a1a",
            outline: "none",
          }}
        >
          <option value="">All category</option>
          <option value="access">Access</option>
          <option value="it">IT</option>
          <option value="furniture">Furniture</option>
          <option value="admin">Admin</option>
          <option value="welcome">Welcome</option>
          <option value="invoicing">Invoicing</option>
          <option value="portal">Portal</option>
          <option value="orientation">Orientation</option>
          <option value="email">Email</option>
        </select>

        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e0da",
            backgroundColor: "#fff",
            color: "#1a1a1a",
            outline: "none",
          }}
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            marginLeft: "auto",
            gap: 0,
            border: "1px solid #e5e0da",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("list")}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: mode === "list" ? 600 : 400,
              color: mode === "list" ? "#fff" : "#5a5550",
              backgroundColor: mode === "list" ? "#21524F" : "transparent",
              border: "none",
              padding: "7px 16px",
              cursor: "pointer",
            }}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setMode("board")}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: mode === "board" ? 600 : 400,
              color: mode === "board" ? "#fff" : "#5a5550",
              backgroundColor: mode === "board" ? "#21524F" : "transparent",
              border: "none",
              padding: "7px 16px",
              cursor: "pointer",
            }}
          >
            Board
          </button>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "#5a5550",
            backgroundColor: "transparent",
            border: "1px solid #e5e0da",
            borderRadius: 8,
            padding: "7px 16px",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {mode === "list" ? (
        <section style={{ display: "grid", gap: 16 }}>
          {sortedPropertyEntries.map(([propId, propGroup]) => {
            const allPropTasks = Object.values(propGroup.companies).flatMap((c) => c.tasks);
            const completedProp = allPropTasks.filter((t) => t.status === "done").length;
            const sortedCompanies = Object.entries(propGroup.companies).sort((a, b) =>
              a[1].companyName.localeCompare(b[1].companyName, undefined, { sensitivity: "base" }),
            );
            return (
              <div key={propId} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    backgroundColor: "#21524F",
                    color: "#fff",
                    padding: "12px 16px",
                    borderRadius: "10px 10px 0 0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontFamily: "'Instrument Serif', Georgia, serif",
                  }}
                >
                  <span style={{ fontSize: 24, fontWeight: 400 }}>{propGroup.propertyName}</span>
                  <span style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", opacity: 0.8 }}>
                    {completedProp}/{allPropTasks.length} completed
                  </span>
                </div>

                <div
                  style={{
                    border: "1px solid #e5e0da",
                    borderTop: "none",
                    borderRadius: "0 0 10px 10px",
                    overflow: "hidden",
                  }}
                >
                  {sortedCompanies.map(([contactId, compGroup]) => {
                    const completedComp = compGroup.tasks.filter((t) => t.status === "done").length;
                    const companySectionKey = `${propId}::${contactId}`;
                    const tasksHidden = !!companyTasksCollapsed[companySectionKey];
                    return (
                      <div key={`${propId}-${contactId}`}>
                        <div
                          style={{
                            backgroundColor: "#f5f0ea",
                            padding: "8px 16px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderBottom: "1px solid #e5e0da",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{compGroup.companyName}</span>
                            <span style={{ fontSize: 11, color: "#8a8580" }}>({compGroup.tasks.length} tasks)</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button
                              type="button"
                              aria-expanded={!tasksHidden}
                              aria-label={tasksHidden ? "Show tasks" : "Hide tasks"}
                              onClick={() =>
                                setCompanyTasksCollapsed((prev) => ({
                                  ...prev,
                                  [companySectionKey]: !prev[companySectionKey],
                                }))
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                padding: 0,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                backgroundColor: C.white,
                                color: C.textPrimary,
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              <svg
                                width={14}
                                height={14}
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  transform: tasksHidden ? "rotate(-90deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                }}
                                aria-hidden
                              >
                                <path d="M3.5 5.25L7 8.75l3.5-3.5" />
                              </svg>
                            </button>
                            <span style={{ fontSize: 11, color: "#5a5550" }}>
                              {completedComp}/{compGroup.tasks.length} completed
                            </span>
                          </div>
                        </div>

                        {tasksHidden ? null : (
                          <div style={{ overflowX: "auto", background: C.white }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.white }}>
                              {tableHead}
                              <tbody>{compGroup.tasks.map((t) => renderTaskRow(t))}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groupedTasks.ungrouped.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  backgroundColor: "#8a8580",
                  color: "#fff",
                  padding: "12px 16px",
                  borderRadius: "10px 10px 0 0",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Unassigned Tasks ({groupedTasks.ungrouped.length})
              </div>
              <div
                style={{
                  border: "1px solid #e5e0da",
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  overflowX: "auto",
                  background: C.white,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.white }}>
                  {tableHead}
                  <tbody>{groupedTasks.ungrouped.map((t) => renderTaskRow(t))}</tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
          {(["todo", "in_progress", "done", "skipped"] as const).map((s) => {
            const colTasks = grouped[s] ?? [];
            return (
              <div key={s} style={{ minWidth: 260, width: 260, flexShrink: 0, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 280px)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
                  <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{boardStageLabel(s)}</span>
                  <span
                    style={{
                      fontFamily: F.body,
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.textMuted,
                      backgroundColor: C.white,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: "2px 10px",
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>
                <div
                  style={{
                    backgroundColor: C.borderLight,
                    borderRadius: 12,
                    padding: 8,
                    flex: 1,
                    overflowY: "auto",
                    border: `2px solid transparent`,
                    minHeight: 120,
                  }}
                >
                  {colTasks.length === 0 ? (
                    <div style={{ fontFamily: F.body, fontSize: 12, color: C.textMuted, textAlign: "center", padding: "28px 12px" }}>No tasks</div>
                  ) : (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          backgroundColor: C.white,
                          borderRadius: 10,
                          padding: "14px 16px",
                          marginBottom: 8,
                          cursor: "pointer",
                          border: `1px solid ${C.border}`,
                          transition: "box-shadow 0.2s, transform 0.15s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                          e.currentTarget.style.transform = "none";
                        }}
                      >
                        <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: C.textPrimary, margin: "0 0 8px", lineHeight: 1.3 }}>{t.title}</div>
                        <div style={{ marginBottom: 8 }}>
                          <span style={statusBadgeStyle(t.status)}>{statusLabelPretty(t.status)}</span>
                        </div>
                        <div style={{ fontFamily: F.body, fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>{t.due_date ?? "No due date"}</div>
                        <div style={{ fontFamily: F.body, fontSize: 12, color: C.textMuted }}>
                          {t.assigned_to_user_id
                            ? allMemberNames[t.assigned_to_user_id] ?? `${t.assigned_to_user_id.slice(0, 8)}…`
                            : "Unassigned"}
                        </div>
                        <button
                          type="button"
                          onClick={() => void openDetail(t)}
                          style={{ ...btnPrimary, marginTop: 10, width: "100%", padding: "8px 12px", fontSize: 13 }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = C.darkGreenHover;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = C.darkGreen;
                          }}
                        >
                          Open
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {openTask ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-detail-title"
          style={{
            position: "fixed",
            inset: 0,
            background: C.overlay,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setOpenTask(null)}
        >
          <section
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              background: C.offWhite,
              padding: 22,
              display: "grid",
              gap: 16,
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 48px rgba(0,0,0,0.15)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h2 id="task-detail-title" style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 400, color: C.textPrimary, lineHeight: 1.2 }}>
                {openTask.title}
              </h2>
              <button type="button" onClick={() => setOpenTask(null)} style={{ ...btnSecondary, flexShrink: 0, padding: "8px 14px" }}>
                Close
              </button>
            </div>
            <p style={{ margin: 0, fontFamily: F.body, fontSize: 14, color: C.textSecondary, lineHeight: 1.5 }}>
              {openTask.description ?? "No description"}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={() => void updateTaskDetail({ status: "in_progress" })}
                style={btnPrimary}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreenHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreen;
                }}
              >
                In progress
              </button>
              <button
                type="button"
                onClick={() => void updateTaskDetail({ status: "done" })}
                style={btnPrimary}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreenHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreen;
                }}
              >
                Mark complete
              </button>
              <label style={{ display: "grid", gap: 6, fontFamily: F.body, fontSize: 13, color: C.textSecondary, fontWeight: 500 }}>
                Status
                <select
                  value={openTask.status}
                  onChange={(e) => void updateTaskDetail({ status: e.target.value as Task["status"] })}
                  style={{ ...selectBase, minWidth: 160, backgroundColor: C.white }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontFamily: F.body, fontSize: 13, color: C.textSecondary, fontWeight: 500 }}>
                Assignee
                <select
                  value={openTask.assigned_to_user_id ?? ""}
                  onChange={(e) => void updateTaskDetail({ assigned_to_user_id: e.target.value || null })}
                  style={{ ...selectBase, minWidth: 200, backgroundColor: C.white }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontFamily: F.body, fontSize: 13, color: C.textSecondary, fontWeight: 500 }}>
                Due date
                <input
                  type="date"
                  value={openTask.due_date ?? ""}
                  onChange={(e) => void updateTaskDetail({ due_date: e.target.value || null })}
                  style={{ ...inputBase, backgroundColor: C.white }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <strong style={{ fontFamily: F.body, fontSize: 14, fontWeight: 600, color: C.textPrimary }}>Activity feed</strong>
              <div style={{ display: "grid", gap: 10, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
                {timeline.map((e) => (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 10, alignItems: "start" }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: C.beige,
                        color: C.darkGreen,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: F.body,
                      }}
                    >
                      {initials(e.actor_name ?? null)}
                    </div>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: C.white }}>
                      <div style={{ fontSize: 12, color: C.textMuted, fontFamily: F.body }}>{formatDateTime(e.created_at)}</div>
                      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4, fontFamily: F.body, fontWeight: 600 }}>
                        {e.actor_name ?? "System"}
                      </div>
                      <div style={{ fontFamily: F.body, fontSize: 14, color: C.textPrimary }}>{e.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
                placeholder="Add comment"
                style={{ ...inputBase, width: "100%", resize: "vertical", backgroundColor: C.white }}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
              <button
                type="button"
                onClick={() => void addComment()}
                style={btnPrimary}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreenHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = C.darkGreen;
                }}
              >
                Add note
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showCreateTask ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1010,
            padding: 20,
          }}
          onClick={() => setShowCreateTask(false)}
        >
          <div
            style={{
              backgroundColor: "#faf8f5",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 60px rgba(0,0,0,0.15)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "28px 32px 20px",
                borderBottom: "1px solid #e5e0da",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 24,
                    fontWeight: 400,
                    color: "#1a1a1a",
                    margin: 0,
                  }}
                >
                  New Task
                </h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8a8580", margin: "4px 0 0" }}>
                  Create a new task and assign it to a team member
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTask(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8580", padding: 4 }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>

            <div style={{ padding: "24px 32px", overflowY: "auto", flex: 1 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                  Task title <span style={{ color: "#c0392b" }}>*</span>
                </label>
                <input
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Prepare access cards"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    color: "#1a1a1a",
                    backgroundColor: "#fff",
                    border: "1px solid #e5e0da",
                    borderRadius: 8,
                    padding: "10px 14px",
                    width: "100%",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Task details..."
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    color: "#1a1a1a",
                    backgroundColor: "#fff",
                    border: "1px solid #e5e0da",
                    borderRadius: 8,
                    padding: "10px 14px",
                    width: "100%",
                    outline: "none",
                    boxSizing: "border-box",
                    minHeight: 60,
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Company
                  </label>
                  <select
                    value={newTask.contact_id}
                    onChange={(e) => setNewTask((p) => ({ ...p, contact_id: e.target.value }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">— No company —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Property
                  </label>
                  <select
                    value={newTask.property_id}
                    onChange={(e) => setNewTask((p) => ({ ...p, property_id: e.target.value }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">— No property —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? "Property"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    value={newTask.category}
                    onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="access">Access</option>
                    <option value="it">IT</option>
                    <option value="furniture">Furniture</option>
                    <option value="admin">Admin</option>
                    <option value="welcome">Welcome</option>
                    <option value="invoicing">Invoicing</option>
                    <option value="portal">Portal</option>
                    <option value="orientation">Orientation</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Assign to
                  </label>
                  <select
                    value={newTask.assigned_to_user_id}
                    onChange={(e) => setNewTask((p) => ({ ...p, assigned_to_user_id: e.target.value }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">— Unassigned —</option>
                    {assignableMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Due date
                  </label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                    Status
                  </label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask((p) => ({ ...p, status: e.target.value as Task["status"] }))}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#1a1a1a",
                      backgroundColor: "#fff",
                      border: "1px solid #e5e0da",
                      borderRadius: 8,
                      padding: "10px 14px",
                      width: "100%",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 4 }}>
                  Notes
                </label>
                <textarea
                  value={newTask.notes}
                  onChange={(e) => setNewTask((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Internal notes..."
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    color: "#1a1a1a",
                    backgroundColor: "#fff",
                    border: "1px solid #e5e0da",
                    borderRadius: 8,
                    padding: "10px 14px",
                    width: "100%",
                    outline: "none",
                    boxSizing: "border-box",
                    minHeight: 60,
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: "16px 32px",
                borderTop: "1px solid #e5e0da",
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                backgroundColor: "#f0ece6",
              }}
            >
              <button
                type="button"
                onClick={() => setShowCreateTask(false)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#5a5550",
                  backgroundColor: "transparent",
                  border: "1px solid #e5e0da",
                  borderRadius: 8,
                  padding: "10px 20px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateTask()}
                disabled={creating || !newTask.title.trim()}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                  backgroundColor: "#21524F",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 24px",
                  cursor: creating || !newTask.title.trim() ? "not-allowed" : "pointer",
                  opacity: creating || !newTask.title.trim() ? 0.5 : 1,
                }}
              >
                {creating ? "Creating..." : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function initials(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "SY";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div
      style={{
        backgroundColor: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <p
        style={{
          fontFamily: F.body,
          fontSize: 12,
          fontWeight: 500,
          color: C.textMuted,
          margin: "0 0 6px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: F.heading,
          fontSize: 22,
          fontWeight: 400,
          color: danger ? C.red : C.darkGreen,
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
    </div>
  );
}

