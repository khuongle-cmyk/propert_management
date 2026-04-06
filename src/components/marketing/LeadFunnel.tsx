"use client";

type LeadFunnelProps = {
  visitors?: number;
  leads?: number;
  tours?: number;
  tenants?: number;
};

export default function LeadFunnel({ visitors = 0, leads = 0, tours = 0, tenants = 0 }: LeadFunnelProps) {
  const funnelStages = [
    { label: "Visitors", value: visitors, barColor: "#21524F" },
    { label: "Leads", value: leads, barColor: "#2f6d68" },
    { label: "Tours", value: tours, barColor: "#F3DFC6" },
    { label: "Tenants", value: tenants, barColor: "rgba(33,82,79,0.28)" },
  ];

  const maxValue = Math.max(...funnelStages.map((s) => s.value), 1);

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
        Lead funnel
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {funnelStages.map((stage) => {
          const width = stage.value > 0 ? (stage.value / maxValue) * 100 : 0;
          return (
            <div key={stage.label}>
              <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#5a6b68" }}>{stage.label}</span>
                <span style={{ color: "#8a9b98" }}>{stage.value}</span>
              </div>
              <div style={{ height: 6, overflow: "hidden", borderRadius: 9999, background: "rgba(33,82,79,0.08)" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 9999,
                    transition: "width 0.5s",
                    width: `${width}%`,
                    backgroundColor: stage.barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
