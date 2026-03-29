"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Line, Text, Image, Transformer } from "react-konva";
import type Konva from "konva";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getSupabaseClient } from "@/lib/supabase/browser";
import {
  defaultMetadata,
  FLOOR_PLAN_ROOM_TYPES,
  ROOM_TYPE_COLORS,
  ROOM_TYPE_LABELS,
  type FloorPlanRoomType,
  type RoomMetadata,
} from "@/lib/floor-plans/constants";
import type { DxfParseResult } from "@/lib/floor-plans/parse-dxf";

type PlanRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  name: string;
  floor_number: number;
  width_meters: number;
  height_meters: number;
  scale: number;
  background_image_url: string | null;
  background_opacity: number;
  show_background: boolean;
  status: string;
  canvas_data: Record<string, unknown>;
};

type RoomRow = {
  id: string;
  room_number: string;
  room_name: string;
  room_type: string;
  bookable_space_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string | null;
  shape: string;
  polygon_points: unknown;
  label_x: number | null;
  label_y: number | null;
  is_rentable: boolean;
  metadata: Record<string, unknown>;
};

type ElementRow = {
  id: string;
  element_type: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  rotation: number;
  points: number[] | null;
  style: Record<string, unknown>;
  label: string | null;
};

type Tool =
  | "select"
  | "rect_room"
  | "polygon_room"
  | "wall"
  | "door"
  | "window"
  | "pillar"
  | "text_label"
  | "dimension_line"
  | "pan";

const MAX_HISTORY = 50;

type LayerEntry = { visible: boolean; locked: boolean };
type LayersState = {
  rooms: LayerEntry;
  walls: LayerEntry;
  labels: LayerEntry;
  background: LayerEntry;
  grid: LayerEntry;
};

const defaultLayers = (): LayersState => ({
  rooms: { visible: true, locked: false },
  walls: { visible: true, locked: true },
  labels: { visible: true, locked: true },
  background: { visible: true, locked: true },
  grid: { visible: true, locked: true },
});

function elementVisualLayer(el: ElementRow): "walls" | "labels" {
  if (el.element_type === "text_label") return "labels";
  return "walls";
}

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function nextRoomNumber(rooms: RoomRow[]): string {
  let max = 100;
  for (const r of rooms) {
    const m = parseInt(String(r.room_number).replace(/\D/g, ""), 10);
    if (Number.isFinite(m) && m >= max) max = m + 1;
  }
  return String(max);
}

