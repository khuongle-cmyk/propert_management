"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { languages, type CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import type { CmsTheme } from "@/lib/cms2/types";

export function Cms2LanguageSwitcher({
  theme,
  currentLocale,
  ui,
}: {
  theme: CmsTheme;
  currentLocale: CmsMarketingLocale;
  ui: CmsPublicUi;
}) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = languages.find((o) => o.code === currentLocale) ?? languages[0];

  function hrefFor(lang: CmsMarketingLocale): string {
    const p = new URLSearchParams(searchParams.toString());
    if (lang === "fi") {
      p.delete("lang");
    } else {
      p.set("lang", lang);
    }
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ariaLabel = `${tx(ui, "lang.title")}: ${current.name}`;

  return (
    <div ref={rootRef} style={{ position: "relative", zIndex: 60 }}>
      <button
        type="button"
        id="cms2-lang-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="cms2-lang-menu"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 10px",
          borderRadius: 10,
          cursor: "pointer",
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          color: theme.petrol,
          boxShadow: open ? "0 4px 14px rgba(13, 61, 59, 0.12)" : "none",
          minWidth: 44,
          minHeight: 44,
        }}
      >
        <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>
          {current.flag}
        </span>
      </button>

      {open ? (
        <ul
          id="cms2-lang-menu"
          role="listbox"
          aria-labelledby="cms2-lang-trigger"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 220,
            margin: 0,
            padding: 6,
            listStyle: "none",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            boxShadow: "0 12px 40px rgba(13, 61, 59, 0.15)",
          }}
        >
          {languages.map((opt) => {
            const active = currentLocale === opt.code;
            return (
              <li key={opt.code} role="option" aria-selected={active}>
                <Link
                  href={hrefFor(opt.code)}
                  scroll={false}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    textDecoration: "none",
                    color: active ? theme.petrol : theme.text,
                    background: active ? theme.accentBg : "transparent",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
                    {opt.flag}
                  </span>
                  <span>{opt.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
