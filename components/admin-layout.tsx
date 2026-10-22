import { useId, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import Sidebar from "@/components/sidebar";
import AdminTopBar from "@/components/admin-topbar";
import { cn } from "@/lib/utils";

export const adminPageMainClassName =
  "min-h-screen min-w-0 flex-1 overflow-x-hidden pb-[env(safe-area-inset-bottom)] lg:ml-64";
export const adminPageContentClassName =
  "mx-auto min-w-0 w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden">
      <Sidebar />
      <main className={adminPageMainClassName}>
        <AdminTopBar />
        <div className={adminPageContentClassName}>{children}</div>
      </main>
    </div>
  );
}

export function AdminStatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <p className="mb-1 text-sm font-semibold text-text-secondary">{title}</p>
      <p className="truncate text-2xl font-bold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

export function AdminFilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:mb-6 sm:p-4 [&_input]:w-full [&_select]:w-full sm:[&_select]:w-auto">
      {children}
    </div>
  );
}

export function AdminSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-hint" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-card py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export function AdminSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-10 w-full appearance-none rounded-lg border border-border bg-card bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat py-2 pl-3 pr-10 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto",
        "bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%236b7280%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')]",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function AdminLoadingRow({
  label,
  className,
  fill = false,
  compact = false,
}: {
  label: string;
  className?: string;
  /** Fill the parent height (detail panes, split views, table shells). */
  fill?: boolean;
  /** Tighter padding for modals, pickers, and inline panels. */
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2.5 px-4 text-center text-sm text-text-secondary",
        compact && "mb-0 min-h-[6rem] py-6",
        !compact && fill && "mb-0 min-h-[16rem] flex-1 py-12",
        !compact && !fill && "mb-4 min-h-[10rem] py-10",
        className,
      )}
    >
      <div
        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

/** Spinner row rendered under the table header (inside `<tbody>`). */
export function AdminTableLoading({
  colSpan,
  label = "Loading…",
}: {
  colSpan: number;
  label?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12">
        <AdminLoadingRow label={label} compact className="mb-0 min-h-0 py-4" />
      </td>
    </tr>
  );
}

/** Manual refresh control - use instead of refetching on every filter click. */
export function AdminReloadButton({
  onClick,
  loading = false,
  label = "Reload",
  className,
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function AdminErrorAlert({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      {message}
    </div>
  );
}

export function AdminTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="-mx-0 overflow-x-auto overscroll-x-contain">{children}</div>
    </div>
  );
}

export function AdminEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-base font-medium text-text-primary">{title}</p>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
    </div>
  );
}

export function AdminModal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  sheet = false,
  stacked = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Full-width bottom sheet on small screens. */
  sheet?: boolean;
  /** Draw above another open dialog. */
  stacked?: boolean;
}) {
  const titleId = useId();
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex justify-center",
        stacked ? "z-[80]" : "z-50",
        sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex w-full flex-col border border-border bg-card shadow-xl",
          sheet
            ? "max-h-[92vh] max-w-lg rounded-t-2xl sm:max-h-[90vh] sm:rounded-xl"
            : "max-h-[90vh] max-w-lg rounded-xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="font-heading text-base font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-text-secondary hover:bg-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function AdminModalFooter({
  onCancel,
  onSave,
  saving,
  disabled,
  saveLabel = "Save",
}: {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  /** Extra disable (e.g. missing required fields). Does not show “Saving…”. */
  disabled?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={saving || disabled}
        onClick={onSave}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

export { AdminRowMenu, AdminTableActions, type AdminRowMenuItem } from "@/components/admin-row-menu";
