"use client";

import { useMemo, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminModalFooter,
  AdminReloadButton,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch, deleteAdmin, patchAdmin, postAdmin, uploadAdmin } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { formatDate } from "@/lib/utils";

const CATEGORIES = [
  { id: "salary", label: "Salary" },
  { id: "lunch", label: "Lunch" },
  { id: "fuel", label: "Fuel" },
  { id: "outdoor_marketing", label: "Outdoor marketing" },
  { id: "jersey", label: "Jersey" },
  { id: "other", label: "Other" },
] as const;

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.id, label: c.label }));

type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  currency: string;
  spent_on: string;
  note: string;
  screenshot_url: string;
};

type ListPayload = {
  data?: ExpenseRow[];
  total?: number;
  totals?: { amount?: number; currency?: string };
  error?: string;
};

const fieldClass = "h-10 w-full rounded-lg border border-border px-3 text-sm";

function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}

export default function ExpensesPage() {
  const [category, setCategory] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [actionError, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draftCategory, setDraftCategory] = useState<string>("salary");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftSpentOn, setDraftSpentOn] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftScreenshot, setDraftScreenshot] = useState("");

  const {
    data,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<ListPayload>({
    key: adminCacheKey(["expenses", category, start, end]),
    fetcher: async () => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const res = await adminFetch(`/api/admin/expenses?${params}`);
      const payload = (await res.json()) as ListPayload;
      if (!res.ok) throw new Error(payload.error || "Failed to load expenses");
      return payload;
    },
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const error = actionError ?? loadError;

  const openCreate = () => {
    setEditing(null);
    setDraftCategory("salary");
    setDraftAmount("");
    setDraftSpentOn(new Date().toISOString().slice(0, 10));
    setDraftNote("");
    setDraftScreenshot("");
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    setDraftCategory(row.category);
    setDraftAmount(String(row.amount));
    setDraftSpentOn(row.spent_on?.slice(0, 10) || "");
    setDraftNote(row.note || "");
    setDraftScreenshot(row.screenshot_url || "");
    setError(null);
    setOpen(true);
  };

  const uploadScreenshot = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const payload = await uploadAdmin("/api/admin/expenses/upload", file);
      const url =
        (payload as { url?: string }).url ||
        (payload as { image_url?: string }).image_url ||
        "";
      if (!url) throw new Error("Upload failed");
      setDraftScreenshot(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a non-negative number");
      return;
    }
    if (!draftSpentOn) {
      setError("Date is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        category: draftCategory,
        amount,
        spent_on: draftSpentOn,
        note: draftNote.trim(),
        screenshot_url: draftScreenshot.trim(),
        currency: "ETB",
      };
      if (editing) await patchAdmin(`/api/admin/expenses/${editing.id}`, body);
      else await postAdmin("/api/admin/expenses", body);
      setOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ExpenseRow) => {
    if (!window.confirm(`Delete ${categoryLabel(row.category)} expense?`)) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/expenses/${row.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Expenses"
        description={
          data?.totals?.amount != null
            ? `${Number(data.totals.amount).toLocaleString()} ${data.totals.currency || "ETB"}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            <button
              type="button"
              onClick={openCreate}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Add expense
            </button>
          </div>
        }
      />

      <AdminFilterPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminSelect value={category} onChange={setCategory}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </AdminSelect>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={fieldClass}
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={fieldClass}
          />
        </div>
      </AdminFilterPanel>

      {error ? <AdminErrorAlert message={error} /> : null}

      <AdminTableShell>
        {loading && !data ? (
          <AdminLoadingRow label="Loading expenses…" />
        ) : rows.length === 0 ? (
          <AdminEmpty title="No expenses" description="Add an expense to start tracking." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium text-right">Amount</th>
                  <th className="px-3 py-3 font-medium">Note</th>
                  <th className="px-3 py-3 font-medium">Screenshot</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">{formatDate(row.spent_on)}</td>
                    <td className="px-3 py-3">{categoryLabel(row.category)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">
                      {Number(row.amount).toLocaleString()} {row.currency || "ETB"}
                    </td>
                    <td className="max-w-55 truncate px-3 py-3 text-text-secondary">
                      {row.note || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.screenshot_url ? (
                        <a
                          href={row.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className="mr-2 text-xs font-medium text-primary hover:underline"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-700 hover:underline"
                        onClick={() => void remove(row)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>

      <AdminModal
        open={open}
        title={editing ? "Edit expense" : "Add expense"}
        onClose={() => setOpen(false)}
        footer={
          <AdminModalFooter
            onCancel={() => setOpen(false)}
            onSave={() => void save()}
            saving={saving || uploading}
            saveLabel={editing ? "Save" : "Add"}
          />
        }
      >
        <div className="grid gap-3">
          <SearchableSelect
            value={draftCategory}
            onChange={setDraftCategory}
            options={CATEGORY_OPTIONS}
            placeholder="Category"
            searchPlaceholder="Search category…"
            allowClear={false}
          />
          <input
            type="number"
            min={0}
            step={0.01}
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
            placeholder="Amount (ETB)"
            className={fieldClass}
          />
          <input
            type="date"
            value={draftSpentOn}
            onChange={(e) => setDraftSpentOn(e.target.value)}
            className={fieldClass}
          />
          <input
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Note"
            className={fieldClass}
          />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadScreenshot(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {uploading ? "Uploading…" : draftScreenshot ? "Replace screenshot" : "Upload screenshot"}
            </button>
            {draftScreenshot ? (
              <p className="mt-1 truncate text-xs text-text-hint">{draftScreenshot}</p>
            ) : null}
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
