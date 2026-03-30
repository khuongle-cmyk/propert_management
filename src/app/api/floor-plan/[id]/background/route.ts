import { handleFloorPlanBackgroundUpload } from "@/lib/floor-plans/handle-background-upload";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Alias for `/api/floor-plans/[id]/background` (same behavior). */
export async function POST(req: Request, ctx: Ctx) {
  const { id: floorPlanId } = await ctx.params;
  return handleFloorPlanBackgroundUpload(req, floorPlanId);
}