export default function FloorPlanEditor({ floorPlanId }: { floorPlanId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exportWrapRef = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const roomRefs = useRef<Record<string, Konva.Group>>({});

  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [elements, setElements] = useState<ElementRow[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [layers, setLayers] = useState<LayersState>(defaultLayers);
  const [snap, setSnap] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<{ rooms: RoomRow[]; elements: ElementRow[] }[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const histIdxRef = useRef(-1);
  const roomsRef = useRef<RoomRow[]>([]);
  const elementsRef = useRef<ElementRow[]>([]);
  const planRef = useRef<PlanRow | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const draftRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [polyDraft, setPolyDraft] = useState<{ x: number; y: number }[]>([]);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [dimStart, setDimStart] = useState<{ x: number; y: number } | null>(null);
  const [roomDialog, setRoomDialog] = useState<{
    id: string;
    room_number: string;
    room_name: string;
    room_type: FloorPlanRoomType;
    capacity: number;
    size_m2: number;
  } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ toImport: number; linked: number } | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [spaceOptions, setSpaceOptions] = useState<{ id: string; name: string; room_number: string | null }[]>([]);
  const spaceDownRef = useRef(false);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const [dxfPreview, setDxfPreview] = useState<(DxfParseResult & { scaleHint?: string }) | null>(null);
  const [dxfBusy, setDxfBusy] = useState(false);
  const [dwgHelpOpen, setDwgHelpOpen] = useState(false);

  useEffect(() => {
    roomsRef.current = rooms;
    elementsRef.current = elements;
  }, [rooms, elements]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  useEffect(() => {
    histIdxRef.current = histIdx;
  }, [histIdx]);

  const ppm = plan ? num(plan.scale, 100) : 100;
  const fpW = plan ? num(plan.width_meters, 20) * ppm : 800;
  const fpH = plan ? num(plan.height_meters, 15) * ppm : 600;
  const gridPx = 0.5 * ppm;

  const snapPx = useCallback(
    (v: number) => {
      if (!snap) return v;
      const g = gridPx;
      return Math.round(v / g) * g;
    },
    [snap, gridPx],
  );

  const pushHistory = useCallback((override?: { rooms: RoomRow[]; elements: ElementRow[] }) => {
    const snap = {
      rooms: JSON.parse(JSON.stringify(override?.rooms ?? roomsRef.current)),
      elements: JSON.parse(JSON.stringify(override?.elements ?? elementsRef.current)),
    };
    setHistory((h) => {
      const next = h.slice(0, histIdxRef.current + 1);
      next.push(snap);
      if (next.length > MAX_HISTORY) next.shift();
      const ni = next.length - 1;
      queueMicrotask(() => setHistIdx(ni));
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(floorPlanId)}`);
    const json = (await res.json()) as { plan?: PlanRow; rooms?: RoomRow[]; elements?: ElementRow[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Load failed");
      setLoading(false);
      return;
    }
    const p = json.plan;
    if (!p) {
      setError("Not found");
      setLoading(false);
      return;
    }
    setPlan({
      ...p,
      width_meters: num(p.width_meters, 20),
      height_meters: num(p.height_meters, 15),
      scale: num(p.scale, 100),
      background_opacity: num(p.background_opacity, 0.5),
      show_background: p.show_background !== false,
    });
    setRooms(
      (json.rooms ?? []).map((r) => ({
        ...r,
        x: num(r.x),
        y: num(r.y),
        width: num(r.width, 40),
        height: num(r.height, 40),
        rotation: num(r.rotation),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      })),
    );
    setElements(
      (json.elements ?? []).map((el) => ({
        ...el,
        x: num(el.x),
        y: num(el.y),
        width: el.width != null ? num(el.width) : null,
        height: el.height != null ? num(el.height) : null,
        rotation: num(el.rotation),
        points: Array.isArray(el.points) ? (el.points as number[]) : null,
        style: (el.style ?? {}) as Record<string, unknown>,
      })),
    );
    setHistory([{ rooms: JSON.parse(JSON.stringify(json.rooms ?? [])), elements: JSON.parse(JSON.stringify(json.elements ?? [])) }]);
    setHistIdx(0);
    setLoading(false);
    setDirty(false);

    const supabase = getSupabaseClient();
    const { data: spaces } = await supabase
      .from("bookable_spaces")
      .select("id, name, room_number")
      .eq("property_id", p.property_id)
      .order("name");
    setSpaceOptions(spaces ?? []);
  }, [floorPlanId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.max(320, r.width), h: Math.max(280, r.height - 8) });
    });
    ro.observe(el);
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setViewport({ w: Math.max(320, r.width), h: Math.max(280, r.height - 8) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!plan?.background_image_url || !plan.show_background) {
      setBgImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = plan.background_image_url;
  }, [plan?.background_image_url, plan?.show_background]);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr || tool !== "select" || layers.rooms.locked) return;
    const node = selectedId ? roomRefs.current[selectedId] : null;
    if (node && rooms.find((r) => r.id === selectedId)?.shape === "rect") {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, rooms, tool, zoom, pan, layers.rooms.locked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "KeyV" || e.code === "KeyS") setTool("select");
      if (e.code === "KeyH") setTool("pan");
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        if (histIdx > 0) {
          const h = history[histIdx - 1];
          if (h) {
            setRooms(JSON.parse(JSON.stringify(h.rooms)));
            setElements(JSON.parse(JSON.stringify(h.elements)));
            setHistIdx((i) => i - 1);
            setDirty(true);
          }
        }
      }
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        if (histIdx < history.length - 1) {
          const h = history[histIdx + 1];
          if (h) {
            setRooms(JSON.parse(JSON.stringify(h.rooms)));
            setElements(JSON.parse(JSON.stringify(h.elements)));
            setHistIdx((i) => i + 1);
            setDirty(true);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, histIdx]);

  useEffect(() => {
    if (!dirty) return;
    const t = setInterval(() => {
      void save(false);
    }, 30000);
    return () => clearInterval(t);
  }, [dirty, floorPlanId]);

  const save = async (showDone = true) => {
    const plan = planRef.current;
    const rooms = roomsRef.current;
    const elements = elementsRef.current;
    if (!plan) return;
    setSaveState("saving");
    const body = {
      name: plan.name,
      floor_number: plan.floor_number,
      width_meters: plan.width_meters,
      height_meters: plan.height_meters,
      scale: plan.scale,
      background_image_url: plan.background_image_url,
      background_opacity: plan.background_opacity,
      show_background: plan.show_background,
      status: plan.status,
      canvas_data: plan.canvas_data ?? {},
      rooms: rooms.map((r) => ({
        id: r.id,
        bookable_space_id: r.bookable_space_id,
        room_number: r.room_number,
        room_name: r.room_name,
        room_type: r.room_type,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        rotation: r.rotation,
        color: r.color,
        shape: r.shape,
        polygon_points: r.polygon_points,
        label_x: r.label_x,
        label_y: r.label_y,
        is_rentable: r.is_rentable,
        metadata: r.metadata,
      })),
      elements: elements.map((el) => ({
        id: el.id,
        element_type: el.element_type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        points: el.points,
        style: el.style,
        label: el.label,
      })),
    };
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(floorPlanId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      setSaveState("idle");
      return;
    }
    setDirty(false);
    if (showDone) setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1600);
  };

  const contentToFloor = (cx: number, cy: number) => ({
    x: snapPx((cx - pan.x) / zoom),
    y: snapPx((cy - pan.y) / zoom),
  });

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const old = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const delta = e.evt.deltaY > 0 ? -0.08 : 0.08;
    const next = Math.min(3, Math.max(0.15, old + delta));
    const fx = (pointer.x - pan.x) / old;
    const fy = (pointer.y - pan.y) / old;
    setPan({ x: pointer.x - fx * next, y: pointer.y - fy * next });
    setZoom(next);
  };

  const gridLines = useMemo(() => {
    if (!layers.grid.visible) return null;
    const lines: JSX.Element[] = [];
    let k = 0;
    for (let x = 0; x <= fpW; x += gridPx) {
      lines.push(
        <Line key={`gx${k++}`} points={[x, 0, x, fpH]} stroke="#e5e7eb" strokeWidth={1 / zoom} listening={false} />,
      );
    }
    for (let y = 0; y <= fpH; y += gridPx) {
      lines.push(
        <Line key={`gy${k++}`} points={[0, y, fpW, y]} stroke="#e5e7eb" strokeWidth={1 / zoom} listening={false} />,
      );
    }
    return lines;
  }, [layers.grid.visible, fpW, fpH, gridPx, zoom]);

  const finalizeRectRoom = (x: number, y: number, w: number, h: number) => {
    if (w < 8 || h < 8) return;
    const id = crypto.randomUUID();
    const meta = defaultMetadata();
    const size_m2 = (w / ppm) * (h / ppm);
    const roomNumber = nextRoomNumber(roomsRef.current);
    const newRow: RoomRow = {
      id,
      room_number: roomNumber,
      room_name: "",
      room_type: "meeting_room",
      bookable_space_id: null,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      color: null,
      shape: "rect",
      polygon_points: null,
      label_x: null,
      label_y: null,
      is_rentable: true,
      metadata: { ...meta, size_m2, capacity: meta.capacity ?? 1 },
    };
    const nextRooms = [...roomsRef.current, newRow];
    roomsRef.current = nextRooms;
    setRooms(nextRooms);
    pushHistory({ rooms: nextRooms, elements: elementsRef.current });
    setRoomDialog({
      id,
      room_number: roomNumber,
      room_name: "",
      room_type: "meeting_room",
      capacity: 1,
      size_m2,
    });
    setSelectedId(id);
    setDirty(true);
  };

  const finalizePolygonRoom = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = Math.max(12, maxX - minX);
    const h = Math.max(12, maxY - minY);
    const flat = pts.flatMap((p) => [p.x - minX, p.y - minY]);
    const id = crypto.randomUUID();
    const meta = defaultMetadata();
    const size_m2 = (w / ppm) * (h / ppm);
    const roomNumber = nextRoomNumber(roomsRef.current);
    const newRow: RoomRow = {
      id,
      room_number: roomNumber,
      room_name: "",
      room_type: "meeting_room",
      bookable_space_id: null,
      x: minX,
      y: minY,
      width: w,
      height: h,
      rotation: 0,
      color: null,
      shape: "polygon",
      polygon_points: flat,
      label_x: null,
      label_y: null,
      is_rentable: true,
      metadata: { ...meta, size_m2, capacity: meta.capacity ?? 1 },
    };
    const nextRooms = [...roomsRef.current, newRow];
    roomsRef.current = nextRooms;
    setRooms(nextRooms);
    pushHistory({ rooms: nextRooms, elements: elementsRef.current });
    setPolyDraft([]);
    setRoomDialog({
      id,
      room_number: roomNumber,
      room_name: "",
      room_type: "meeting_room",
      capacity: 1,
      size_m2,
    });
    setSelectedId(id);
    setDirty(true);
  };

  const applyRoomDialog = () => {
    if (!roomDialog) return;
    const { id, room_number, room_name, room_type, capacity, size_m2 } = roomDialog;
    const cols = ROOM_TYPE_COLORS[room_type] ?? ROOM_TYPE_COLORS.other;
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === id
          ? {
              ...r,
              room_number,
              room_name,
              room_type,
              color: cols.fill,
              metadata: {
                ...(r.metadata ?? {}),
                capacity,
                size_m2,
              },
            }
          : r,
      );
      roomsRef.current = next;
      return next;
    });
    setRoomDialog(null);
    setDirty(true);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const isRoom = roomsRef.current.some((r) => r.id === selectedId);
    if (isRoom) {
      const next = roomsRef.current.filter((x) => x.id !== selectedId);
      roomsRef.current = next;
      setRooms(next);
    } else {
      const next = elementsRef.current.filter((x) => x.id !== selectedId);
      elementsRef.current = next;
      setElements(next);
    }
    pushHistory();
    setSelectedId(null);
    setDirty(true);
  };

  const publish = async () => {
    if (!planRef.current) return;
    const n = { ...planRef.current, status: "published" as const };
    planRef.current = n;
    setPlan(n);
    setDirty(true);
    await save();
  };

  const applyDxfImport = (mode: "all" | "walls" | "rooms", data: DxfParseResult) => {
    const meta = defaultMetadata();
    let nextRooms = [...roomsRef.current];
    let nextEl = [...elementsRef.current];

    if (mode === "all" || mode === "rooms") {
      for (const r of data.roomShapes) {
        const rn = nextRoomNumber(nextRooms);
        const w = r.width;
        const h = r.height;
        const size_m2 = (w / ppm) * (h / ppm);
        nextRooms.push({
          id: crypto.randomUUID(),
          room_number: rn,
          room_name: "",
          room_type: "other",
          bookable_space_id: null,
          x: r.x,
          y: r.y,
          width: w,
          height: h,
          rotation: 0,
          color: ROOM_TYPE_COLORS.other.fill,
          shape: "polygon",
          polygon_points: r.polygon_points,
          label_x: null,
          label_y: null,
          is_rentable: true,
          metadata: { ...meta, size_m2, capacity: 1, dxf: true, sourceLayer: r.layer },
        });
      }
    }

    if (mode === "all" || mode === "walls") {
      for (const w of data.wallElements) {
        nextEl.push({
          id: crypto.randomUUID(),
          element_type: "wall",
          x: 0,
          y: 0,
          width: null,
          height: null,
          rotation: 0,
          points: w.points,
          style: { stroke: "#000000", strokeWidth: 2, layer: "walls", locked: true, dxf: true, sourceLayer: w.layer },
          label: null,
        });
      }
      for (const d of data.dimensionElements) {
        nextEl.push({
          id: crypto.randomUUID(),
          element_type: "dimension_line",
          x: 0,
          y: 0,
          width: null,
          height: null,
          rotation: 0,
          points: d.points,
          style: { stroke: "#6b7280", strokeWidth: 1, layer: "walls", locked: true, dxf: true, sourceLayer: d.layer },
          label: null,
        });
      }
    }

    if (mode === "all") {
      for (const L of data.labelElements) {
        nextEl.push({
          id: crypto.randomUUID(),
          element_type: "text_label",
          x: L.x,
          y: L.y,
          width: null,
          height: null,
          rotation: 0,
          points: null,
          style: {
            layer: "labels",
            locked: true,
            dxf: true,
            sourceLayer: L.layer,
            fontSize: L.textHeight && L.textHeight > 4 ? Math.min(48, L.textHeight) : undefined,
          },
          label: L.text,
        });
      }
    }

    roomsRef.current = nextRooms;
    elementsRef.current = nextEl;
    setRooms(nextRooms);
    setElements(nextEl);
    pushHistory({ rooms: nextRooms, elements: nextEl });
    setDxfPreview(null);
    setDirty(true);
  };

  const parseDxfFile = async (file: File | null) => {
    if (!file || !plan) return;
    setDxfBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetWidth", String(Math.round(fpW)));
      fd.append("targetHeight", String(Math.round(fpH)));
      const res = await fetch("/api/floor-plans/import-dxf", { method: "POST", body: fd });
      const json = (await res.json()) as DxfParseResult & { scaleHint?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "DXF import failed");
        return;
      }
      setDxfPreview(json);
    } finally {
      setDxfBusy(false);
    }
  };

  const uploadBackground = async (file: File | null) => {
    if (!file || !plan) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".dwg")) {
      setDwgHelpOpen(true);
      return;
    }
    if (lower.endsWith(".pdf")) {
      const fd = new FormData();
      fd.append("floorPlanId", floorPlanId);
      fd.append("file", file);
      const res = await fetch("/api/floor-plans/background-pdf", { method: "POST", body: fd });
      const json = (await res.json()) as { publicUrl?: string; error?: string; hint?: string; fallback?: boolean };
      if (res.ok && json.publicUrl) {
        if (planRef.current) {
          const n = { ...planRef.current, background_image_url: json.publicUrl, show_background: true };
          planRef.current = n;
          setPlan(n);
        }
        setDirty(true);
        await save();
        return;
      }
      if (json.fallback || res.status === 503) {
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
          const buf = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: buf }).promise;
          const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas");
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
          if (!blob) throw new Error("Blob");
          const pngFile = new File([blob], "plan-page1.png", { type: "image/png" });
          const supabase = getSupabaseClient();
          const path = `${plan.tenant_id}/${floorPlanId}/${Date.now()}-plan-page1.png`;
          const { error: upErr } = await supabase.storage.from("floor-plan-backgrounds").upload(path, pngFile, { upsert: true });
          if (upErr) throw new Error(upErr.message);
          const { data: pub } = supabase.storage.from("floor-plan-backgrounds").getPublicUrl(path);
          if (planRef.current) {
            const n = { ...planRef.current, background_image_url: pub.publicUrl, show_background: true };
            planRef.current = n;
            setPlan(n);
          }
          setDirty(true);
          await save();
          if (json.hint) setError(`Used browser PDF fallback. ${json.hint}`);
          return;
        } catch (err) {
          setError(
            [json.error, json.hint, err instanceof Error ? err.message : ""].filter(Boolean).join(" — ") ||
              "PDF conversion failed",
          );
          return;
        }
      }
      setError(json.error ?? "PDF upload failed");
      return;
    }

    const supabase = getSupabaseClient();
    const path = `${plan.tenant_id}/${floorPlanId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("floor-plan-backgrounds").upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("floor-plan-backgrounds").getPublicUrl(path);
    if (planRef.current) {
      const n = { ...planRef.current, background_image_url: pub.publicUrl, show_background: true };
      planRef.current = n;
      setPlan(n);
    }
    setDirty(true);
    await save();
  };

  const removeBackground = () => {
    if (planRef.current) {
      const n = { ...planRef.current, background_image_url: null, show_background: false };
      planRef.current = n;
      setPlan(n);
    }
    setBgImage(null);
    setDirty(true);
  };

  const canSelectElement = (el: ElementRow) => {
    const L = elementVisualLayer(el);
    if (L === "labels" && layers.labels.locked) return false;
    if (L === "walls" && layers.walls.locked) return false;
    return true;
  };

  const runExport = async (mode: "all" | "available" | "occupied", format: "png" | "pdf-a4" | "pdf-a3" | "print") => {
    const wrap = exportWrapRef.current;
    if (!wrap) return;
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(floorPlanId)}/occupancy`);
    const occ = (await res.json()) as { rooms?: { id: string; occupancy: string }[] };
    const occMap = Object.fromEntries((occ.rooms ?? []).map((r) => [r.id, r.occupancy]));

    const canvas = await html2canvas(wrap, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const title = plan?.name ?? "Floor plan";
    const dateStr = new Date().toLocaleDateString();

    if (format === "png") {
      const a = document.createElement("a");
      a.href = img;
      a.download = `${title.replace(/\s+/g, "-")}.png`;
      a.click();
      setExportOpen(false);
      return;
    }

    const pdf =
      format === "pdf-a3"
        ? new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" })
        : new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(14);
    pdf.text(title, 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Generated ${dateStr}`, 14, 22);
    pdf.setFontSize(9);
    pdf.text(`Scope: ${mode}`, 14, 28);
    const imgW = pageW - 28;
    const ratio = canvas.height / canvas.width;
    const imgH = Math.min(pageH - 40, imgW * ratio);
    pdf.addImage(img, "PNG", 14, 34, imgW, imgH);
    pdf.setFontSize(8);
    pdf.text("■ Available  ■ Occupied  ■ Reserved  ■ Not rentable", 14, pageH - 14);
    if (format === "print") {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<!doctype html><html><body style="margin:0"><img src="${img}" style="max-width:100%" onload="window.print()"/></body></html>`);
        w.document.close();
      }
    } else {
      pdf.save(`${title.replace(/\s+/g, "-")}.pdf`);
    }
    setExportOpen(false);
  };

  const openImportPreview = async () => {
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(floorPlanId)}`);
    const json = (await res.json()) as { rooms?: RoomRow[] };
    const list = json.rooms ?? [];
    const linked = list.filter((r) => r.bookable_space_id).length;
    const toImport = list.filter((r) => !r.bookable_space_id && r.is_rentable).length;
    setImportPreview({ toImport, linked });
    setImportOpen(true);
  };

  const runImport = async () => {
    const res = await fetch(`/api/floor-plans/${encodeURIComponent(floorPlanId)}/import-rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = (await res.json()) as { error?: string; imported?: number };
    if (!res.ok) setError(json.error ?? "Import failed");
    else {
      setImportOpen(false);
      await load();
    }
  };

  const selectedRoom = selectedId ? rooms.find((r) => r.id === selectedId) : null;

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (error && !plan) return <p style={{ padding: 24, color: "#b00020" }}>{error}</p>;
  if (!plan) return null;

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fafafa",
        }}
      >
        <Link href="/floor-plans" style={{ fontSize: 13 }}>
          ← List
        </Link>
        <Link href={`/floor-plans/${floorPlanId}/view`} style={{ fontSize: 13 }}>
          View
        </Link>
        <input
          value={plan.name}
          onChange={(e) => {
            setPlan((p) => (p ? { ...p, name: e.target.value } : p));
            setDirty(true);
          }}
          style={{ padding: 6, borderRadius: 6, border: "1px solid #ccc", minWidth: 180 }}
        />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Floor
          <input
            type="number"
            value={plan.floor_number}
            onChange={(e) => {
              setPlan((p) => (p ? { ...p, floor_number: Number(e.target.value) } : p));
              setDirty(true);
            }}
            style={{ width: 56, padding: 4 }}
          />
        </label>
        <span style={{ fontSize: 12, color: saveState === "saving" ? "#d97706" : "#059669" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[0.25, 0.5, 0.75, 1].map((z) => (
            <button key={z} type="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setZoom(z)}>
              {z * 100}%
            </button>
          ))}
          <button
            type="button"
            style={{ fontSize: 12, padding: "4px 8px" }}
            onClick={() => {
              const sx = (viewport.w - 40) / fpW;
              const sy = (viewport.h - 40) / fpH;
              const z = Math.min(sx, sy, 1.2);
              setZoom(z);
              setPan({ x: 20, y: 20 });
            }}
          >
            Fit
          </button>
          <button type="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
            +
          </button>
          <button type="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))}>
            −
          </button>
        </div>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          Snap
        </label>
        <button type="button" onClick={() => void save()} style={{ padding: "6px 12px", fontWeight: 600 }}>
          Save
        </button>
        <button type="button" onClick={() => void publish()} style={{ padding: "6px 12px" }}>
          Publish
        </button>
        <button type="button" onClick={() => setExportOpen(true)} style={{ padding: "6px 12px" }}>
          Export
        </button>
        <button type="button" onClick={() => void openImportPreview()} style={{ padding: "6px 12px" }}>
          Import rooms
        </button>
        <button type="button" onClick={() => dxfInputRef.current?.click()} disabled={dxfBusy} style={{ padding: "6px 12px" }}>
          {dxfBusy ? "DXF…" : "Import DXF/CAD"}
        </button>
        <input
          ref={dxfInputRef}
          type="file"
          accept=".dxf"
          hidden
          onChange={(e) => {
            void parseDxfFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => setDwgHelpOpen(true)} style={{ padding: "6px 12px", fontSize: 12 }}>
          DWG help
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside style={{ width: 228, borderRight: "1px solid #e5e7eb", padding: 10, fontSize: 12, overflowY: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Layers</div>
          {(
            [
              ["rooms", "Rooms", "colored fills"],
              ["walls", "Walls", "lines / doors"],
              ["labels", "Labels", "text"],
              ["background", "Background", "floor plan image"],
              ["grid", "Grid", "50cm grid"],
            ] as const
          ).map(([key, title, sub]) => {
            const L = layers[key];
            return (
              <div key={key} style={{ marginBottom: 8, padding: 8, border: "1px solid #eee", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={L.visible}
                    onChange={(e) =>
                      setLayers((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], visible: e.target.checked },
                      }))
                    }
                  />
                  {title}
                </label>
                <div style={{ fontSize: 10, color: "#6b7280", margin: "4px 0 6px 22px" }}>{sub}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginLeft: 22 }}>
                  <input
                    type="checkbox"
                    checked={L.locked}
                    onChange={(e) =>
                      setLayers((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], locked: e.target.checked },
                      }))
                    }
                  />
                  Lock
                </label>
              </div>
            );
          })}
          <div style={{ fontWeight: 600, margin: "16px 0 8px" }}>Background floor plan</div>
          <label style={{ display: "block", marginBottom: 8, padding: "8px 10px", border: "1px solid #ccc", borderRadius: 8, cursor: "pointer", textAlign: "center" }}>
            Upload PDF or image
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.svg"
              hidden
              onChange={(e) => void uploadBackground(e.target.files?.[0] ?? null)}
            />
          </label>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span>Opacity</span>
              <span>{Math.round(num(plan.background_opacity, 0.6) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={num(plan.background_opacity, 0.6)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPlan((p) => (p ? { ...p, background_opacity: v } : p));
                if (planRef.current) planRef.current = { ...planRef.current, background_opacity: v };
                setDirty(true);
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              style={{ fontSize: 11, padding: "4px 8px" }}
              onClick={() => {
                setPlan((p) => (p ? { ...p, show_background: true } : p));
                if (planRef.current) planRef.current = { ...planRef.current, show_background: true };
                setLayers((prev) => ({ ...prev, background: { ...prev.background, visible: true } }));
                setDirty(true);
              }}
            >
              Show
            </button>
            <button
              type="button"
              style={{ fontSize: 11, padding: "4px 8px" }}
              onClick={() => {
                setPlan((p) => (p ? { ...p, show_background: false } : p));
                if (planRef.current) planRef.current = { ...planRef.current, show_background: false };
                setDirty(true);
              }}
            >
              Hide
            </button>
            <button type="button" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => removeBackground()}>
              Remove
            </button>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Tools</div>
          {(
            [
              ["select", "Select (V)"],
              ["pan", "Pan (H)"],
              ["rect_room", "Room ▭"],
              ["polygon_room", "Room ⬡"],
              ["wall", "Wall"],
              ["door", "Door"],
              ["window", "Window"],
              ["pillar", "Pillar"],
              ["text_label", "Text"],
              ["dimension_line", "Dimension"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 6,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #ddd",
                background: tool === t ? "#e0f2fe" : "#fff",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
          <p style={{ color: "#6b7280", marginTop: 12 }}>Scroll wheel zoom. Middle-drag or Space+drag to pan.</p>
        </aside>

        <div ref={containerRef} style={{ flex: 1, position: "relative", minWidth: 0, background: "#f3f4f6" }}>
          <div ref={exportWrapRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <Stage
              width={viewport.w}
              height={viewport.h}
              onWheel={onWheel}
              onDblClick={(e) => {
                e.evt.preventDefault();
                if (tool !== "polygon_room" || polyDraft.length < 3) return;
                finalizePolygonRoom(polyDraft);
              }}
              onMouseDown={(e) => {
                const stage = e.target.getStage();
                if (!stage) return;
                const p = stage.getPointerPosition();
                if (!p) return;
                const panning =
                  e.evt.button === 1 ||
                  (e.evt.button === 0 && spaceDownRef.current) ||
                  (e.evt.button === 0 && tool === "pan");
                if (panning) {
                  e.evt.preventDefault();
                  stage.setAttr("_panStart", { px: p.x, py: p.y, ox: pan.x, oy: pan.y });
                  return;
                }
                if (e.evt.button !== 0) return;
                const tname = typeof (e.target as Konva.Node).name === "function" ? (e.target as Konva.Node).name() : "";
                const onFloor = tname === "floor";
                const { x, y } = contentToFloor(p.x, p.y);
                if (tool === "rect_room" && onFloor) {
                  drawStartRef.current = { x, y };
                  setDrawStart({ x, y });
                  const z = { x, y, w: 0, h: 0 };
                  draftRectRef.current = z;
                  setDraftRect(z);
                }
                if (tool === "polygon_room" && onFloor) {
                  setPolyDraft((d) => [...d, { x, y }]);
                }
                if (tool === "wall" && onFloor) {
                  if (!wallStart) setWallStart({ x, y });
                  else {
                    const el: ElementRow = {
                      id: crypto.randomUUID(),
                      element_type: "wall",
                      x: 0,
                      y: 0,
                      width: null,
                      height: null,
                      rotation: 0,
                      points: [wallStart.x, wallStart.y, x, y],
                      style: { stroke: "#1f2937", strokeWidth: 3 },
                      label: null,
                    };
                    const next = [...elementsRef.current, el];
                    elementsRef.current = next;
                    setElements(next);
                    pushHistory({ rooms: roomsRef.current, elements: next });
                    setWallStart(null);
                  }
                }
                if (tool === "dimension_line" && onFloor) {
                  if (!dimStart) setDimStart({ x, y });
                  else {
                    const el: ElementRow = {
                      id: crypto.randomUUID(),
                      element_type: "dimension_line",
                      x: 0,
                      y: 0,
                      width: null,
                      height: null,
                      rotation: 0,
                      points: [dimStart.x, dimStart.y, x, y],
                      style: { stroke: "#6b7280", strokeWidth: 1 },
                      label: null,
                    };
                    const next = [...elementsRef.current, el];
                    elementsRef.current = next;
                    setElements(next);
                    pushHistory({ rooms: roomsRef.current, elements: next });
                    setDimStart(null);
                  }
                }
                if ((tool === "door" || tool === "window" || tool === "pillar") && onFloor) {
                  const w = tool === "door" ? 28 : tool === "window" ? 36 : 16;
                  const h = tool === "pillar" ? 16 : 8;
                  const el: ElementRow = {
                    id: crypto.randomUUID(),
                    element_type: tool,
                    x: x - w / 2,
                    y: y - h / 2,
                    width: w,
                    height: h,
                    rotation: 0,
                    points: null,
                    style: {},
                    label: null,
                  };
                  const next = [...elementsRef.current, el];
                  elementsRef.current = next;
                  setElements(next);
                  pushHistory({ rooms: roomsRef.current, elements: next });
                }
                if (tool === "text_label" && onFloor) {
                  const text = window.prompt("Label text", "Label");
                  if (text) {
                    const el: ElementRow = {
                      id: crypto.randomUUID(),
                      element_type: "text_label",
                      x,
                      y,
                      width: null,
                      height: null,
                      rotation: 0,
                      points: null,
                      style: {},
                      label: text,
                    };
                    const next = [...elementsRef.current, el];
                    elementsRef.current = next;
                    setElements(next);
                    pushHistory({ rooms: roomsRef.current, elements: next });
                  }
                }
              }}
              onMouseMove={(e) => {
                const stage = e.target.getStage();
                if (!stage) return;
                const ps = stage.getAttr("_panStart") as { px: number; py: number; ox: number; oy: number } | undefined;
                if (ps && (e.evt.buttons === 4 || (e.evt.buttons === 1 && (spaceDownRef.current || tool === "pan")))) {
                  const p = stage.getPointerPosition();
                  if (p) setPan({ x: ps.ox + (p.x - ps.px), y: ps.oy + (p.y - ps.py) });
                  return;
                }
                const p = stage.getPointerPosition();
                if (!p || !drawStartRef.current || tool !== "rect_room") return;
                const { x, y } = contentToFloor(p.x, p.y);
                const s = drawStartRef.current;
                const dr = {
                  x: Math.min(s.x, x),
                  y: Math.min(s.y, y),
                  w: Math.abs(x - s.x),
                  h: Math.abs(y - s.y),
                };
                draftRectRef.current = dr;
                setDraftRect(dr);
              }}
              onMouseUp={(e) => {
                const stage = e.target.getStage();
                stage?.setAttr("_panStart", null);
                const d = draftRectRef.current;
                if (tool === "rect_room" && drawStartRef.current && d && d.w > 4 && d.h > 4) {
                  finalizeRectRoom(d.x, d.y, d.w, d.h);
                }
                drawStartRef.current = null;
                draftRectRef.current = null;
                setDrawStart(null);
                setDraftRect(null);
              }}
            >
              <Layer>
                <Group x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
                  {gridLines}
                  {plan.show_background && layers.background.visible && bgImage ? (
                    <Image
                      image={bgImage}
                      x={0}
                      y={0}
                      width={fpW}
                      height={fpH}
                      opacity={num(plan.background_opacity, 0.6)}
                      listening={false}
                    />
                  ) : null}
                  <Rect
                    name="floor"
                    x={0}
                    y={0}
                    width={fpW}
                    height={fpH}
                    stroke="#cbd5e1"
                    strokeWidth={2 / zoom}
                    fill="white"
                    listening
                  />
                  {elements.map((el) => {
                    const vl = elementVisualLayer(el);
                    if (vl === "walls" && !layers.walls.visible) return null;
                    if (vl === "labels" && !layers.labels.visible) return null;
                    const stroke = String(el.style?.stroke ?? "#374151");
                    const sw = num(el.style?.strokeWidth, 2);
                    if (el.element_type === "wall" && el.points && el.points.length >= 4) {
                      return (
                        <Line
                          key={el.id}
                          points={el.points}
                          stroke={stroke}
                          strokeWidth={sw / zoom}
                          lineCap="round"
                          hitStrokeWidth={10}
                          onClick={() => {
                            if (!canSelectElement(el)) return;
                            setSelectedId(el.id);
                            setTool("select");
                          }}
                        />
                      );
                    }
                    if (el.element_type === "text_label" && el.label) {
                      const fs = num(el.style?.fontSize, 14);
                      return (
                        <Text
                          key={el.id}
                          x={el.x}
                          y={el.y}
                          text={el.label}
                          fontSize={fs / zoom}
                          fill="#111"
                          onClick={() => {
                            if (!canSelectElement(el)) return;
                            setSelectedId(el.id);
                          }}
                        />
                      );
                    }
                    if (el.element_type === "dimension_line" && el.points && el.points.length >= 4) {
                      const [x1, y1, x2, y2] = el.points;
                      const lenM = Math.hypot(x2 - x1, y2 - y1) / ppm;
                      return (
                        <Group key={el.id}>
                          <Line points={el.points} stroke={stroke} strokeWidth={sw / zoom} dash={[6 / zoom, 4 / zoom]} />
                          <Text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 14 / zoom} text={`${lenM.toFixed(2)} m`} fontSize={11 / zoom} fill="#111" />
                        </Group>
                      );
                    }
                    return (
                      <Rect
                        key={el.id}
                        x={el.x}
                        y={el.y}
                        width={num(el.width, 24)}
                        height={num(el.height, 24)}
                        fill={
                          el.element_type === "door"
                            ? "#fde68a"
                            : el.element_type === "window"
                              ? "#bae6fd"
                              : el.element_type === "pillar"
                                ? "#9ca3af"
                                : "#e5e7eb"
                        }
                        stroke="#111"
                        strokeWidth={1 / zoom}
                        rotation={el.rotation}
                        onClick={() => {
                          if (!canSelectElement(el)) return;
                          setSelectedId(el.id);
                        }}
                      />
                    );
                  })}
                  {layers.rooms.visible &&
                    rooms.map((room) => {
                    const rt = (room.room_type as FloorPlanRoomType) in ROOM_TYPE_COLORS ? (room.room_type as FloorPlanRoomType) : "other";
                    const cols = room.color ? { fill: room.color, stroke: "#1f2937" } : ROOM_TYPE_COLORS[rt];
                    const label = [room.room_number, room.room_name].filter(Boolean).join(" · ") || "Room";
                    const lx = room.label_x != null ? num(room.label_x) : room.width / 2;
                    const ly = room.label_y != null ? num(room.label_y) : room.height / 2;
                    return (
                      <Group
                        key={room.id}
                        ref={(n) => {
                          if (n) roomRefs.current[room.id] = n;
                          else delete roomRefs.current[room.id];
                        }}
                        id={room.id}
                        x={room.x}
                        y={room.y}
                        rotation={room.rotation}
                        draggable={tool === "select" && !layers.rooms.locked}
                        onDragEnd={(e) => {
                          pushHistory();
                          const nx = snapPx(e.target.x());
                          const ny = snapPx(e.target.y());
                          e.target.x(nx);
                          e.target.y(ny);
                          setRooms((prev) => {
                            const next = prev.map((r) => (r.id === room.id ? { ...r, x: nx, y: ny } : r));
                            roomsRef.current = next;
                            return next;
                          });
                          setDirty(true);
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          const sx = node.scaleX();
                          const sy = node.scaleY();
                          node.scaleX(1);
                          node.scaleY(1);
                          const w = Math.max(12, snapPx(room.width * sx));
                          const h = Math.max(12, snapPx(room.height * sy));
                          pushHistory();
                          setRooms((prev) => {
                            const next = prev.map((r) =>
                              r.id === room.id
                                ? {
                                    ...r,
                                    x: snapPx(node.x()),
                                    y: snapPx(node.y()),
                                    width: w,
                                    height: h,
                                    rotation: node.rotation(),
                                    metadata: {
                                      ...(r.metadata ?? {}),
                                      size_m2: (w / ppm) * (h / ppm),
                                    },
                                  }
                                : r,
                            );
                            roomsRef.current = next;
                            return next;
                          });
                          setDirty(true);
                        }}
                        onClick={() => {
                          if (tool === "select" && !layers.rooms.locked) setSelectedId(room.id);
                        }}
                        onContextMenu={(e) => {
                          e.evt.preventDefault();
                          setSelectedId(room.id);
                          const m = window.prompt("Room menu: type delete, duplicate, edit, link", "edit");
                          if (m === "delete") deleteSelected();
                        }}
                      >
                        {room.shape === "polygon" && Array.isArray(room.polygon_points) && (room.polygon_points as number[]).length >= 6 ? (
                          <Line
                            points={room.polygon_points as number[]}
                            closed
                            fill={cols.fill}
                            stroke={cols.stroke}
                            strokeWidth={2 / zoom}
                          />
                        ) : (
                          <Rect width={room.width} height={room.height} fill={cols.fill} stroke={cols.stroke} strokeWidth={2 / zoom} />
                        )}
                        <Text
                          x={lx}
                          y={ly}
                          offsetX={label.length * 3.2}
                          offsetY={7 / zoom}
                          text={label}
                          fontSize={Math.min(14, room.width / 8) / zoom}
                          fill="#111"
                          listening={false}
                        />
                      </Group>
                    );
                  })
                  }
                  {draftRect ? (
                    <Rect
                      x={draftRect.x}
                      y={draftRect.y}
                      width={draftRect.w}
                      height={draftRect.h}
                      stroke="#2563eb"
                      dash={[6 / zoom, 4 / zoom]}
                      strokeWidth={2 / zoom}
                    />
                  ) : null}
                  {polyDraft.length > 0 ? (
                    <Line
                      points={polyDraft.flatMap((p) => [p.x, p.y])}
                      stroke="#2563eb"
                      strokeWidth={2 / zoom}
                      dash={[4 / zoom, 4 / zoom]}
                    />
                  ) : null}
                  <Transformer
                    ref={trRef}
                    rotateEnabled
                    borderStroke="#2563eb"
                    anchorStroke="#2563eb"
                    anchorSize={8}
                    boundBoxFunc={(oldBox, newBox) => {
                      if (newBox.width < 12 || newBox.height < 12) return oldBox;
                      return newBox;
                    }}
                  />
                </Group>
              </Layer>
            </Stage>
          </div>
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 24,
              right: 0,
              height: 18,
              pointerEvents: "none",
              fontSize: 10,
              color: "#6b7280",
              display: "flex",
            }}
          >
            {Array.from({ length: Math.ceil(fpW / ppm) + 1 }).map((_, i) => (
              <span key={i} style={{ position: "absolute", left: pan.x + i * ppm * zoom, transform: "translateX(-50%)" }}>
                {i}m
              </span>
            ))}
          </div>
        </div>

        <aside style={{ width: 280, borderLeft: "1px solid #e5e7eb", padding: 12, fontSize: 13, overflowY: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Properties</div>
          {selectedRoom ? (
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                Number
                <input
                  value={selectedRoom.room_number}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRooms((r) => r.map((x) => (x.id === selectedRoom.id ? { ...x, room_number: v } : x)));
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Name
                <input
                  value={selectedRoom.room_name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRooms((r) => r.map((x) => (x.id === selectedRoom.id ? { ...x, room_name: v } : x)));
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Type
                <select
                  value={selectedRoom.room_type}
                  onChange={(e) => {
                    const v = e.target.value as FloorPlanRoomType;
                    const c = ROOM_TYPE_COLORS[v] ?? ROOM_TYPE_COLORS.other;
                    setRooms((r) => r.map((x) => (x.id === selectedRoom.id ? { ...x, room_type: v, color: c.fill } : x)));
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                >
                  {FLOOR_PLAN_ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ROOM_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <p style={{ margin: 0, color: "#555" }}>
                Size: {(((selectedRoom.width / ppm) * selectedRoom.height) / ppm).toFixed(2)} m²
              </p>
              <label style={{ display: "grid", gap: 4 }}>
                Capacity
                <input
                  type="number"
                  min={1}
                  value={num((selectedRoom.metadata as RoomMetadata).capacity, 1)}
                  onChange={(e) => {
                    const c = Number(e.target.value) || 1;
                    setRooms((r) =>
                      r.map((x) => (x.id === selectedRoom.id ? { ...x, metadata: { ...x.metadata, capacity: c } } : x)),
                    );
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Linked space
                <select
                  value={selectedRoom.bookable_space_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setRooms((r) => r.map((x) => (x.id === selectedRoom.id ? { ...x, bookable_space_id: v } : x)));
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                >
                  <option value="">— None —</option>
                  {spaceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.room_number ? `${s.room_number} · ` : "") + (s.name ?? s.id)}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "grid", gap: 6 }}>
                <span>Amenities</span>
                {(
                  [
                    ["whiteboard", "Whiteboard"],
                    ["tv_projector", "TV / projector"],
                    ["video_conferencing", "Video conferencing"],
                    ["natural_light", "Natural light"],
                  ] as const
                ).map(([key, lab]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean((selectedRoom.metadata?.amenities as Record<string, boolean> | undefined)?.[key])}
                      onChange={(e) => {
                        setRooms((r) =>
                          r.map((x) => {
                            if (x.id !== selectedRoom.id) return x;
                            const am = { ...((x.metadata?.amenities as object) ?? {}), [key]: e.target.checked };
                            return { ...x, metadata: { ...x.metadata, amenities: am } };
                          }),
                        );
                        setDirty(true);
                      }}
                    />
                    {lab}
                  </label>
                ))}
              </div>
              <label style={{ display: "grid", gap: 4 }}>
                Notes
                <textarea
                  rows={2}
                  value={String(selectedRoom.metadata?.notes ?? "")}
                  onChange={(e) => {
                    setRooms((r) =>
                      r.map((x) => (x.id === selectedRoom.id ? { ...x, metadata: { ...x.metadata, notes: e.target.value } } : x)),
                    );
                    setDirty(true);
                  }}
                  style={{ padding: 6 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedRoom.is_rentable}
                  onChange={(e) => {
                    setRooms((r) => r.map((x) => (x.id === selectedRoom.id ? { ...x, is_rentable: e.target.checked } : x)));
                    setDirty(true);
                  }}
                />
                Rentable
              </label>
              <button type="button" onClick={deleteSelected} style={{ color: "#b00020" }}>
                Delete room
              </button>
            </div>
          ) : (
            <p style={{ color: "#6b7280" }}>Select a room or element.</p>
          )}
        </aside>
      </div>

      {roomDialog ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: 360, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>New room</div>
            <label style={{ display: "grid", gap: 4 }}>
              Number
              <input value={roomDialog.room_number} onChange={(e) => setRoomDialog((d) => (d ? { ...d, room_number: e.target.value } : d))} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              Name
              <input value={roomDialog.room_name} onChange={(e) => setRoomDialog((d) => (d ? { ...d, room_name: e.target.value } : d))} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              Type
              <select
                value={roomDialog.room_type}
                onChange={(e) => setRoomDialog((d) => (d ? { ...d, room_type: e.target.value as FloorPlanRoomType } : d))}
              >
                {FLOOR_PLAN_ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ROOM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0 }}>Size: {roomDialog.size_m2.toFixed(2)} m²</p>
            <label style={{ display: "grid", gap: 4 }}>
              Capacity
              <input
                type="number"
                min={1}
                value={roomDialog.capacity}
                onChange={(e) => setRoomDialog((d) => (d ? { ...d, capacity: Number(e.target.value) || 1 } : d))}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setRoomDialog(null)}>
                Cancel
              </button>
              <button type="button" onClick={applyRoomDialog} style={{ fontWeight: 600 }}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: 400, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Export</div>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Uses html2canvas on the canvas area plus jsPDF for PDFs.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => void runExport("all", "png")}>
                PNG
              </button>
              <button type="button" onClick={() => void runExport("all", "pdf-a4")}>
                PDF A4
              </button>
              <button type="button" onClick={() => void runExport("all", "pdf-a3")}>
                PDF A3 landscape
              </button>
              <button type="button" onClick={() => void runExport("all", "print")}>
                Print
              </button>
            </div>
            <button type="button" onClick={() => setExportOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {importOpen && importPreview ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: 420, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Import rooms to property</div>
            <p style={{ margin: 0 }}>
              New rentable unlinked rooms: <strong>{importPreview.toImport}</strong>
              <br />
              Already linked: <strong>{importPreview.linked}</strong>
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Creates bookable_spaces, sets is_published = true, and links each floor plan room.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void runImport()} style={{ fontWeight: 600 }}>
                Import all new rooms
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dxfPreview ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: "min(480px, 100%)", maxHeight: "90vh", overflow: "auto", display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>DXF import preview</div>
            <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>Found in your DXF file:</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#444" }}>
              <li>{dxfPreview.summary.wallSegments} wall segments (LINE / open polylines)</li>
              <li>{dxfPreview.summary.closedRooms} closed room shapes</li>
              <li>{dxfPreview.summary.textLabels} text labels</li>
              <li>{dxfPreview.summary.dimensions} dimensions</li>
            </ul>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{dxfPreview.scaleNote}</p>
            {dxfPreview.scaleHint ? <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{dxfPreview.scaleHint}</p> : null}
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              Fitted to your floor canvas ({Math.round(fpW)}×{Math.round(fpH)} px). DXF layers are stored on each entity; use the Layers panel to show/hide or lock walls and labels.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" style={{ fontWeight: 600 }} onClick={() => applyDxfImport("all", dxfPreview)}>
                Import all
              </button>
              <button type="button" onClick={() => applyDxfImport("walls", dxfPreview)}>
                Walls only
              </button>
              <button type="button" onClick={() => applyDxfImport("rooms", dxfPreview)}>
                Rooms only
              </button>
              <button type="button" onClick={() => setDxfPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dwgHelpOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              padding: 22,
              borderRadius: 12,
              width: "min(440px, 100%)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 17 }}>Have a DWG file?</div>
            <p style={{ margin: "0 0 10px", color: "#444", lineHeight: 1.5 }}>
              DWG is Autodesk&apos;s proprietary format. Please convert it to DXF first:
            </p>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Option 1: In AutoCAD</p>
            <p style={{ margin: "0 0 12px", color: "#555" }}>File → Save As → AutoCAD DXF</p>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Option 2: Free online converter</p>
            <p style={{ margin: "0 0 14px", color: "#555" }}>
              <a href="https://convertio.co" target="_blank" rel="noreferrer">
                convertio.co
              </a>{" "}
              or{" "}
              <a href="https://cloudconvert.com" target="_blank" rel="noreferrer">
                cloudconvert.com
              </a>
              — upload DWG, download DXF, then use &quot;Import DXF/CAD&quot;.
            </p>
            <button type="button" style={{ padding: "8px 16px", fontWeight: 600 }} onClick={() => setDwgHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <WindowSpaceListener
        onDown={() => {
          spaceDownRef.current = true;
        }}
        onUp={() => {
          spaceDownRef.current = false;
        }}
      />
    </main>
  );
}

function WindowSpaceListener({ onDown, onUp }: { onDown: () => void; onUp: () => void }) {
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) {
          e.preventDefault();
        }
        onDown();
      }
    };
    const u = (e: KeyboardEvent) => {
      if (e.code === "Space") onUp();
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, [onDown, onUp]);
  return null;
}
