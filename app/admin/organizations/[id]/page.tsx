"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, verifiedTone } from "@/components/status-badge";
import { organizationTypeLabel, organizationTypes } from "@/lib/catalog";
import { loadCoinWalletsByUserIds, loadOrgLiveGiftTotals } from "@/lib/coin-wallets";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin } from "@/lib/hooks";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useApplyAdminSnapshot } from "@/lib/use-admin-snapshot";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import type { CoinWalletRow, OrganizationRow } from "@/lib/types";
import { cn, formatCoins, formatDate, locationLabel } from "@/lib/utils";
import {
  AssignManagerModal,
  OrgChatsPanel,
  OrgContentPanel,
} from "@/components/org-manager-panels";

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

type MemberRow = {
  user_id: string;
  member_role: string | null;
  status: string | null;
  joined_at?: string | null;
  assigned_by?: string | null;
  role_updated_at?: string | null;
  users?: {
    id: string;
    display_name: string;
    email: string | null;
    username?: string | null;
    role: string;
    avatar_url?: string | null;
  } | null;
};

type InviteRow = {
  id: string;
  user_id: string;
  status: string;
  kind: string;
  message?: string | null;
  created_at?: string | null;
  users?: { id: string; display_name: string; email: string | null } | null;
};

type LinkedGym = {
  id: string;
  name: string;
  verification_status?: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  summary: string;
  created_at: string;
  admin_email?: string | null;
  admin_name?: string | null;
};

type Tab = "overview" | "content" | "chats" | "activity" | "settings";

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile & location" },
  { id: "media", label: "Media" },
  { id: "staff", label: "Staff & Access" },
  { id: "ownership", label: "Ownership" },
  { id: "history", label: "History" },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

