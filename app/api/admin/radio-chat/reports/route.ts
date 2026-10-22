import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyRadioChat } from "@/lib/radio-chat-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission([
    "streams:read",
    "reports:read",
    "messages:read",
  ]);
  if (!auth.ok) return auth.error;
  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["q", "stream_id", "status", "page", "page_size"]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const stream = incoming.searchParams.get("stream");
  if (stream && !params.has("stream_id")) params.set("stream_id", stream);
  // Default queue: unresolved work (open|pending|in_review)
  if (!params.has("status")) params.set("status", "unresolved");
  return proxyRadioChat("/reports", { searchParams: params });
}
