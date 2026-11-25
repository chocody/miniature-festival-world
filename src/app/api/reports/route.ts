import { getCreationRepository } from "@/services/api/creationRepositoryFactory";
import { handleReportCreation } from "@/services/api/reportHandler";

/** POST /api/reports — body { creationId } (backlog 2.3 "Report button endpoint"). */
export async function POST(request: Request): Promise<Response> {
  return handleReportCreation(request, getCreationRepository);
}