type OrgSnapshot = {
  org: OrganizationRow | null;
  members: MemberRow[];
  ownerCoinWallet: CoinWalletRow | null;
  liveGiftsReceived: number;
  linkedGyms: LinkedGym[];
  invites: InviteRow[];
  auditLogs: AuditRow[];
  newsCount: number;
};

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rememberedTab, setRememberedTab] = useAdminUiState<Tab>(
    `organizations:detail:${id}:tab`,
    "overview",
  );
  const rawTab = searchParams.get("tab") || rememberedTab;
  // Legacy People tab → Settings / Staff & Access (like gyms).
  const tab: Tab =
    rawTab === "people" || rawTab === "team"
      ? "settings"
      : ((rawTab as Tab) || "overview");
  const rawSection = searchParams.get("section") || "";
  const settingsSection: SettingsSection =
    rawTab === "people" || rawTab === "team"
      ? "staff"
      : SETTINGS_SECTIONS.some((item) => item.id === rawSection)
        ? (rawSection as SettingsSection)
        : "profile";
  const { can } = useAdminPermissions();
  const canWrite = can("organizations:write");
  const canVerify = can("organizations:verify");
  const canFinance = can("finance:read") || can("coins:read") || can("wallets:read");
  const fileRef = useRef<HTMLInputElement>(null);

  const [org, setOrg] = useState<OrganizationRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [ownerCoinWallet, setOwnerCoinWallet] = useState<CoinWalletRow | null>(null);
  const [liveGiftsReceived, setLiveGiftsReceived] = useState(0);
  const [linkedGyms, setLinkedGyms] = useState<LinkedGym[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [newsCount, setNewsCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignQuery, setReassignQuery] = useState("");
  const [reassignOptions, setReassignOptions] = useState<
    { id: string; display_name: string; email: string | null; role: string }[]
  >([]);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [assignManagerOpen, setAssignManagerOpen] = useState(false);
  const [managerActionBusy, setManagerActionBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    organization_type: "club",
    city: "",
    country: "",
    currency: "ETB",
    website: "",
    description: "",
  });
  const [deps, setDeps] = useState<Record<string, number | null> | null>(null);

  const setTab = (next: Tab) => {
    setRememberedTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (next !== "settings") params.delete("section");
    else if (!params.get("section")) params.set("section", "profile");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const setSettingsSection = (section: SettingsSection) => {
    setRememberedTab("settings");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "settings");
    if (section === "profile") params.delete("section");
    else params.set("section", section);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const fetchSnapshot = async (): Promise<OrgSnapshot> => {
    const { data, error: loadError } = await getSpojexClient()
      .from("organizations")
      .select(
        "*, users:user_id(id, display_name, email, username, role, avatar_url), deleted_by_user:deleted_by(id, display_name, email)",
      )
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    let next = data as OrganizationRow | null;
    if (!next) {
      return {
        org: null,
        members: [],
        ownerCoinWallet: null,
        liveGiftsReceived: 0,
        linkedGyms: [],
        invites: [],
        auditLogs: [],
        newsCount: 0,
      };
    }

    // Normalize owner user association (join can be null / array-shaped).
    const ownerId = String(next.user_id || "").trim();
    let ownerUser = normalizeUserEmbed(next.users);
    if (ownerId) {
      const ensured = await adminFetch(`/api/admin/organizations/${next.id}/ensure-owner`, {
        method: "POST",
      })
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            owner?: MemberRow["users"];
            owner_user_id?: string;
          };
          return res.ok ? json : null;
        })
        .catch(() => null);
      if (ensured?.owner) ownerUser = normalizeUserEmbed(ensured.owner) ?? ownerUser;
      if (!ownerUser) {
        const { data: u } = await getSpojexClient()
          .from("users")
          .select("id, display_name, email, username, role, avatar_url")
          .eq("id", ownerId)
          .maybeSingle();
        ownerUser = normalizeUserEmbed(u);
      }
    }
    const orgRow: OrganizationRow = {
      ...next,
      user_id: ownerId || next.user_id,
      users: asOrgUser(ownerUser),
    };

    const client = getSpojexClient();
    const [
      wallets,
      liveTotals,
      membersRes,
      managersRes,
      gymsRes,
      invitesRes,
      newsRes,
      auditRes,
    ] = await Promise.all([
      ownerId ? loadCoinWalletsByUserIds([ownerId]) : Promise.resolve({} as Record<string, CoinWalletRow>),
      loadOrgLiveGiftTotals([orgRow.id]),
      client
        .from("organization_members")
        .select(
          "user_id, member_role, status, joined_at, assigned_by, role_updated_at, users:user_id(id, display_name, email, username, role, avatar_url)",
        )
        .eq("organization_id", orgRow.id)
        .limit(500),
      // Dedicated staff endpoint (DB admin) — do not rely only on table scan.
      adminFetch(`/api/admin/organizations/${orgRow.id}/managers`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            managers?: Array<Record<string, unknown>>;
            error?: string;
          };
          if (!res.ok) return [] as MemberRow[];
          return (json.managers ?? []).map((row): MemberRow => {
            const userId = String(row.user_id ?? "");
            const nested = normalizeUserEmbed(row.users) ?? normalizeUserEmbed(row);
            return {
              user_id: userId,
              member_role: "admin",
              status: String(row.status ?? "active"),
              joined_at: (row.joined_at as string | null | undefined) ?? null,
              assigned_by: (row.assigned_by as string | null | undefined) ?? null,
              role_updated_at:
                (row.role_updated_at as string | null | undefined) ?? null,
              users: nested ?? {
                id: userId,
                display_name: String(row.display_name ?? "Staff"),
                email: (row.email as string | null | undefined) ?? null,
                username: (row.username as string | null | undefined) ?? null,
                role: String(row.profile_role ?? row.role ?? ""),
                avatar_url: (row.avatar_url as string | null | undefined) ?? null,
              },
            };
          });
        })
        .catch(() => [] as MemberRow[]),
      client
        .from("gyms")
        .select("id, name, verification_status")
        .eq("organization_id", orgRow.id)
        .limit(50),
      client
        .from("organization_chat_join_requests")
        .select(
          "id, user_id, status, kind, message, created_at, users:user_id(id, display_name, email)",
        )
        .eq("organization_id", orgRow.id)
        .eq("status", "pending")
        .limit(100),
      client
        .from("sport_news")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgRow.id),
      client
        .from("admin_activity_log")
        .select("id, action, summary, created_at, admin_email, admin_name")
        .eq("resource_type", "organization")
        .eq("resource_id", orgRow.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    // Merge table members + managers API so Staff always surfaces.
    const byUser = new Map<string, MemberRow>();
    for (const row of (membersRes.data ?? []) as MemberRow[]) {
      const uid = String(row.user_id || "").trim();
      if (!uid) continue;
      byUser.set(uid, {
        ...row,
        user_id: uid,
        users: normalizeUserEmbed(row.users) ?? row.users ?? null,
      });
    }
    for (const row of managersRes) {
      const uid = String(row.user_id || "").trim();
      if (!uid) continue;
      const existing = byUser.get(uid);
      byUser.set(uid, {
        ...existing,
        ...row,
        user_id: uid,
        member_role: "admin",
        status: row.status || existing?.status || "active",
        users: row.users ?? existing?.users ?? null,
        assigned_by: row.assigned_by ?? existing?.assigned_by,
        role_updated_at: row.role_updated_at ?? existing?.role_updated_at,
        joined_at: row.joined_at ?? existing?.joined_at,
      });
    }

    // Always surface the owner as a member row with the resolved user profile.
    if (ownerId) {
      const existing = byUser.get(ownerId);
      byUser.set(ownerId, {
        user_id: ownerId,
        member_role: "owner",
        status: "active",
        joined_at: existing?.joined_at ?? null,
        assigned_by: existing?.assigned_by ?? null,
        role_updated_at: existing?.role_updated_at ?? null,
        users: ownerUser ?? existing?.users ?? null,
      });
    }

    return {
      org: orgRow,
      members: [...byUser.values()],
      ownerCoinWallet: ownerId ? wallets[ownerId] ?? null : null,
      liveGiftsReceived: liveTotals[orgRow.id] ?? 0,
      linkedGyms: (gymsRes.data ?? []) as LinkedGym[],
      invites: (invitesRes.data ?? []) as InviteRow[],
      auditLogs: (auditRes.data ?? []) as AuditRow[],
      newsCount: newsRes.count ?? 0,
    };
  };

  const {
    data: snapshot,
    loading,
    error: loadError,
    refresh,
  } = useAdminQuery<OrgSnapshot>({
    key: adminCacheKey(["organizations", "detail", id]),
    fetcher: fetchSnapshot,
  });

  useApplyAdminSnapshot(snapshot, (snap) => {
    setOrg(snap.org);
    setMembers(snap.members);
    setOwnerCoinWallet(snap.ownerCoinWallet);
    setLiveGiftsReceived(snap.liveGiftsReceived);
    setLinkedGyms(snap.linkedGyms);
    setInvites(snap.invites);
    setAuditLogs(snap.auditLogs);
    setNewsCount(snap.newsCount);
    const next = snap.org;
    if (next) {
      setDraft({
        name: next.name || "",
        organization_type: next.organization_type || "club",
        city: next.city || "",
        country: next.country || "",
        currency: next.currency || "ETB",
        website: next.website || "",
        description: next.description || "",
      });
    }
  });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  /** Soft reload after a mutation; drop list + this org detail cache. */
  const load = async () => {
    invalidateAdminCache(adminCacheKey(["organizations", "list"]));
    invalidateAdminCache(adminCacheKey(["organizations", "detail", id]));
    const next = await refresh();
    if (!next) throw new Error("Failed to reload organization");
  };

  const people = useMemo(() => {
    const empty = {
      active: [] as MemberRow[],
      owner: [] as MemberRow[],
      staff: [] as MemberRow[],
      members: [] as MemberRow[],
      former: [] as MemberRow[],
    };
    if (!org) return empty;
    const ownerId = String(org.user_id || "").trim();
    const byUser = new Map<string, MemberRow & { isOwner?: boolean }>();
    const roleOf = (m: MemberRow) =>
      String(m.member_role || "")
        .trim()
        .toLowerCase();
    // Owner first — always when a user_id is set (must be a Spojex user).
    if (ownerId) {
      byUser.set(ownerId, {
        user_id: ownerId,
        member_role: "owner",
        status: "active",
        users: normalizeUserEmbed(org.users) ?? null,
        isOwner: true,
      });
    }
    for (const m of members) {
      const uid = String(m.user_id || "").trim();
      if (!uid) continue;
      const existing = byUser.get(uid);
      const incomingRole = roleOf(m);
      if (existing) {
        // Keep owner badge; prefer staff (admin) over plain member when merging.
        const keepOwner = existing.isOwner === true || uid === ownerId;
        const nextRole = keepOwner
          ? "owner"
          : incomingRole === "admin" || roleOf(existing) === "admin"
            ? "admin"
            : incomingRole || roleOf(existing) || "member";
        byUser.set(uid, {
          ...existing,
          ...m,
          user_id: uid,
          member_role: nextRole,
          status: m.status ?? existing.status,
          joined_at: m.joined_at ?? existing.joined_at,
          assigned_by: m.assigned_by ?? existing.assigned_by,
          role_updated_at: m.role_updated_at ?? existing.role_updated_at,
          users: normalizeUserEmbed(m.users) ?? existing.users,
          isOwner: keepOwner,
        });
      } else {
        byUser.set(uid, {
          ...m,
          user_id: uid,
          member_role: incomingRole || m.member_role || "member",
          users: normalizeUserEmbed(m.users) ?? m.users ?? null,
          isOwner: uid === ownerId,
        });
      }
    }
    const all = [...byUser.values()];
    const active = all.filter(
      (m) => String(m.status || "active").toLowerCase() === "active",
    );
    const owner = ownerId
      ? active.filter((m) => m.user_id === ownerId || roleOf(m) === "owner")
      : [];
    const staff = active.filter(
      (m) => m.user_id !== ownerId && roleOf(m) === "admin",
    );
    const chatMembers = active.filter(
      (m) =>
        m.user_id !== ownerId &&
        roleOf(m) !== "owner" &&
        roleOf(m) !== "admin",
    );
    return {
      active,
      owner,
      staff,
      members: chatMembers,
      former: all.filter((m) =>
        ["left", "banned"].includes(String(m.status || "").toLowerCase()),
      ),
    };
  }, [members, org]);

  const dirty = useMemo(() => {
    if (!org || !editing) return false;
    return (
      draft.name !== (org.name || "") ||
      draft.organization_type !== (org.organization_type || "club") ||
      draft.city !== (org.city || "") ||
      draft.country !== (org.country || "") ||
      draft.currency !== (org.currency || "ETB") ||
      draft.website !== (org.website || "") ||
      draft.description !== (org.description || "")
    );
  }, [draft, editing, org]);

  useEffect(() => {
    if (!reassignOpen) return;
    const q = reassignQuery.trim().replace(/[%(),]/g, " ");
    if (q.length < 2) {
      setReassignOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=12`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as {
            data?: { id: string; display_name: string; email: string | null; role: string }[];
          };
          if (!cancelled) setReassignOptions(json.data ?? []);
        })
        .catch(() => {
          if (!cancelled) setReassignOptions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reassignOpen, reassignQuery]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const saveProfile = async () => {
    if (!org || !canWrite) return;
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (draft.currency.trim() && !/^[A-Za-z]{3}$/.test(draft.currency.trim())) {
      setError("Currency must be a 3-letter code (e.g. ETB).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, {
        name: draft.name.trim(),
        organization_type: draft.organization_type,
        city: draft.city.trim(),
        country: draft.country.trim(),
        currency: draft.currency.trim().toUpperCase() || "ETB",
        website: draft.website.trim() || null,
        description: draft.description.trim(),
        expected_updated_at: org.updated_at,
      });
      setEditing(false);
      setNotice("Profile saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleVerified = async () => {
    if (!org || !canVerify) return;
    let reason: string | undefined;
    if (!org.verified) {
      reason = window.prompt("Verification reason (required):") || undefined;
      if (!reason?.trim()) return;
    }
    setError(null);
    try {
      await patchAdmin(`/api/admin/organizations/${id}`, {
        verified: !org.verified,
        reason,
      });
      setNotice(org.verified ? "Unverified." : "Marked verified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification update failed");
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await adminFetch(`/api/admin/organizations/${id}/image`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      await load();
      setNotice("Logo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadDeps = async () => {
    const dry = await adminFetch(`/api/admin/organizations/${id}?dry_run=1`, {
      method: "DELETE",
    });
    const payload = (await dry.json()) as {
      dependencies?: Record<string, number | null>;
      can_delete?: boolean;
      can_purge?: boolean;
      blocking?: Record<string, number>;
      linked_content_count?: number;
      message?: string;
      error?: string;
    };
    setDeps(payload.dependencies ?? null);
    return payload;
  };

  const remove = async () => {
    if (!org || org.is_platform) return;
    const summary = await loadDeps();
    const linked = summary.linked_content_count
      ?? Object.values(summary.dependencies ?? {}).reduce<number>(
        (sum, n) => sum + (typeof n === "number" ? n : 0),
        0,
      );
    const counts = Object.entries(summary.dependencies ?? {})
      .filter(([, n]) => typeof n === "number" && n > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ");
    const confirmMsg =
      linked > 0
        ? `Move this item to Trash? Linked content will be preserved.\n\nLinked: ${counts || linked}`
        : "Move this item to Trash? Linked content will be preserved.";
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/organizations/${id}`);
      setNotice("Moved to Trash. Linked content was preserved.");
      invalidateAdminCache(adminCacheKey(["organizations"]));
      router.replace("/admin/organizations?trash=yes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move to Trash failed");
      setDeleting(false);
    }
  };

  const restoreOrg = async () => {
    if (!org || !canWrite || org.is_platform) return;
    if (!window.confirm(`Restore “${org.name}” from Trash?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/restore`, {
        method: "POST",
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Restore failed");
      setNotice("Organization restored from Trash.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setDeleting(false);
    }
  };

  const purgeOrg = async () => {
    if (!org || !canWrite || org.is_platform || !org.deleted_at) return;
    const summary = await loadDeps();
    const hard = Object.entries(summary.blocking ?? {}).filter(
      ([, n]) => typeof n === "number" && n > 0,
    );
    if (hard.length || summary.can_purge === false) {
      setError(
        `Permanent deletion blocked while linked content remains: ${
          hard.map(([k, n]) => `${k}=${n}`).join(", ") || "see dependencies"
        }. Reassign or unlink first. Financial and audit records are preserved.`,
      );
      return;
    }
    const typed = window.prompt(
      `Permanently delete “${org.name}”? This cannot be undone.\nType the organization name to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== org.name.trim()) {
      setError("Permanent deletion cancelled — name did not match.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: org.name.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Permanent delete failed");
      invalidateAdminCache(adminCacheKey(["organizations"]));
      router.replace("/admin/organizations?trash=yes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permanent delete failed");
      setDeleting(false);
    }
  };

  const submitReassign = async () => {
    if (!org || !canWrite || org.is_platform) return;
    if (!reassignUserId.trim() || !reassignReason.trim()) {
      setError("Select a new owner and provide a reason.");
      return;
    }
    setReassignBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/reassign-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_owner_user_id: reassignUserId.trim(),
          reason: reassignReason.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(payload.error || "Reassign failed");
      setNotice(payload.note || "Owner reassigned. Personal wallets were not moved.");
      setReassignOpen(false);
      setReassignQuery("");
      setReassignUserId("");
      setReassignReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setReassignBusy(false);
    }
  };

  const archiveOrg = async () => {
    if (!org || !canWrite || org.is_platform) return;
    const reason = window.prompt("Archive reason (optional):") ?? "";
    if (!window.confirm(`Archive “${org.name}”? Prefer this over delete when history exists.`))
      return;
    setArchiving(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/organizations/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Archive failed");
      setNotice("Organization archived.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <AdminLoadingRow label="Loading organization…" />;
  if (!org) return <AdminErrorAlert message={error || "Organization not found"} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "content", label: "Content" },
    { id: "chats", label: "Chats" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  const removeStaff = async (userId: string) => {
    if (!canWrite) return;
    if (
      !window.confirm(
        "Remove staff access? They will become a regular member if they still belong to the organization chat.",
      )
    ) {
      return;
    }
    setManagerActionBusy(userId);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/organizations/${id}/managers/${userId}?demote=true`,
        { method: "DELETE" },
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Remove staff failed");
      setNotice("Staff access removed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove staff failed");
    } finally {
      setManagerActionBusy(null);
    }
  };

  const renderPersonRow = (
    m: MemberRow,
    kind: "owner" | "staff" | "member",
  ) => {
    const personId = String(m.users?.id || m.user_id || "").trim();
    const personHref = personId ? `/admin/people/${personId}` : null;
    const displayName = m.users?.display_name?.trim() || "User";
    const username = m.users?.username?.trim() || null;
    const email = m.users?.email?.trim() || null;

    return (
      <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {personHref ? (
            <Link
              href={personHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold hover:opacity-90"
              title="Open user"
            >
              {m.users?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.users.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </Link>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold">
              ?
            </div>
          )}
          <div className="min-w-0">
            {personHref ? (
              <Link
                href={personHref}
                className="text-sm font-medium text-primary hover:underline"
              >
                {displayName}
                {username ? (
                  <span className="ml-1 font-normal text-text-secondary">@{username}</span>
                ) : null}
              </Link>
            ) : (
              <span className="text-sm font-medium">{displayName}</span>
            )}
            <p className="text-xs text-text-secondary">
              {[
                kind === "owner" ? "User" : null,
                email,
                m.users?.role ? formatRole(m.users.role) : null,
                m.joined_at ? `Joined ${formatDate(m.joined_at)}` : null,
                kind === "staff" && m.role_updated_at
                  ? `Staff since ${formatDate(m.role_updated_at)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {kind === "owner" ? (
            <>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                Owner
              </span>
              {personHref ? (
                <Link
                  href={personHref}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View user
                </Link>
              ) : null}
            </>
          ) : null}
          {kind === "staff" ? (
            <>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
                Staff
              </span>
              {canWrite ? (
                <button
                  type="button"
                  disabled={managerActionBusy === m.user_id}
                  onClick={() => void removeStaff(m.user_id)}
                  className="text-xs text-text-secondary hover:text-red-600 disabled:opacity-50"
                >
                  {managerActionBusy === m.user_id ? "…" : "Remove"}
                </button>
              ) : null}
            </>
          ) : null}
          {kind === "member" ? (
            <>
              <span className="rounded border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                {m.member_role === "moderator" ? "Moderator" : "Member"}
              </span>
              {canWrite && !org.is_platform ? (
                <button
                  type="button"
                  disabled={managerActionBusy === m.user_id}
                  onClick={() => {
                    setAssignManagerOpen(true);
                  }}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                  title="Promote to staff via Add staff"
                >
                  Make staff…
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </li>
    );
  };

  const isGymOrg = org.organization_type === "gym";
  const primaryGym = linkedGyms[0] ?? null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={org.name || "Organization"}
        description={
          org.is_platform
            ? `${organizationTypeLabel(org.organization_type)} · Spojex platform org`
            : organizationTypeLabel(org.organization_type)
        }
        backHref="/admin/organizations"
        breadcrumbs={[
          { label: "Organizations", href: "/admin/organizations" },
          { label: org.name || org.public_id },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canVerify && !org.is_platform ? (
              <button
                type="button"
                onClick={() => void toggleVerified()}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {org.verified ? "Unverify" : "Mark verified"}
              </button>
            ) : null}
            <Link
              href="/admin/verifications"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Verification Center
            </Link>
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {isGymOrg ? (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-text-secondary">
          Gym profiles are managed under{" "}
          <Link href="/admin/gyms" className="font-medium text-primary hover:underline">
            Gyms
          </Link>
          {primaryGym ? (
            <>
              .{" "}
              <Link
                href={`/admin/gyms/${primaryGym.id}`}
                className="font-medium text-primary hover:underline"
              >
                Open {primaryGym.name}
              </Link>
            </>
          ) : null}
          .
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved profile changes?")) return;
              if (dirty) setEditing(false);
              setTab(t.id);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-28 w-28 overflow-hidden rounded-2xl border border-border bg-muted">
                {org.logo_url?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary">
                    {(org.name || "O").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <StatusBadge tone={verifiedTone(org.verified)}>
                {org.verified ? "Verified" : "Unverified"}
              </StatusBadge>
              {org.deleted_at ? (
                <StatusBadge tone="danger">In Trash</StatusBadge>
              ) : null}
              {org.archived_at ? (
                <span className="text-xs font-medium text-amber-700">Archived</span>
              ) : null}
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <Row label="Location">{locationLabel(org.city, org.country)}</Row>
              <Row label="Owner (user)">
                {(() => {
                  const owner = people.owner[0];
                  const ownerId = String(owner?.users?.id || owner?.user_id || org.user_id || "").trim();
                  const name =
                    owner?.users?.display_name?.trim() ||
                    org.users?.display_name?.trim() ||
                    null;
                  if (!ownerId) {
                    return <span className="text-amber-700">No user linked</span>;
                  }
                  return (
                    <Link
                      href={`/admin/people/${ownerId}`}
                      className="inline-flex max-w-full items-center gap-2 text-primary hover:underline"
                      title="Open user detail"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[10px] font-semibold text-text-secondary">
                        {(owner?.users?.avatar_url || org.users?.avatar_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(owner?.users?.avatar_url || org.users?.avatar_url)!}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (name || "U").slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="truncate font-medium">
                        {name || "Open user"}
                        {(owner?.users?.username || org.users?.username) ? (
                          <span className="ml-1 font-normal text-text-secondary">
                            @{(owner?.users?.username || org.users?.username)!}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })()}
              </Row>
              <Row label="Public ID">
                <button
                  type="button"
                  className="font-mono text-xs hover:underline"
                  title="Copy"
                  onClick={() => void navigator.clipboard.writeText(org.public_id)}
                >
                  {org.public_id}
                </button>
              </Row>
              <Row label="Updated">{formatDate(org.updated_at || org.created_at)}</Row>
            </dl>
            <p className="mt-3 text-[11px] text-text-hint">
              Org verification is a separate boolean scope from gym verification and from identity
              Verification Center requests.
            </p>
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">About</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                {org.description?.trim() || "No description."}
              </p>
              {org.website ? (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  {org.website}
                </a>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">Org-attributable activity</h2>
              <p className="mt-1 text-xs text-text-hint">
                Live gifts for events hosted by this organization. Personal owner wallet totals are
                not organization balances.
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {formatCoins(liveGiftsReceived)}
              </p>
              <p className="text-xs text-text-secondary">Live gifts received (coins)</p>
              {canFinance && liveGiftsReceived > 0 ? (
                <Link
                  href={`/admin/finance/transactions?q=${encodeURIComponent(org.id)}`}
                  className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                >
                  Open Finance history
                </Link>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-sm font-semibold">Linked products</h2>
              <p className="mt-1 text-xs text-text-hint">
                Links use explicit foreign keys - not name matching. Gym verification is a separate
                scope from organization verification.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <span className="text-text-hint">Gyms: </span>
                  {linkedGyms.length === 0
                    ? "None"
                    : linkedGyms.map((g) => (
                        <span key={g.id} className="mr-3 inline-flex items-center gap-1">
                          <Link href={`/admin/gyms/${g.id}`} className="text-primary hover:underline">
                            {g.name}
                          </Link>
                          {g.verification_status ? (
                            <span className="text-[10px] text-text-hint">
                              (gym: {g.verification_status})
                            </span>
                          ) : null}
                        </span>
                      ))}
                </li>
                <li>
                  <Link
                    href={`/admin/news/new?organization_id=${encodeURIComponent(org.id)}`}
                    className="text-primary hover:underline"
                  >
                    Sport News ({newsCount})
                  </Link>
                </li>
                <li>
                  <Link href="/admin/streams" className="text-primary hover:underline">
                    Streams / radio
                  </Link>
                </li>
                <li>
                  <span className="text-text-hint">Organization chat: </span>
                  membership + owner roles drive chat access
                </li>
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "content" ? <OrgContentPanel orgId={id} /> : null}

      {tab === "chats" ? (
        <OrgChatsPanel orgId={id} pendingInvites={invites} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-heading text-sm font-semibold">Publishing & gifts</h2>
            <p className="text-sm text-text-secondary">
              Sport news attributed to this org: <strong>{newsCount}</strong>
              {" · "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setTab("content")}
              >
                Open Content library
              </button>
            </p>
            <p className="text-sm text-text-secondary">
              Live gifts received by events hosted under this org:{" "}
              <strong className="tabular-nums">{formatCoins(liveGiftsReceived)}</strong> coins.
            </p>
            {canFinance ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">Owner personal wallet (not org balance)</p>
                <p className="mt-1">
                  Lifetime gifts received by owner user:{" "}
                  {formatCoins(ownerCoinWallet?.lifetime_received ?? 0)} · Redeemable:{" "}
                  {formatCoins(ownerCoinWallet?.redeemable_balance ?? 0)}
                </p>
                <p className="mt-1">
                  Live gifts currently credit the owner user account. Do not sum this wallet across
                  multiple organizations.
                </p>
                {org.user_id ? (
                  <Link
                    href={`/admin/people/${org.users?.id || org.user_id}`}
                    className="mt-2 inline-block font-medium text-primary hover:underline"
                  >
                    Open owner user
                  </Link>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-text-hint">
                Personal owner wallet totals require finance/coins permission.
              </p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-sm font-semibold">Administrative audit</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-text-hint">No admin audit events for this organization yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {auditLogs.map((log) => (
                  <li key={log.id} className="py-2.5">
                    <p className="font-medium">{log.summary || log.action}</p>
                    <p className="text-xs text-text-secondary">
                      {log.admin_name || log.admin_email || "Admin"} · {formatDate(log.created_at)} ·{" "}
                      {log.action}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav
            aria-label="Settings sections"
            className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
          >
            {SETTINGS_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSettingsSection(item.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  settingsSection === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-muted hover:text-text-primary",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 space-y-4">
            {settingsSection === "staff" ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-sm font-semibold">Staff &amp; access</h2>
                    <p className="mt-1 text-xs text-text-secondary">
                      Every organization must have an owner linked to a Spojex user. Add staff by
                      @username or email — they get the same day-to-day access as the owner. Chat
                      members are not staff unless added here. Platform profile roles are never
                      overwritten.
                    </p>
                  </div>
                  {canWrite && !org.is_platform ? (
                    <button
                      type="button"
                      onClick={() => setAssignManagerOpen(true)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      Add staff
                    </button>
                  ) : null}
                </div>

                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Owner
                </h3>
                <ul className="mb-4 divide-y divide-border border-b border-border pb-2">
                  {people.owner.map((m) => renderPersonRow(m, "owner"))}
                  {people.owner.length === 0 ? (
                    <li className="space-y-2 py-2 text-sm">
                      <p className="font-medium text-amber-800">No owner user linked</p>
                      <p className="text-xs text-text-secondary">
                        Assign a Spojex user as owner under Ownership. Every organization must have
                        an owner associated with a user account.
                      </p>
                      {canWrite && !org.is_platform ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsSection("ownership");
                            setReassignOpen(true);
                          }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Reassign owner…
                        </button>
                      ) : null}
                    </li>
                  ) : null}
                </ul>

                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Staff ({people.staff.length})
                </h3>
                {people.staff.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                    <p className="text-sm font-medium">No staff yet</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {canWrite
                        ? "Add a Spojex user by @username or email to grant staff access."
                        : "Staff assignments appear here."}
                    </p>
                    {canWrite && !org.is_platform ? (
                      <button
                        type="button"
                        onClick={() => setAssignManagerOpen(true)}
                        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                      >
                        Add staff
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {people.staff.map((m) => renderPersonRow(m, "staff"))}
                  </ul>
                )}
              </section>
            ) : null}

            {settingsSection === "profile" ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-sm font-semibold">Profile &amp; location</h2>
                    <p className="mt-1 text-xs text-text-secondary">
                      Verification is changed from the header actions so each change is audited.
                    </p>
                  </div>
                  {canWrite ? (
                    editing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setEditing(false);
                            setDraft({
                              name: org.name || "",
                              organization_type: org.organization_type || "club",
                              city: org.city || "",
                              country: org.country || "",
                              currency: org.currency || "ETB",
                              website: org.website || "",
                              description: org.description || "",
                            });
                          }}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving || !dirty}
                          onClick={() => void saveProfile()}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {saving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                      >
                        Edit
                      </button>
                    )
                  ) : null}
                </div>

                <fieldset
                  disabled={!editing || !canWrite}
                  className="grid gap-3 sm:grid-cols-2 disabled:opacity-90"
                >
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Name</span>
                    <input
                      className={fieldClass}
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Type</span>
                    <select
                      className={fieldClass}
                      value={draft.organization_type}
                      disabled={isGymOrg}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, organization_type: e.target.value }))
                      }
                    >
                      {isGymOrg ? (
                        <option value="gym">Gym (managed under Gyms)</option>
                      ) : null}
                      {organizationTypes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Currency</span>
                    <input
                      className={fieldClass}
                      value={draft.currency}
                      onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">City</span>
                    <input
                      className={fieldClass}
                      value={draft.city}
                      onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Country</span>
                    <input
                      className={fieldClass}
                      value={draft.country}
                      onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-text-secondary">Website</span>
                    <input
                      className={fieldClass}
                      value={draft.website}
                      onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-text-secondary">Description</span>
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      rows={5}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </label>
                </fieldset>
                {dirty ? (
                  <p className="mt-2 text-xs text-amber-700">You have unsaved changes.</p>
                ) : null}

                <div className="mt-6 border-t border-border pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Verification
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    Status: {org.verified ? "Verified" : "Unverified / pending review"}. Org
                    verification is separate from gym listing verification.
                  </p>
                  {canVerify ? (
                    <button
                      type="button"
                      onClick={() => void toggleVerified()}
                      className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
                    >
                      {org.verified ? "Unverify…" : "Mark verified…"}
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-text-hint">
                      Requires organizations:verify to change verification.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            {settingsSection === "media" ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="font-heading text-sm font-semibold">Media</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Organization logo shown on profile, chats, and content attribution.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-lg font-semibold">
                    {org.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (org.name || "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadLogo(file);
                      }}
                    />
                    {canWrite ? (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                      >
                        {uploading ? "Uploading…" : "Upload logo"}
                      </button>
                    ) : (
                      <p className="text-xs text-text-hint">Read-only</p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {settingsSection === "ownership" ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="font-heading text-sm font-semibold">Ownership</h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Ownership transfer updates canonical owner and memberships only. Personal gift
                    wallets and historical transactions stay with the account holder.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Current owner
                  </h3>
                  <ul className="divide-y divide-border border-b border-border pb-2">
                    {people.owner.map((m) => renderPersonRow(m, "owner"))}
                    {people.owner.length === 0 ? (
                      <li className="py-2 text-sm text-amber-800">
                        No owner user linked. Reassign ownership to a Spojex user.
                      </li>
                    ) : null}
                  </ul>
                </div>
                {canWrite && !org.is_platform ? (
                  <button
                    type="button"
                    onClick={() => setReassignOpen(true)}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Reassign owner…
                  </button>
                ) : org.is_platform ? (
                  <p className="text-sm text-text-secondary">
                    The Spojex platform organization cannot be reassigned.
                  </p>
                ) : null}

                {canWrite && !org.is_platform ? (
                  <div className="border-t border-border pt-4">
                    <h3 className="font-heading text-sm font-semibold">Danger zone</h3>
                    {org.deleted_at ? (
                      <>
                        <p className="mt-2 text-sm text-text-secondary">
                          In Trash since {formatDate(org.deleted_at)}
                          {org.deleted_by_user?.display_name
                            ? ` · by ${org.deleted_by_user.display_name}`
                            : ""}
                          .
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void restoreOrg()}
                            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                          >
                            {deleting ? "Working…" : "Restore"}
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void purgeOrg()}
                            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Delete permanently…
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-sm text-text-secondary">
                          Move to Trash hides the organization from public listings while preserving
                          linked content. Archive keeps it out of active directories without
                          trashing.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={archiving || Boolean(org.archived_at)}
                            onClick={() => void archiveOrg()}
                            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                          >
                            {org.archived_at
                              ? "Already archived"
                              : archiving
                                ? "Archiving…"
                                : "Archive…"}
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() => void remove()}
                            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            {deleting ? "Moving…" : "Move to Trash…"}
                          </button>
                        </div>
                      </>
                    )}
                    {deps ? (
                      <ul className="mt-3 text-xs text-text-secondary">
                        {Object.entries(deps).map(([k, v]) => (
                          <li key={k}>
                            {k}: {v == null ? "Unavailable" : v}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {settingsSection === "history" ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-3 font-heading text-sm font-semibold">History</h2>
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-text-hint">
                    No admin audit events for this organization yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {auditLogs.map((log) => (
                      <li key={log.id} className="py-2.5">
                        <p className="font-medium">{log.summary || log.action}</p>
                        <p className="text-xs text-text-secondary">
                          {log.admin_name || log.admin_email || "Admin"} ·{" "}
                          {formatDate(log.created_at)} · {log.action}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      <AssignManagerModal
        open={assignManagerOpen}
        orgId={id}
        orgName={org.name || "Organization"}
        ownerUserId={org.user_id}
        members={members}
        canWrite={canWrite}
        onClose={() => setAssignManagerOpen(false)}
        onAssigned={async () => {
          setNotice("Staff assigned.");
          await load();
        }}
      />

      {reassignOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="font-heading text-sm font-semibold">Reassign owner</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Current owner user:{" "}
              {org.user_id ? (
                <Link href={`/admin/people/${org.users?.id || org.user_id}`} className="text-primary hover:underline">
                  {org.users?.display_name || "Open user"}
                </Link>
              ) : (
                "none linked"
              )}
              . Wallets are not moved.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-text-secondary">Search user</span>
              <input
                className={fieldClass}
                value={reassignQuery}
                onChange={(e) => {
                  setReassignQuery(e.target.value);
                  setReassignUserId("");
                }}
                placeholder="Name or email"
              />
            </label>
            {reassignOptions.length > 0 ? (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {reassignOptions.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setReassignUserId(u.id);
                        setReassignQuery(u.email || u.display_name);
                      }}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                        reassignUserId === u.id ? "bg-primary/10" : "",
                      )}
                    >
                      <span className="font-medium">{u.display_name}</span>
                      <span className="text-xs text-text-secondary">
                        {[u.email, u.role].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-text-secondary">Reason (required)</span>
              <input
                className={fieldClass}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reassignBusy || !reassignUserId || !reassignReason.trim()}
                onClick={() => void submitReassign()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {reassignBusy ? "Saving…" : "Transfer ownership"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function formatRole(role: string) {
  return role.replace(/_/g, " ");
}

/** PostgREST embeds can be object, array, or null — always normalize to one user. */
function normalizeUserEmbed(raw: unknown): MemberRow["users"] {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const u = row as Record<string, unknown>;
  const id = String(u.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    display_name: String(u.display_name ?? "User"),
    email: (u.email as string | null | undefined) ?? null,
    username: (u.username as string | null | undefined) ?? null,
    role: String(u.role ?? ""),
    avatar_url: (u.avatar_url as string | null | undefined) ?? null,
  };
}

function asOrgUser(
  raw: MemberRow["users"] | null | undefined,
): OrganizationRow["users"] {
  if (!raw) return null;
  return {
    id: raw.id,
    display_name: raw.display_name,
    email: raw.email,
    username: raw.username ?? null,
    role: raw.role,
    avatar_url: raw.avatar_url ?? null,
  };
}
