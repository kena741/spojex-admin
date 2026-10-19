"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSpojexClient } from "@/lib/spojex/client";
import type { OrganizationRow } from "@/lib/types";

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary";

type NewsOrgPickerProps = {
  value: string;
  disabled?: boolean;
  onChange: (orgId: string, org?: OrganizationRow) => void;
};

/** Required publishing organization for Sport news. */
export function NewsOrgPicker({
  value,
  disabled,
  onChange,
}: NewsOrgPickerProps) {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const appliedDefault = useRef(false);

  useEffect(() => {
    getSpojexClient()
      .from("organizations")
      .select("id, name, public_id, logo_url, user_id, is_platform, verified")
      .order("is_platform", { ascending: false })
      .order("name")
      .limit(200)
      .then(({ data }) => {
        setOrgs((data ?? []) as OrganizationRow[]);
      });
  }, []);

  useEffect(() => {
    if (disabled || value || appliedDefault.current || orgs.length === 0) return;
    const platform = orgs.find((item) => item.is_platform);
    if (!platform?.id) return;
    appliedDefault.current = true;
    onChange(platform.id, platform);
  }, [disabled, onChange, orgs, value]);

  const selected = orgs.find((item) => item.id === value);

  return (
    <label className="grid gap-1 text-sm">
      <span className="mb-1 flex items-baseline gap-1.5 text-text-secondary">
        Publishing organization
        <span className="text-[11px] font-normal text-rose-600">required</span>
      </span>
      <select
        className={fieldClass}
        disabled={disabled}
        value={value}
        required
        onChange={(event) => {
          const next = event.target.value;
          if (!next.trim()) return;
          const org = orgs.find((item) => item.id === next);
          onChange(next, org);
        }}
      >
        {!value ? <option value="">Select organization…</option> : null}
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.is_platform ? "★ " : ""}
            {org.name}
            {org.is_platform ? " (SpoJex)" : ""}
            {org.verified ? " ✓" : ""}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="text-xs text-text-secondary">
          Shown as the poster name on Sport videos ·{" "}
          <Link
            href={`/admin/organizations/${selected.id}`}
            className="text-primary underline"
          >
            View org
          </Link>
        </p>
      ) : (
        <p className="text-xs text-rose-600">
          Pick the organization that published this story. Source label is
          optional and appears under the title only.
        </p>
      )}
    </label>
  );
}
