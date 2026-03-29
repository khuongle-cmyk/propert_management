import { Helper } from "dxf";

const TARGET_DEFAULT_W = 1000;
const TARGET_DEFAULT_H = 800;
const PAD = 24;

export type DxfWallElement = {
  points: number[];
  layer?: string;
};

export type DxfRoomShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  polygon_points: number[];
  layer?: string;
};

export type DxfLabelElement = {
  x: number;
  y: number;
  text: string;
  textHeight?: number;
  layer?: string;
};

export type DxfDimensionElement = {
  points: number[];
  layer?: string;
};

export type DxfParseResult = {
  summary: {
    wallSegments: number;
    closedRooms: number;
    textLabels: number;
    dimensions: number;
  };
  scaleNote: string;
  /** Drawing units (width of bbox) → how many fit across target width */
  drawingUnitsPerTargetWidth: number;
  targetWidth: number;
  targetHeight: number;
  wallElements: DxfWallElement[];
  roomShapes: DxfRoomShape[];
  labelElements: DxfLabelElement[];
  dimensionElements: DxfDimensionElement[];
};

type DxfEntity = Record<string, unknown> & { type?: string };

function cleanMtext(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\\P/g, "\n")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/\\[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function collectPointsForEntity(e: DxfEntity, out: { x: number; y: number }[]): void {
  const t = e.type;
  if (t === "LINE") {
    const s = e.start as { x?: number; y?: number } | undefined;
    const end = e.end as { x?: number; y?: number } | undefined;
    if (s && typeof s.x === "number" && typeof s.y === "number") out.push({ x: s.x, y: s.y });
    if (end && typeof end.x === "number" && typeof end.y === "number") out.push({ x: end.x, y: end.y });
    return;
  }
  if (t === "LWPOLYLINE") {
    const verts = e.vertices as { x?: number; y?: number }[] | undefined;
    if (verts) for (const v of verts) if (typeof v.x === "number" && typeof v.y === "number") out.push({ x: v.x, y: v.y });
    return;
  }
  if (t === "POLYLINE") {
    const verts = e.vertices as { x?: number; y?: number }[] | undefined;
    if (verts) for (const v of verts) if (typeof v.x === "number" && typeof v.y === "number") out.push({ x: v.x, y: v.y });
    return;
  }
  if (t === "TEXT" || t === "MTEXT") {
    const x = e.x as number | undefined;
    const y = e.y as number | undefined;
    if (typeof x === "number" && typeof y === "number") out.push({ x, y });
    return;
  }
  if (t === "DIMENSION") {
    const ms = e.measureStart as { x?: number; y?: number } | undefined;
    const me = e.measureEnd as { x?: number; y?: number } | undefined;
    if (ms && typeof ms.x === "number" && typeof ms.y === "number") out.push({ x: ms.x, y: ms.y });
    if (me && typeof me.x === "number" && typeof me.y === "number") out.push({ x: me.x, y: me.y });
    const tm = e.textMidpoint as { x?: number; y?: number } | undefined;
    if (tm && typeof tm.x === "number" && typeof tm.y === "number") out.push({ x: tm.x, y: tm.y });
  }
}

function bboxOf(points: { x: number; y: number }[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function parseDxfString(
  dxfString: string,
  targetW = TARGET_DEFAULT_W,
  targetH = TARGET_DEFAULT_H,
): DxfParseResult {
  const helper = new Helper(dxfString);
  const entities = (helper.parsed.entities ?? []) as DxfEntity[];

  const allPts: { x: number; y: number }[] = [];
  for (const e of entities) collectPointsForEntity(e, allPts);
  const bb = bboxOf(allPts);
  if (!bb) {
    return {
      summary: { wallSegments: 0, closedRooms: 0, textLabels: 0, dimensions: 0 },
      scaleNote: "No drawable geometry found in DXF.",
      drawingUnitsPerTargetWidth: 1,
      targetWidth: targetW,
      targetHeight: targetH,
      wallElements: [],
      roomShapes: [],
      labelElements: [],
      dimensionElements: [],
    };
  }

  const w = Math.max(bb.maxX - bb.minX, 1e-6);
  const h = Math.max(bb.maxY - bb.minY, 1e-6);
  const scale = Math.min((targetW - 2 * PAD) / w, (targetH - 2 * PAD) / h);

  const mapX = (x: number) => PAD + (x - bb.minX) * scale;
  const mapY = (y: number) => PAD + (bb.maxY - y) * scale;

  const wallElements: DxfWallElement[] = [];
  const roomShapes: DxfRoomShape[] = [];
  const labelElements: DxfLabelElement[] = [];
  const dimensionElements: DxfDimensionElement[] = [];

  let wallSegments = 0;
  let closedRooms = 0;
  let textLabels = 0;
  let dimensions = 0;

  const layerOf = (e: DxfEntity) => (typeof e.layer === "string" ? e.layer : undefined);

  for (const e of entities) {
    const t = e.type;
    const layer = layerOf(e);

    if (t === "LINE") {
      const s = e.start as { x?: number; y?: number };
      const end = e.end as { x?: number; y?: number };
      if (s && end && typeof s.x === "number" && typeof s.y === "number" && typeof end.x === "number" && typeof end.y === "number") {
        wallElements.push({
          points: [mapX(s.x), mapY(s.y), mapX(end.x), mapY(end.y)],
          layer,
        });
        wallSegments += 1;
      }
      continue;
    }

    if (t === "LWPOLYLINE") {
      const verts = e.vertices as { x?: number; y?: number }[] | undefined;
      if (!verts?.length) continue;
      const pts = verts.filter((v) => typeof v.x === "number" && typeof v.y === "number").map((v) => ({ x: v.x as number, y: v.y as number }));
      if (pts.length < 2) continue;
      const closed = Boolean(e.closed);
      if (closed && pts.length >= 3) {
        const mx = pts.map((p) => mapX(p.x));
        const my = pts.map((p) => mapY(p.y));
        const minPx = Math.min(...mx);
        const maxPx = Math.max(...mx);
        const minPy = Math.min(...my);
        const maxPy = Math.max(...my);
        const flat = pts.flatMap((p) => [mapX(p.x) - minPx, mapY(p.y) - minPy]);
        roomShapes.push({
          x: minPx,
          y: minPy,
          width: Math.max(maxPx - minPx, 8),
          height: Math.max(maxPy - minPy, 8),
          polygon_points: flat,
          layer,
        });
        closedRooms += 1;
      } else {
        const flat = pts.flatMap((p) => [mapX(p.x), mapY(p.y)]);
        wallElements.push({ points: flat, layer });
        wallSegments += Math.max(pts.length - 1, 1);
      }
      continue;
    }

    if (t === "POLYLINE") {
      const verts = e.vertices as { x?: number; y?: number }[] | undefined;
      if (!verts?.length) continue;
      const pts = verts.filter((v) => typeof v.x === "number" && typeof v.y === "number").map((v) => ({ x: v.x as number, y: v.y as number }));
      if (pts.length < 2) continue;
      const closed = Boolean(e.closed);
      if (closed && pts.length >= 3) {
        const mx = pts.map((p) => mapX(p.x));
        const my = pts.map((p) => mapY(p.y));
        const minPx = Math.min(...mx);
        const maxPx = Math.max(...mx);
        const minPy = Math.min(...my);
        const maxPy = Math.max(...my);
        const flat = pts.flatMap((p) => [mapX(p.x) - minPx, mapY(p.y) - minPy]);
        roomShapes.push({
          x: minPx,
          y: minPy,
          width: Math.max(maxPx - minPx, 8),
          height: Math.max(maxPy - minPy, 8),
          polygon_points: flat,
          layer,
        });
        closedRooms += 1;
      } else {
        const flat = pts.flatMap((p) => [mapX(p.x), mapY(p.y)]);
        wallElements.push({ points: flat, layer });
        wallSegments += Math.max(pts.length - 1, 1);
      }
      continue;
    }

    if (t === "TEXT") {
      const str = String(e.string ?? "").trim();
      if (!str) continue;
      const x = e.x as number | undefined;
      const y = e.y as number | undefined;
      if (typeof x !== "number" || typeof y !== "number") continue;
      labelElements.push({
        x: mapX(x),
        y: mapY(y),
        text: str,
        textHeight: typeof e.textHeight === "number" ? e.textHeight * scale : undefined,
        layer,
      });
      textLabels += 1;
      continue;
    }

    if (t === "MTEXT") {
      const str = cleanMtext(String(e.string ?? ""));
      if (!str) continue;
      const x = e.x as number | undefined;
      const y = e.y as number | undefined;
      if (typeof x !== "number" || typeof y !== "number") continue;
      const nh = e.nominalTextHeight as number | undefined;
      labelElements.push({
        x: mapX(x),
        y: mapY(y),
        text: str,
        textHeight: typeof nh === "number" ? nh * scale : undefined,
        layer,
      });
      textLabels += 1;
      continue;
    }

    if (t === "DIMENSION") {
      const ms = e.measureStart as { x?: number; y?: number } | undefined;
      const me = e.measureEnd as { x?: number; y?: number } | undefined;
      if (ms && me && typeof ms.x === "number" && typeof ms.y === "number" && typeof me.x === "number" && typeof me.y === "number") {
        dimensionElements.push({
          points: [mapX(ms.x), mapY(ms.y), mapX(me.x), mapY(me.y)],
          layer,
        });
        dimensions += 1;
      }
    }
  }

  const drawingUnitsPerTargetWidth = w > 0 ? w / (targetW - 2 * PAD) : 1;
  const scaleNote =
    wallSegments + closedRooms + textLabels + dimensions === 0
      ? "No LINE / LWPOLYLINE / TEXT / MTEXT / DIMENSION entities were converted."
      : `Bounding box ${w.toFixed(2)} × ${h.toFixed(2)} drawing units scaled to fit ${Math.round(targetW)}×${Math.round(targetH)} px (Y flipped for screen coordinates).`;

  return {
    summary: {
      wallSegments,
      closedRooms,
      textLabels,
      dimensions,
    },
    scaleNote,
    drawingUnitsPerTargetWidth,
    targetWidth: targetW,
    targetHeight: targetH,
    wallElements,
    roomShapes,
    labelElements,
    dimensionElements,
  };
}
