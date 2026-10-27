import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { proxyProfileCatalog } from "@/lib/profile-catalog-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const READ = ["profile_catalog:read", "profile_catalog:write"];
const WRITE = ["profile_catalog:write", "profile_catalog:publish"];

async function subPath(params: Ctx["params"]) {
  const { path } = await params;
  const parts = (path ?? []).filter((p) => /^[A-Za-z0-9_-]+$/.test(p));
  return parts.length ? `/${parts.join("/")}` : "";
}

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAnyAdminPermission(READ);
  if (!auth.ok) return auth.error;
  return proxyProfileCatalog(await subPath(params), {
    searchParams: new URL(request.url).searchParams,
  });
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAnyAdminPermission([...READ, ...WRITE]);
  if (!auth.ok) return auth.error;
  const body = await request.text();
  return proxyProfileCatalog(await subPath(params), { method: "POST", body: body || "{}" });
}

export async function PUT(request: Request, { params }: Ctx) {
  const auth = await requireAnyAdminPermission(WRITE);
  if (!auth.ok) return auth.error;
  return proxyProfileCatalog(await subPath(params), { method: "PUT", body: await request.text() });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireAnyAdminPermission(WRITE);
  if (!auth.ok) return auth.error;
  return proxyProfileCatalog(await subPath(params), { method: "DELETE" });
}
