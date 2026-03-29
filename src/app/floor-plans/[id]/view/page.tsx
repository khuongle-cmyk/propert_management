"use client";

import dynamic from "next/dynamic";

const FloorPlanViewer = dynamic(() => import("@/components/floor-plans/FloorPlanViewer"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, color: "#666" }}>Loading…</p>,
});

export default function FloorPlanViewPage() {
  return <FloorPlanViewer />;
}
