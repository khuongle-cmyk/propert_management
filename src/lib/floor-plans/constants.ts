export const FLOOR_PLAN_ROOM_TYPES = [
  "office",
  "meeting_room",
  "hot_desk",
  "venue",
  "corridor",
  "bathroom",
  "kitchen",
  "storage",
  "other",
] as const;

export type FloorPlanRoomType = (typeof FLOOR_PLAN_ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<FloorPlanRoomType, string> = {
  office: "Office",
  meeting_room: "Meeting room",
  hot_desk: "Hot desk",
  venue: "Venue",
  corridor: "Corridor",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  storage: "Storage",
  other: "Other",
};

/** Fill + stroke for Konva rooms by type */
export const ROOM_TYPE_COLORS: Record<
  FloorPlanRoomType,
  { fill: string; stroke: string }
> = {
  office: { fill: "#e8f4f3", stroke: "#1a4a4a" },
  meeting_room: { fill: "#e8f0ff", stroke: "#2563eb" },
  hot_desk: { fill: "#fff8e8", stroke: "#d97706" },
  venue: { fill: "#f3e8ff", stroke: "#7c3aed" },
  corridor: { fill: "#f5f5f5", stroke: "#9ca3af" },
  bathroom: { fill: "#f0f8ff", stroke: "#0369a1" },
  kitchen: { fill: "#fff0f0", stroke: "#dc2626" },
  storage: { fill: "#f9f9f9", stroke: "#6b7280" },
  other: { fill: "#f3f4f6", stroke: "#4b5563" },
};

export const FLOOR_PLAN_ELEMENT_TYPES = [
  "wall",
  "door",
  "window",
  "staircase",
  "elevator",
  "pillar",
  "text_label",
  "dimension_line",
  "arrow",
] as const;

export type FloorPlanElementType = (typeof FLOOR_PLAN_ELEMENT_TYPES)[number];

/** Map editor room_type → bookable_spaces.space_type */
export function roomTypeToBookableSpaceType(roomType: string): "office" | "conference_room" | "venue" | "hot_desk" {
  switch (roomType) {
    case "meeting_room":
      return "conference_room";
    case "hot_desk":
      return "hot_desk";
    case "venue":
      return "venue";
    case "office":
    case "corridor":
    case "bathroom":
    case "kitchen":
    case "storage":
    case "other":
    default:
      return "office";
  }
}

export type OccupancyKind = "available" | "occupied" | "reserved" | "not_rentable" | "unlinked";

export type RoomMetadata = {
  size_m2?: number;
  capacity?: number;
  amenities?: {
    whiteboard?: boolean;
    tv_projector?: boolean;
    video_conferencing?: boolean;
    natural_light?: boolean;
  };
  notes?: string;
};

export function defaultMetadata(): RoomMetadata {
  return {
    capacity: 1,
    amenities: {
      whiteboard: false,
      tv_projector: false,
      video_conferencing: false,
      natural_light: false,
    },
    notes: "",
  };
}
