"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const FloorPlanEditor = dynamic(() => import("@/components/floor-plans/FloorPlanEditor"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, color: "#666" }}>Loading editor…</p>,
});

export default function FloorPlanEditPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  if (!id) return <main style={{ padding: 24 }}>Invalid plan.</main>;
  return <FloorPlanEditor floorPlanId={id} />;
}
