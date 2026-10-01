import type { ReactNode } from "react";
import { Search } from "lucide-react";
import Sidebar from "@/components/sidebar";
import { cn } from "@/lib/utils";

export const adminPageMainClassName = "min-h-screen min-w-0 flex-1 overflow-x-hidden lg:ml-64";
export const adminPageContentClassName = "mx-auto min-w-0 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <Sidebar />
      <main className={adminPageMainClassName}>
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
    <div className="mb-6 min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
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
        "h-10 rounded-lg border border-border bg-card px-3 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function AdminLoadingRow({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
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
      {children}
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
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Full-width bottom sheet on small screens. */
  sheet?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
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
        aria-labelledby="admin-modal-title"
        className={cn(
          "relative flex w-full flex-col border border-border bg-card shadow-xl",
          sheet
            ? "max-h-[92vh] max-w-lg rounded-t-2xl sm:max-h-[90vh] sm:rounded-xl"
            : "max-h-[90vh] max-w-lg rounded-xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id="admin-modal-title" className="font-heading text-base font-semibold text-text-primary">
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
  saveLabel = "Save",
}: {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
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
        disabled={saving}
        onClick={onSave}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

export function AdminTableActions({
  canWrite,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  canWrite: boolean;
  editing?: boolean;
  saving?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  if (!canWrite) return <span className="text-text-secondary">—</span>;

  if (editing) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-text-secondary hover:underline">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {onEdit ? (
        <button type="button" onClick={onEdit} className="text-sm text-primary hover:underline">
          Edit
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} className="text-sm text-red-600 hover:underline">
          Delete
        </button>
      ) : null}
    </div>
  );
}
