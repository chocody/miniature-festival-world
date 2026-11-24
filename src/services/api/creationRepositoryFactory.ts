import {
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SUPABASE_URL_ENV,
} from "@/config/database.config";
import { CreationRepositoryError, type CreationRepository } from "./creationRepository";
import { createInMemoryCreationRepository } from "./inMemoryCreationRepository";
import { createSupabaseCreationRepository } from "./supabaseCreationRepository";

export type BackendEnv = Readonly<Record<string, string | undefined>>;

/** Both env vars set → Supabase; both absent/blank → in-memory; exactly one → CreationRepositoryError("backend_misconfigured", <env name>). */
export function createCreationRepositoryFromEnv(env: BackendEnv): CreationRepository {
  const url = env[SUPABASE_URL_ENV]?.trim() ?? "";
  const key = env[SUPABASE_SERVICE_ROLE_KEY_ENV]?.trim() ?? "";
  if (url === "" && key === "") return createInMemoryCreationRepository();
  if (url === "") throw new CreationRepositoryError("backend_misconfigured", SUPABASE_URL_ENV);
  if (key === "") throw new CreationRepositoryError("backend_misconfigured", SUPABASE_SERVICE_ROLE_KEY_ENV);
  return createSupabaseCreationRepository({ url, serviceRoleKey: key });
}

let cached: CreationRepository | null = null;
/** Process-wide repository for route handlers. Reads process.env on first successful call; a throw is not cached. */
export function getCreationRepository(): CreationRepository {
  cached ??= createCreationRepositoryFromEnv(process.env);
  return cached;
}
