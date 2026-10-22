"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { loadRecentOrgs, rememberRecentOrg } from "@/lib/news-composer-prefs";
import { getSpojexClient } from "@/lib/spojex/client";
import { toBackendMediaUrl } from "@/lib/spojex-media";
import type { OrganizationRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PostingOrg = Pick<
  OrganizationRow,
  "id" | "name" | "logo_url" | "verified" | "is_platform" | "public_id"
>;

type PostingAsProps = {
  value: string;
  org: PostingOrg | null;
  disabled?: boolean;
  locked?: boolean;
  onChange: (orgId: string, org: PostingOrg) => void;
};

export function PostingAs({ value, org, disabled, locked, onChange }: PostingAsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<PostingOrg[]>([]);
  const [recent, setRecent] = useState<PostingOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecentOrgs() as PostingOrg[]);
    void (async () => {
      try {
        const { data } = await getSpojexClient()
          .from("organizations")
          .select("id, name, public_id, logo_url, is_platform, verified")
          .order("is_platform", { ascending: false })
          .order("name")
          .limit(300);
        const rows = (data ?? []) as PostingOrg[];
        setOrgs(rows);
        if (value && !org) {
          const match = rows.find((item) => item.id === value);
          if (match) onChange(match.id, match);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from value
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.public_id || "").toLowerCase().includes(q),
    );
  }, [orgs, query]);

  const selected = org || orgs.find((item) => item.id === value) || null;

  const pick = (next: PostingOrg) => {
    rememberRecentOrg(next);
    setRecent(loadRecentOrgs() as PostingOrg[]);
    onChange(next.id, next);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || locked}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-sm",
          "hover:bg-muted/40 disabled:opacity-60",
          open && "ring-2 ring-primary/20",
        )}
      >
        <OrgAvatar org={selected} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">
            Posting as
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {selected?.name || (loading ? "Loading…" : "Choose organization")}
          </p>
          {selected ? (
            <p className="text-xs text-text-secondary">
              {selected.verified ? "Verified" : "Unverified"}
              {selected.is_platform ? " · Platform" : ""}
            </p>
          ) : (
            <p className="text-xs text-rose-600">Required before publish</p>
          )}
        </div>
        {!locked ? <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-hint" /> : null}
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-text-hint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search organizations"
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {!query.trim() && recent.length > 0 ? (
              <div className="px-3 py-1.5 text-[11px] font-medium uppercase text-text-hint">
                Recent
              </div>
            ) : null}
            {!query.trim()
              ? recent.map((item) => (
                  <OrgOption
                    key={`recent-${item.id}`}
                    org={item}
                    selected={item.id === value}
                    onPick={pick}
                  />
                ))
              : null}
            <div className="px-3 py-1.5 text-[11px] font-medium uppercase text-text-hint">
              {query.trim() ? "Results" : "All"}
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-secondary">No organizations found.</p>
            ) : (
              filtered.slice(0, 80).map((item) => (
                <OrgOption
                  key={item.id}
                  org={item}
                  selected={item.id === value}
                  onPick={pick}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrgAvatar({ org }: { org: PostingOrg | null }) {
  const src = org?.logo_url ? toBackendMediaUrl(org.logo_url) : "";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-10 w-10 rounded-full object-cover bg-muted" />
    );
  }
  const initial = (org?.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-sm font-semibold text-text-secondary">
      {initial}
    </div>
  );
}

function OrgOption({
  org,
  selected,
  onPick,
}: {
  org: PostingOrg;
  selected: boolean;
  onPick: (org: PostingOrg) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(org)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60",
        selected && "bg-muted/40",
      )}
    >
      <OrgAvatar org={org} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{org.name}</p>
        <p className="text-xs text-text-secondary">
          {org.verified ? "Verified" : "Unverified"}
          {org.is_platform ? " · Platform" : ""}
        </p>
      </div>
      {selected ? <Check className="h-4 w-4 text-primary" /> : null}
    </button>
  );
}
