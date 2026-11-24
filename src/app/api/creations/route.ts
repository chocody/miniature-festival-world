import { getDefaultCreateCreationDeps, handleCreateCreation } from "@/services/api/createCreation";
import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleListCreations } from "@/services/api/listCreations";

/** GET /api/creations?event=<FestivalEventId>&zone=<integer ≥ 1> — public zone list (backlog 2.2). */
export async function GET(request: Request): Promise<Response> {
  return handleListCreations(request, getCreationRepository);
}

/** POST /api/creations — the server write path (backlog 2.4). Body: CreateCreationRequestBody (JSON). */
export async function POST(request: Request): Promise<Response> {
  return handleCreateCreation(request, getDefaultCreateCreationDeps());
}
