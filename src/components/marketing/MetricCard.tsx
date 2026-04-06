interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  muted?: boolean;
}

export default function MetricCard({ label, value, change, positive, muted }: MetricCardProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid rgba(33,82,79,0.1)",
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(33,82,79,0.06)",
      }}
    >
      <p
        style={{
          fontSize: 13,
          color: "#5a6b68",
          fontFamily: "'DM Sans', sans-serif",
          margin: "0 0 6px 0",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          color: muted ? "rgba(26,46,42,0.5)" : "#1a2e2a",
          fontFamily: "'DM Sans', sans-serif",
          margin: 0,
        }}
      >
        {value}
      </p>
      {change ? (
        <p style={{ margin: "4px 0 0 0", fontSize: 12, color: positive ? "#21524F" : "#b42318" }}>{change}</p>
      ) : null}
    </div>
  );
}
