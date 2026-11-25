import { getDefaultOwnerWishRevealDeps, handleOwnerWishReveal } from "@/services/api/ownerWishReveal";

/** POST /api/private-wish — owner proof, then the owner's own private wish (backlog 7.2). Body: OwnerWishRevealRequestBody (JSON). */
export async function POST(request: Request): Promise<Response> {
  return handleOwnerWishReveal(request, getDefaultOwnerWishRevealDeps());
}
