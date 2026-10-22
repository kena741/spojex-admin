"use client";

import { useEffect, useState } from "react";
import {
  clearIdentityCatalogCache,
  fetchIdentityCatalog,
  peekIdentityCatalogCache,
  roleLabelFromCatalog,
  roleOptionsFromCatalog,
  extraProfileTableForSlug,
  type IdentityCatalog,
} from "@/lib/identity-catalog";
import { invalidateAdminCache } from "@/lib/admin-session-cache";
import { getSpojexClient } from "@/lib/spojex/client";

export { clearIdentityCatalogCache };

async function adminHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const { data } = await getSpojexClient().auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: await adminHeaders(init.headers),
  });
}

/** Map API paths to session-cache prefixes invalidated after mutations. */
function invalidateForPath(path: string) {
  try {
    const url = path.startsWith("http") ? new URL(path) : new URL(path, "http://local");
    const parts = url.pathname.split("/").filter(Boolean);
    // /api/admin/people/… → people ; /api/admin/finance/transactions → finance
    const adminIdx = parts.indexOf("admin");
    if (adminIdx >= 0 && parts[adminIdx + 1]) {
      invalidateAdminCache(parts[adminIdx + 1]);
    }
  } catch {
    // ignore
  }
}

export function useIdentityCatalog() {
  const hit = peekIdentityCatalogCache();
  const [catalog, setCatalog] = useState<IdentityCatalog | null>(() => hit);
  const [loading, setLoading] = useState(() => !hit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const cached = peekIdentityCatalogCache();
    if (cached) {
      setCatalog(cached);
      setLoading(false);
      return;
    }
    fetchIdentityCatalog()
      .then((data) => {
        if (mounted) setCatalog(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load roles");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    catalog,
    loading,
    error,
    roleOptions: catalog ? roleOptionsFromCatalog(catalog) : [{ id: "", label: "No role", group: "" }],
    roleLabel: (slug?: string | null) =>
      catalog ? roleLabelFromCatalog(catalog, slug) : slug?.replace(/_/g, " ") ?? "No role",
    extraProfileTable: (slug?: string | null) =>
      catalog ? extraProfileTableForSlug(catalog, slug) : "",
  };
}

export async function patchAdmin(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: await adminHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string; data?: unknown };
  if (!response.ok) throw new Error(payload.error || "Update failed");
  invalidateForPath(path);
  return payload.data;
}

export async function postAdmin(path: string, body: Record<string, unknown>) {
  const payload = await postAdminResponse(path, body);
  return payload.data;
}

export async function putAdmin(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "PUT",
    headers: await adminHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string; data?: unknown };
  if (!response.ok) throw new Error(payload.error || "Update failed");
  invalidateForPath(path);
  return payload.data;
}

type AdminPostPayload = {
  error?: string;
  data?: unknown;
  password?: string;
  message?: string;
};

export async function postAdminResponse<T extends object = AdminPostPayload>(
  path: string,
  body: Record<string, unknown>,
): Promise<T & AdminPostPayload> {
  const response = await fetch(path, {
    method: "POST",
    headers: await adminHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & AdminPostPayload;
  if (!response.ok) throw new Error(payload.error || "Create failed");
  invalidateForPath(path);
  return payload;
}

export async function deleteAdmin(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "DELETE",
    headers: await adminHeaders(body ? { "Content-Type": "application/json" } : undefined),
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as {
    error?: string;
    ok?: boolean;
    archived?: boolean;
    deleted?: boolean;
    message?: string;
    data?: unknown;
  };
  if (!response.ok) throw new Error(payload.error || "Delete failed");
  invalidateForPath(path);
  return payload;
}

export async function uploadAdmin(path: string, file: File, fieldName = "file") {
  const body = new FormData();
  body.append(fieldName, file);
  const response = await fetch(path, {
    method: "POST",
    headers: await adminHeaders(),
    credentials: "same-origin",
    body,
  });
  const payload = (await response.json()) as {
    error?: string;
    data?: unknown;
    image_url?: string;
    logo_url?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  invalidateForPath(path);
  return payload;
}
