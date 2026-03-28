import type { CmsPublicSpace } from "@/lib/cms2/types";

/** Row shape from GET /api/spaces/public (nested `properties` from Supabase). */
export type PublicBookableSpaceApiRow = {
  id: string;
  name: string;
  space_type: string;
  capacity: number | null;
  floor: string | null;
  room_number: string | null;
  hourly_price: number | null;
  size_m2?: number | null;
  space_status: string;
  is_published: boolean;
  requires_approval: boolean | null;
  amenity_projector?: boolean | null;
  amenity_whiteboard?: boolean | null;
  amenity_video_conferencing?: boolean | null;
  amenity_kitchen_access?: boolean | null;
  amenity_parking?: boolean | null;
  amenity_natural_light?: boolean | null;
  amenity_air_conditioning?: boolean | null;
  amenity_standing_desk?: boolean | null;
  amenity_phone_booth?: boolean | null;
  amenity_reception_service?: boolean | null;
  properties:
    | {
        id: string;
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      }
    | {
        id: string;
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      }[]
    | null;
};

function originForServerFetch(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Server-only: calls the public spaces API (same pipeline as the browser). */
export async function fetchPublicSpacesFromApi(): Promise<PublicBookableSpaceApiRow[]> {
  const base = originForServerFetch();
  try {
    const res = await fetch(`${base}/api/spaces/public`, { cache: "no-store" });
    const json = (await res.json()) as unknown;
    if (!res.ok) {
      console.warn("[fetchPublicSpacesFromApi] HTTP", res.status, json);
      return [];
    }
    if (json && typeof json === "object" && !Array.isArray(json) && "error" in json) {
      console.warn("[fetchPublicSpacesFromApi] error payload", json);
      return [];
    }
    return Array.isArray(json) ? (json as PublicBookableSpaceApiRow[]) : [];
  } catch (e) {
    console.warn("[fetchPublicSpacesFromApi]", e);
    return [];
  }
}

export function apiRowPropertyName(row: PublicBookableSpaceApiRow): string {
  const p = row.properties;
  if (!p) return "";
  if (Array.isArray(p)) return p[0]?.name?.trim() ?? "";
  return p.name?.trim() ?? "";
}

export function apiRowPropertyId(row: PublicBookableSpaceApiRow): string {
  const p = row.properties;
  if (!p) return "";
  if (Array.isArray(p)) return p[0]?.id ?? "";
  return p.id ?? "";
}

/** Map API row to the shape expected by booking UI (Cms2SpaceDetailClient). */
export function apiRowToCmsPublicSpace(row: PublicBookableSpaceApiRow): CmsPublicSpace {
  return {
    id: row.id,
    propertyId: apiRowPropertyId(row),
    propertyName: apiRowPropertyName(row),
    name: row.name,
    spaceType: row.space_type,
    hourlyPrice: Number(row.hourly_price) || 0,
    capacity: Number(row.capacity) || 1,
    requiresApproval: Boolean(row.requires_approval),
  };
}
