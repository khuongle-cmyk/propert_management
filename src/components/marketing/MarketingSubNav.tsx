"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: { href: string; label: string }[] = [
  { href: "/marketing", label: "📊 Dashboard" },
  { href: "/marketing/campaigns", label: "📋 Campaigns" },
  { href: "/marketing/email", label: "📧 Email" },
  { href: "/marketing/sms", label: "💬 SMS" },
  { href: "/marketing/social", label: "📱 Social" },
  { href: "/marketing/events", label: "🎉 Events" },
  { href: "/marketing/offers", label: "🏷️ Offers" },
  { href: "/marketing/referrals", label: "👥 Referrals" },
  { href: "/marketing/analytics", label: "📈 Analytics" },
];

export default function MarketingSubNav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid rgba(26,74,74,0.12)",
      }}
    >
      {links.map(({ href, label }) => {
        const active = pathname === href || (href !== "/marketing" && pathname?.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              textDecoration: "none",
              color: active ? "#fff" : "var(--petrol, #1a4a4a)",
              background: active ? "var(--petrol, #1a4a4a)" : "rgba(26,74,74,0.06)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
