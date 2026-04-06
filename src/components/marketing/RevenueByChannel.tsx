"use client";

import { useEffect, useRef } from "react";
import type { Chart } from "chart.js";

const CHANNEL_DEFS = [
  { label: "Website", color: "#21524F" },
  { label: "Referral", color: "#2f6d68" },
  { label: "Walk-in", color: "#8a9b98" },
  { label: "Other", color: "#F3DFC6" },
] as const;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CHART_TICK = "rgba(26,46,42,0.55)";
const CHART_GRID = "rgba(33,82,79,0.08)";

function last6MonthLabels(endYyyyMm: string): string[] {
  const parts = endYyyyMm.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? 1;
  const labels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    labels.push(SHORT_MONTHS[d.getUTCMonth()] ?? "");
  }
  return labels;
}

function mapSourceToBucket(source: string): (typeof CHANNEL_DEFS)[number]["label"] {
  const s = source.toLowerCase();
  if (s.includes("website") || s === "web" || s.includes("online")) return "Website";
  if (s.includes("referral") || s.includes("refer")) return "Referral";
  if (s.includes("walk")) return "Walk-in";
  return "Other";
}

function aggregateByBucket(channels: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { Website: 0, Referral: 0, "Walk-in": 0, Other: 0 };
  for (const [key, raw] of Object.entries(channels)) {
    const v = Number(raw) || 0;
    if (v === 0) continue;
    const b = mapSourceToBucket(key);
    out[b] = (out[b] ?? 0) + v;
  }
  return out;
}

type RevenueByChannelProps = {
  channels?: Record<string, number>;
  /** Selected dashboard month (YYYY-MM); drives the 6-month window (last month = selected). */
  monthKey?: string;
};

export default function RevenueByChannel({ channels = {}, monthKey }: RevenueByChannelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const mk = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonthYyyyMm();
  const months = last6MonthLabels(mk);
  const buckets = aggregateByBucket(channels);
  const dataKey = JSON.stringify({ buckets, months: months.join(",") });

  useEffect(() => {
    let mounted = true;

    const loadChart = async () => {
      const { Chart: ChartJS, registerables } = await import("chart.js");
      ChartJS.register(...registerables);

      if (!mounted || !canvasRef.current) return;

      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      const dataFor = (label: (typeof CHANNEL_DEFS)[number]["label"]) =>
        months.map((_, i) => (i === months.length - 1 ? buckets[label] ?? 0 : 0));

      chartRef.current = new ChartJS(canvasRef.current, {
        type: "bar",
        data: {
          labels: months,
          datasets: CHANNEL_DEFS.map((ch) => ({
            label: ch.label,
            data: dataFor(ch.label),
            backgroundColor: ch.color,
            borderRadius: 3,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const n = Number(ctx.raw);
                  if (n === 0) return `${ctx.dataset.label}: —`;
                  return `${ctx.dataset.label}: €${Math.round(n).toLocaleString()}`;
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { color: CHART_TICK, font: { size: 11 } },
            },
            y: {
              stacked: true,
              grid: { color: CHART_GRID },
              ticks: {
                color: CHART_TICK,
                font: { size: 11 },
                callback(v) {
                  return `€${Number(v).toLocaleString()}`;
                },
              },
              border: { display: false },
            },
          },
        },
      });
    };

    void loadChart();

    return () => {
      mounted = false;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [dataKey]);

  const total = Object.values(buckets).reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid rgba(33,82,79,0.1)",
        padding: 24,
        boxShadow: "0 1px 3px rgba(33,82,79,0.06)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "#21524F",
          fontFamily: "'Instrument Serif', Georgia, serif",
          marginBottom: 16,
        }}
      >
        Revenue by channel
      </h3>
      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
        {CHANNEL_DEFS.map((ch) => (
          <span key={ch.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5a6b68" }}>
            <span style={{ height: 10, width: 10, flexShrink: 0, borderRadius: 2, backgroundColor: ch.color }} />
            {ch.label}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", height: 200, width: "100%" }}>
        <canvas ref={canvasRef} />
      </div>
      {total === 0 ? (
        <p style={{ margin: "8px 0 0 0", textAlign: "center", fontSize: 12, color: "#8a9b98" }}>No channel revenue for this period</p>
      ) : null}
    </div>
  );
}

function currentMonthYyyyMm(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
