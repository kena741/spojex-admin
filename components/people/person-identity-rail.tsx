import Link from "next/link";
import { ArrowUpRight, KeyRound, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/people/copy-button";
import { StatusBadge, requestTone, verifiedTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import type { UserRow } from "@/lib/types";
import { cn, formatDate, locationLabel } from "@/lib/utils";
import { verificationStatusLabel } from "@/lib/verification";

export interface Props {
  user: UserRow;
  roleName: string;
  verificationId: string | null;
  verificationStatus: string | null;
  accountBusy: boolean;
  onResetPassword: () => void;
  onDelete: () => void;
}

/** Sticky "ID card": identity, contact, record number and account actions. */
export function PersonIdentityRail({
  user,
  roleName,
  verificationId,
  verificationStatus,
  accountBusy,
  onResetPassword,
  onDelete,
}: Props) {
  const secondary = user.username ? `@${user.username}` : user.full_name || "";

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
          <UserAvatar name={user.display_name || user.full_name} src={user.avatar_url} size={80} />
          <h2 className="mt-3 max-w-full break-words font-heading text-lg font-semibold leading-tight">
            {user.display_name || "Unnamed"}
          </h2>
          {secondary ? (
            <p className="mt-0.5 max-w-full truncate text-xs text-text-secondary">{secondary}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <StatusBadge tone="info">{roleName}</StatusBadge>
            <StatusBadge tone={verifiedTone(user.verified)}>
              {user.verified ? "Verified" : "Unverified"}
            </StatusBadge>
          </div>
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Contact</p>
          <RailField label="Email" value={user.email || "-"} copy={user.email || undefined} breakAll />
          <RailField label="Phone" value={user.phone || "-"} copy={user.phone || undefined} />
          <RailField label="Location" value={locationLabel(user.city, user.country)} />
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Record</p>
          <RailField label="Joined" value={formatDate(user.created_at)} />
          <RailField label="User ID" value={user.id} copy={user.id} mono truncateValue />
        </div>

        {verificationId ? (
          <div className="space-y-2 border-t border-border px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">
              ID verification
            </p>
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone={requestTone(verificationStatus || "")}>
                {verificationStatusLabel(verificationStatus)}
              </StatusBadge>
              <Link
                href={`/admin/verifications/${verificationId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Review docs
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Account</p>
          <button
            type="button"
            disabled={accountBusy}
            onClick={onResetPassword}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4 text-text-hint" aria-hidden />
            Reset password
          </button>
          <button
            type="button"
            disabled={accountBusy}
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete account
          </button>
        </div>
      </div>
    </aside>
  );
}

interface RailFieldProps {
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
  breakAll?: boolean;
  truncateValue?: boolean;
}

function RailField({ label, value, copy, mono, breakAll, truncateValue }: RailFieldProps) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-text-hint">{label}</p>
      <div className="mt-0.5 flex items-start justify-between gap-1">
        <p
          title={truncateValue ? value : undefined}
          className={cn(
            "min-w-0 text-sm font-medium text-text-primary",
            mono && "font-mono text-[11px] leading-5",
            breakAll && "break-all",
            truncateValue && "truncate",
          )}
        >
          {value || "-"}
        </p>
        {copy ? <CopyButton value={copy} label={label} /> : null}
      </div>
    </div>
  );
}
