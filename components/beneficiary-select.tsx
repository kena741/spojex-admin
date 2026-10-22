"use client";

import { useEffect, useMemo, useState } from "react";
import { getSpojexClient } from "@/lib/spojex/client";

type OrgOption = {
  id: string;
  name: string;
  user_id: string | null;
  is_platform?: boolean;
};

type UserOption = {
  id: string;
  display_name: string | null;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
};

type Option = {
  value: string;
  label: string;
  sublabel: string;
  kind: "org" | "person" | "default";
};

function personLabel(u: UserOption) {
  const name =
    (u.display_name || "").trim() ||
    (u.full_name || "").trim() ||
    (u.username || "").trim();
  return name || "User";
}

/**
 * Searchable beneficiary picker.
 * Value is always a user id (org owner or person). Empty string = Spojex platform default.
 */
export default function BeneficiarySelect({
  value,
  onChange,
  disabled,
  showAttributionHint = true,
}: {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  showAttributionHint?: boolean;
}) {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const spojex = getSpojexClient();
      const [orgRes, userRes] = await Promise.all([
        spojex
          .from("organizations")
          .select("id, name, user_id, is_platform")
          .order("is_platform", { ascending: false })
          .order("name")
          .limit(300),
        spojex
          .from("users")
          .select("id, display_name, full_name, username, email")
          .order("display_name")
          .limit(500),
      ]);
      if (cancelled) return;
      setOrgs((orgRes.data ?? []) as OrgOption[]);
      setUsers((userRes.data ?? []) as UserOption[]);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const platformUserId = useMemo(() => {
    const platform = orgs.find((o) => o.is_platform && o.user_id);
    return platform?.user_id ? String(platform.user_id) : "";
  }, [orgs]);

  const options = useMemo(() => {
    const list: Option[] = [
      {
        value: "",
        label: "Spojex (platform org)",
        sublabel: "Default - platform organization owner wallet",
        kind: "default",
      },
    ];
    const seenUsers = new Set<string>();
    if (platformUserId) seenUsers.add(platformUserId);

    for (const org of orgs) {
      const uid = org.user_id ? String(org.user_id) : "";
      if (!uid || org.is_platform) continue;
      if (seenUsers.has(uid)) continue;
      seenUsers.add(uid);
      list.push({
        value: uid,
        label: org.name,
        sublabel: `Organization · credits owner ${uid.slice(0, 8)}…`,
        kind: "org",
      });
    }
    for (const user of users) {
      const uid = String(user.id);
      if (seenUsers.has(uid)) continue;
      seenUsers.add(uid);
      list.push({
        value: uid,
        label: personLabel(user),
        sublabel: [user.username ? `@${user.username}` : null, user.email]
          .filter(Boolean)
          .join(" · ") || "Person",
        kind: "person",
      });
    }
    return list;
  }, [orgs, users, platformUserId]);

  const selected = useMemo(() => {
    if (!value || value === platformUserId) {
      return options.find((o) => o.value === "") ?? options[0];
    }
    return options.find((o) => o.value === value) ?? {
      value,
      label: `User ${value.slice(0, 8)}…`,
      sublabel: "Selected recipient",
      kind: "person" as const,
    };
  }, [options, value, platformUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter((o) => `${o.label} ${o.sublabel}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [options, query]);

  return (
    <div className="relative space-y-1">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className="flex h-auto min-h-10 w-full items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{selected.label}</span>
          <span className="block truncate text-xs text-text-hint">{selected.sublabel}</span>
        </span>
        <span className="shrink-0 text-xs text-text-secondary">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close beneficiary picker"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card p-2 shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search person or organization…"
              className="mb-2 h-9 w-full rounded-md border border-border px-2 text-sm"
            />
            <ul className="max-h-56 overflow-y-auto">
              {filtered.map((opt) => (
                <li key={`${opt.kind}-${opt.value || "default"}`}>
                  <button
                    type="button"
                    className={`block w-full rounded-md px-2 py-2 text-left hover:bg-muted ${
                      (value || "") === opt.value ||
                      (!value && opt.value === "") ||
                      (value === platformUserId && opt.value === "")
                        ? "bg-muted"
                        : ""
                    }`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs text-text-hint">{opt.sublabel}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-sm text-text-secondary">No matches</li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
      {showAttributionHint ? (
        <p className="text-[11px] text-text-hint">
          Public beneficiary resolves to a user wallet (org owner or person). Changing this does not
          rewrite historical contribution recipients.
        </p>
      ) : null}
    </div>
  );
}
