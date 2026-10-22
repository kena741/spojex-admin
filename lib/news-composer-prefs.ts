/** Per-organization category / source preferences for the news composer. */

const KEY = "spojex.admin.newsComposerPrefs";
const RECENT_ORGS_KEY = "spojex.admin.newsRecentOrgs";
const MAX_RECENT_ORGS = 6;

type OrgPrefs = {
  category?: string;
  source?: string;
};

type PrefsMap = Record<string, OrgPrefs>;

function readPrefs(): PrefsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PrefsMap) : {};
  } catch {
    return {};
  }
}

function writePrefs(map: PrefsMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function loadOrgComposerPrefs(orgId: string): OrgPrefs {
  if (!orgId) return {};
  return readPrefs()[orgId] ?? {};
}

export function saveOrgComposerPrefs(orgId: string, patch: OrgPrefs) {
  if (!orgId) return;
  const map = readPrefs();
  map[orgId] = { ...map[orgId], ...patch };
  writePrefs(map);
}

export function rememberRecentOrg(org: { id: string; name: string; logo_url?: string | null }) {
  if (typeof window === "undefined" || !org.id) return;
  try {
    const raw = localStorage.getItem(RECENT_ORGS_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; name: string; logo_url?: string | null }>) : [];
    const next = [
      { id: org.id, name: org.name, logo_url: org.logo_url ?? null },
      ...list.filter((item) => item.id !== org.id),
    ].slice(0, MAX_RECENT_ORGS);
    localStorage.setItem(RECENT_ORGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function loadRecentOrgs(): Array<{ id: string; name: string; logo_url?: string | null }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_ORGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<{ id: string; name: string; logo_url?: string | null }>) : [];
  } catch {
    return [];
  }
}

/** Draft session key so refresh can restore an in-progress composer draft id. */
const DRAFT_SESSION_KEY = "spojex.admin.newsComposerDraft";

export function rememberComposerDraftId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!id) sessionStorage.removeItem(DRAFT_SESSION_KEY);
    else sessionStorage.setItem(DRAFT_SESSION_KEY, id);
  } catch {
    // ignore
  }
}

export function loadComposerDraftId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(DRAFT_SESSION_KEY);
  } catch {
    return null;
  }
}
