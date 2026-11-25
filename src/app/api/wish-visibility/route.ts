import { getDefaultWishVisibilitySwitchDeps, handleWishVisibilitySwitch } from "@/services/api/wishVisibilitySwitch";

/** POST /api/wish-visibility — owner proof, then open or close the creation's wish (backlog 12.1). Body: WishVisibilityRequestBody (JSON). */
export async function POST(request: Request): Promise<Response> {
  return handleWishVisibilitySwitch(request, getDefaultWishVisibilitySwitchDeps());
}
