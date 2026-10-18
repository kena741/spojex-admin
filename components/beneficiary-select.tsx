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
};

type Option = {
  value: string;
  label: string;
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
 * Picks a gift beneficiary by org/person name.
 * Value is always a user id (org owner or person). Empty string = Spojex default.
 */
export default function BeneficiarySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

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
          .limit(200),
        spojex
          .from("users")
          .select("id, display_name, full_name, username")
          .order("display_name")
          .limit(300),
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
        label: "Spojex (platform org) — default",
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
        label: `${org.name} (organization)`,
        kind: "org",
      });
    }

    for (const user of users) {
      const uid = String(user.id);
      if (!uid || seenUsers.has(uid)) continue;
      seenUsers.add(uid);
      list.push({
        value: uid,
        label: `${personLabel(user)} (person)`,
        kind: "person",
      });
    }

    // Ensure current value appears even if outside the loaded lists.
    if (value && !list.some((o) => o.value === value)) {
      const user = users.find((u) => u.id === value);
      const org = orgs.find((o) => o.user_id === value);
      list.push({
        value,
        label: org
          ? `${org.name} (organization)`
          : user
            ? `${personLabel(user)} (person)`
            : "Selected beneficiary",
        kind: org ? "org" : "person",
      });
    }

    return list;
  }, [orgs, users, platformUserId, value]);

  // Normalize: stored platform user id displays as the default "" option.
  const selectValue =
    value && platformUserId && value === platformUserId ? "" : value;

  const selectedLabel = useMemo(() => {
    if (!selectValue) return "Spojex (platform org)";
    return options.find((o) => o.value === selectValue)?.label ?? "Selected";
  }, [options, selectValue]);

  return (
    <label className="grid gap-1 text-sm">
      <span className="text-text-secondary">Beneficiary (receives gift coins)</span>
      <select
        disabled={disabled || loading}
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border px-3 text-sm"
      >
        {options.map((opt) => (
          <option key={`${opt.kind}-${opt.value || "default"}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-text-secondary">
        {loading ? "Loading…" : `Gifts credit: ${selectedLabel}`}
      </span>
    </label>
  );
}
