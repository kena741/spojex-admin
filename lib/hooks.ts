"use client";

import { useEffect, useState } from "react";
import {
  fetchIdentityCatalog,
  roleLabelFromCatalog,
  roleOptionsFromCatalog,
  extraProfileTableForSlug,
  type IdentityCatalog,
} from "@/lib/identity-catalog";
import { getSpojexClient } from "@/lib/spojex/client";

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

export function useIdentityCatalog() {
  const [catalog, setCatalog] = useState<IdentityCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
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
  return payload.data;
}

export async function postAdminResponse(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: await adminHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    error?: string;
    data?: unknown;
    password?: string;
    message?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Create failed");
  return payload;
}

export async function deleteAdmin(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "DELETE",
    headers: await adminHeaders(body ? { "Content-Type": "application/json" } : undefined),
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Delete failed");
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
  return payload;
}
