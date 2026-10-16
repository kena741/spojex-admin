"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AdminModal, AdminModalFooter } from "@/components/admin-layout";

type UserTarget = {
  id: string;
  display_name?: string | null;
  email?: string | null;
};

export function UserPasswordResetModal({
  user,
  open,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  user: UserTarget | null;
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setShow(false);
    setLocalError(null);
  }, [open, user?.id]);

  const label = user?.display_name || user?.email || "this user";
  const email = user?.email || "—";

  const submit = async () => {
    const next = password.trim();
    if (next.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }
    if (next !== confirm.trim()) {
      setLocalError("Passwords do not match.");
      return;
    }
    setLocalError(null);
    await onSubmit(next);
  };

  return (
    <AdminModal
      open={open && Boolean(user)}
      title="Reset password"
      onClose={onClose}
      footer={
        <AdminModalFooter
          onCancel={onClose}
          onSave={() => void submit()}
          saving={saving}
          saveLabel="Reset password"
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Set a new login password for <span className="font-medium text-text-primary">{label}</span>
          {user?.email ? (
            <>
              {" "}
              (<span className="font-mono text-xs">{email}</span>)
            </>
          ) : null}
          . They will need this password the next time they sign in.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-text-secondary">New password</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="h-10 w-full rounded-lg border border-border bg-card px-3 pr-10 text-sm"
              placeholder="At least 6 characters"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary hover:bg-muted"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-secondary">Confirm password</span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            placeholder="Repeat password"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </label>
        {localError || error ? (
          <p className="text-sm text-red-600">{localError || error}</p>
        ) : null}
      </div>
    </AdminModal>
  );
}

export function UserDeleteModal({
  user,
  open,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  user: UserTarget | null;
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const label = user?.display_name || user?.email || "this user";

  return (
    <AdminModal
      open={open && Boolean(user)}
      title="Delete user"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onConfirm()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Deleting…" : "Delete user"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          Delete <span className="font-medium text-text-primary">{label}</span>? They will no longer
          be able to sign in. This cannot be undone from the admin list.
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </AdminModal>
  );
}
