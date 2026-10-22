import { createSpojexClient, type SpojexClient } from "@/lib/api/client";
import type { SpojexSession } from "@/lib/api/session";
import { requestServerSession } from "@/lib/spojex/server";

/**
 * Server-side Spojex client. Lazily reads the admin Bearer session from cookies/headers.
 */
export function createAdminClient(session?: SpojexSession | null): SpojexClient {
  if (session) {
    let current: SpojexSession | null = session;
    return createSpojexClient({
      getSession: () => current,
      saveSession: (next) => {
        current = next;
      },
    });
  }

  return createSpojexClient({
    getSession: () => requestServerSession(),
    saveSession: () => undefined,
  });
}

export async function createAdminClientFromRequest(): Promise<SpojexClient> {
  const session = await requestServerSession();
  return createAdminClient(session);
}

/** Always true - Spojex API auth is JWT + admin table. */
export function canUseAdminClient() {
  return true;
}
