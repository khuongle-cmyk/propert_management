"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";

const linkStyle = (active: boolean): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${active ? "#111" : "#ddd"}`,
  background: active ? "#111" : "#fff",
  color: active ? "#fff" : "#111",
  textDecoration: "none",
  fontSize: 14,
});

export default function BookingsNav() {
  const pathname = usePathname();
  const [canManage, setCanManage] = useState(false);
  const [showOwnerDashboard, setShowOwnerDashboard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: memberships } = await supabase.from("memberships").select("role");
      const roles = (memberships ?? []).map((m) => (m.role ?? "").toLowerCase());
      if (cancelled) return;
      setCanManage(roles.some((r) => ["owner", "manager", "super_admin"].includes(r)));
      setShowOwnerDashboard(
        roles.some((r) => ["owner", "super_admin"].includes(r))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 20,
        alignItems: "center",
      }}
    >
      <Link href="/bookings" style={linkStyle(pathname === "/bookings")}>
        Overview
      </Link>
      <Link href="/bookings/calendar" style={linkStyle(pathname === "/bookings/calendar")}>
        Calendar
      </Link>
      <Link href="/bookings/new" style={linkStyle(pathname === "/bookings/new")}>
        New booking
      </Link>
      <Link href="/bookings/my" style={linkStyle(pathname === "/bookings/my")}>
        My bookings
      </Link>
      {canManage ? (
        <Link href="/bookings/manage" style={linkStyle(pathname === "/bookings/manage")}>
          Manage bookings
        </Link>
      ) : null}
      {showOwnerDashboard ? (
        <Link href="/dashboard" style={linkStyle(pathname === "/dashboard")}>
          Owner dashboard
        </Link>
      ) : null}
    </nav>
  );
}
