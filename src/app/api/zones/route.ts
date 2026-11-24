import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleZoneDirectory } from "@/services/api/zoneDirectory";

/** GET /api/zones?event=<FestivalEventId> — number of open river-bend zones (backlog 5.3). */
export async function GET(request: Request): Promise<Response> {
  return handleZoneDirectory(request, getCreationRepository);
}
