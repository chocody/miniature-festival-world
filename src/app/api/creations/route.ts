import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleListCreations } from "@/services/api/listCreations";

/** GET /api/creations?event=<FestivalEventId>&zone=<integer ≥ 1> — public zone list (backlog 2.2). */
export async function GET(request: Request): Promise<Response> {
  return handleListCreations(request, getCreationRepository);
}
