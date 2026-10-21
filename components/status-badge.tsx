import { cn } from "@/lib/utils";

const tones = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-border bg-muted text-text-secondary",
} as const;

export type StatusTone = keyof typeof tones;

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function verifiedTone(verified: boolean): StatusTone {
  return verified ? "success" : "neutral";
}

export function requestTone(status: string): StatusTone {
  switch (status) {
    case "accepted":
    case "active":
    case "completed":
    case "confirmed":
    case "published":
    case "approved":
    case "used":
    case "paid":
      return "success";
    case "live":
    case "finished":
      return "success";
    case "suspended":
    case "postponed":
      return "warning";
    case "scheduled":
    case "pending":
    case "in_review":
    case "needs_info":
    case "awaiting_payment":
    case "expired":
      return "warning";
    case "declined":
    case "cancelled":
    case "failed":
    case "inactive":
    case "rejected":
    case "refunded":
      return "danger";
    default:
      return "neutral";
  }
}
