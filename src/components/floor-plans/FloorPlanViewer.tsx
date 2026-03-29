"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Stage, Layer, Group, Rect, Line, Text } from "react-konva";
import { ROOM_TYPE_COLORS, type FloorPlanRoomType, type OccupancyKind } from "@/lib/floor-plans/constants";

const OCC_STYLES: Record<OccupancyKind, { fill: string; stroke: string; label: string }> = {
  available: { fill: "#bbf7d0", stroke: "#166534", label: "Available" },
  occupied: { fill: "#fecaca", stroke: "#991b1b", label: "Occupied" },
  reserved: { fill: "#fef08a", stroke: "#a16207", label: "Reserved" },
  not_rentable: { fill: "#e5e7eb", stroke: "#4b5563", label: "Not rentable" },
  unlinked: { fill: "#f3f4f6", stroke: "#9ca3af", label: "Unlinked" },
};

type RoomOcc = {
  id: string;
  room_number: string;
  room_name: string;
  room_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: string;
  polygon_points: unknown;
  is_rentable: boolean;
  occupancy: OccupancyKind;
  display_size_m2: number | null;
  display_capacity: number | null;
  display_rent: number | null;
  contract: { tenant_name: string | null; end_date: string | null; monthly_rent: number } | null;
};

export default function FloorPlanViewer() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [viewport, setViewport] = useState({ w: 920, h: 560 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [data, setData] = useState<{
    plan: { name: string; width_meters: number; height_meters: number; scale: number; status?: string };
    rooms: RoomOcc[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<RoomOcc | null>(null);
  const [panel, setPanel] = useState<RoomOcc | null>(null);
  const [filterOcc, setFilterOcc] = useState<"all" | "available" | "occupied">("all");
  const [filterType, setFilterType] = useState<"all" | "office" | "meeting" | "desk">("all");

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(id)}/occupancy`);
    const json = (await res.json()) as { plan?: Record<string, unknown>; rooms?: RoomOcc[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    if (!json.plan) {
      setError("Not found");
      setLoading(false);
      return;
    }
    const scale = Number(json.plan.scale) || 100;
    setData({
      plan: {
        name: String(json.plan.name ?? ""),
        width_meters: Number(json.plan.width_meters) || 20,
        height_meters: Number(json.plan.height_meters) || 15,
        scale,
        status: String(json.plan.status ?? ""),
      },
      rooms: json.rooms ?? [],
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: Math.min(1100, window.innerWidth - 320), h: Math.max(320, window.innerHeight - 200) });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fpW = data ? data.plan.width_meters * data.plan.scale : 800;
  const fpH = data ? data.plan.height_meters * data.plan.scale : 600;

  const visibleRooms = useMemo(() => {
    if (!data) return [];
    return data.rooms.filter((r) => {
      if (filterOcc === "available" && r.occupancy !== "available" && r.occupancy !== "unlinked") return false;
      if (filterOcc === "occupied" && r.occupancy !== "occupied") return false;
      if (filterType === "office" && r.room_type !== "office") return false;
      if (filterType === "meeting" && r.room_type !== "meeting_room") return false;
      if (filterType === "desk" && r.room_type !== "hot_desk") return false;
      return true;
    });
  }, [data, filterOcc, filterType]);

  const onWheel = (e: { evt: WheelEvent }) => {
    e.evt.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.15, z + (e.evt.deltaY > 0 ? -0.06 : 0.06))));
  };

  if (!id) return <main style={{ padding: 24 }}>Invalid plan.</main>;
  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (error || !data) return <p style={{ padding: 24, color: "#b00020" }}>{error ?? "Not found"}</p>;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>
      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Link href="/floor-plans">← Floor plans</Link>
        <Link href={`/floor-plans/${id}/edit`}>Edit</Link>
        <h1 style={{ margin: 0, flex: "1 1 auto" }}>{data.plan.name}</h1>
        {data.plan.status === "draft" ? (
          <span style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", padding: "4px 10px", borderRadius: 8 }}>Draft</span>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Status</div>
            <select value={filterOcc} onChange={(e) => setFilterOcc(e.target.value as typeof filterOcc)} style={{ width: "100%", padding: 8 }}>
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
            </select>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Type</div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} style={{ width: "100%", padding: 8 }}>
              <option value="all">All</option>
              <option value="office">Offices</option>
              <option value="meeting">Meeting</option>
              <option value="desk">Hot desks</option>
            </select>
          </div>
          <div style={{ fontSize: 13, color: "#444" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Legend</div>
            {(Object.keys(OCC_STYLES) as OccupancyKind[]).map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: OCC_STYLES[k].fill, border: `1px solid ${OCC_STYLES[k].stroke}` }} />
                {OCC_STYLES[k].label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: "1 1 480px", minWidth: 280, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#f9fafb" }}>
          <Stage width={viewport.w} height={viewport.h} onWheel={onWheel}>
            <Layer>
              <Group x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
                <Rect x={0} y={0} width={fpW} height={fpH} fill="white" stroke="#cbd5e1" strokeWidth={2 / zoom} />
                {visibleRooms.map((room) => {
                  const occ = OCC_STYLES[room.occupancy] ?? OCC_STYLES.unlinked;
                  const rt = (room.room_type as FloorPlanRoomType) in ROOM_TYPE_COLORS ? (room.room_type as FloorPlanRoomType) : "other";
                  const base = ROOM_TYPE_COLORS[rt];
                  const fill = room.occupancy === "not_rentable" ? occ.fill : base.fill;
                  const stroke = occ.stroke;
                  const label = [room.room_number, room.room_name].filter(Boolean).join(" · ") || "Room";
                  return (
                    <Group
                      key={room.id}
                      x={Number(room.x)}
                      y={Number(room.y)}
                      rotation={Number(room.rotation)}
                      onMouseEnter={() => setHover(room)}
                      onMouseLeave={() => setHover((h) => (h?.id === room.id ? null : h))}
                      onClick={() => setPanel(room)}
                    >
                      {room.shape === "polygon" && Array.isArray(room.polygon_points) && (room.polygon_points as number[]).length >= 6 ? (
                        <Line points={room.polygon_points as number[]} closed fill={fill} stroke={stroke} strokeWidth={2 / zoom} opacity={0.95} />
                      ) : (
                        <Rect width={Number(room.width)} height={Number(room.height)} fill={fill} stroke={stroke} strokeWidth={2 / zoom} opacity={0.95} />
                      )}
                      <Text
                        x={Number(room.width) / 2}
                        y={Number(room.height) / 2}
                        offsetX={label.length * 3}
                        offsetY={6 / zoom}
                        text={label}
                        fontSize={12 / zoom}
                        fill="#111"
                        listening={false}
                      />
                    </Group>
                  );
                })}
              </Group>
            </Layer>
          </Stage>
        </div>

        <aside style={{ width: 280, minWidth: 240, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, fontSize: 14 }}>
          {panel ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{panel.room_name || panel.room_number || "Room"}</div>
              <p style={{ margin: "4px 0", color: "#555" }}>
                #{panel.room_number} · {panel.room_type.replace("_", " ")}
              </p>
              <p style={{ margin: "4px 0" }}>Status: {OCC_STYLES[panel.occupancy]?.label ?? panel.occupancy}</p>
              {panel.display_size_m2 != null ? <p style={{ margin: "4px 0" }}>Size: {Number(panel.display_size_m2).toFixed(1)} m²</p> : null}
              {panel.display_capacity != null ? <p style={{ margin: "4px 0" }}>Capacity: {panel.display_capacity}</p> : null}
              {panel.display_rent != null ? <p style={{ margin: "4px 0" }}>Rent: €{Number(panel.display_rent).toFixed(0)} / mo</p> : null}
              {panel.contract?.tenant_name ? <p style={{ margin: "4px 0" }}>Tenant: {panel.contract.tenant_name}</p> : null}
              {panel.contract?.end_date ? <p style={{ margin: "4px 0" }}>Contract end: {panel.contract.end_date}</p> : null}
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <Link
                  href={panel.room_type === "meeting_room" ? `/bookings/new?spaceHint=${encodeURIComponent(panel.id)}` : `/crm`}
                  style={{ padding: "8px 12px", background: "#1a4a4a", color: "#fff", borderRadius: 8, textAlign: "center", textDecoration: "none" }}
                >
                  {panel.room_type === "meeting_room" ? "Book now" : "Create contract"}
                </Link>
              </div>
            </div>
          ) : (
            <p style={{ color: "#6b7280" }}>Click a room for details.</p>
          )}
        </aside>
      </div>

      {hover ? (
        <div
          style={{
            position: "fixed",
            pointerEvents: "none",
            left: 24,
            bottom: 24,
            background: "rgba(17,24,39,0.92)",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            maxWidth: 320,
            zIndex: 40,
          }}
        >
          <div style={{ fontWeight: 600 }}>{[hover.room_number, hover.room_name].filter(Boolean).join(" · ")}</div>
          {hover.contract?.tenant_name ? <div>Tenant: {hover.contract.tenant_name}</div> : null}
          {hover.contract?.end_date ? <div>Ends: {hover.contract.end_date}</div> : null}
          {hover.display_size_m2 != null ? <div>{Number(hover.display_size_m2).toFixed(1)} m²</div> : null}
          {hover.display_capacity != null ? <div>Cap. {hover.display_capacity}</div> : null}
          {hover.display_rent != null ? <div>€{Number(hover.display_rent).toFixed(0)} / mo</div> : null}
        </div>
      ) : null}
    </main>
  );
}
