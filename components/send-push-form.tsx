"use client";

import { useCallback, useEffect, useState } from "react";

type PushStatus = {
  fcmRegistered: boolean;
  notificationsEnabled: boolean;
  canSend: boolean;
  reason: string | null;
  displayName?: string | null;
};

type Props = {
  userId: string;
};

export default function SendPushForm({ userId }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [route, setRoute] = useState("/notifications");
  const [sending, setSending] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/push`, {
        credentials: "same-origin",
      });
      const data = (await response.json()) as PushStatus & { error?: string };
      if (!response.ok) {
        setStatusError(data.error ?? "Could not load push status");
        setStatus(null);
        return;
      }
      setStatus(data);
    } catch {
      setStatusError("Network error while loading push status.");
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setSending(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title,
          body,
          route: route.trim() || undefined,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        ok?: boolean;
        clearedToken?: boolean;
      };
      if (!response.ok) {
        setFeedback({ type: "error", text: data.error ?? "Could not send notification" });
        if (data.clearedToken) await loadStatus();
        return;
      }
      setFeedback({ type: "success", text: "Notification sent to the device." });
      setTitle("");
      setBody("");
    } catch {
      setFeedback({ type: "error", text: "Network error. Try again." });
    } finally {
      setSending(false);
    }
  }

  const canSend = status?.canSend ?? false;
  const disabled = !canSend || sending || loadingStatus;

  let badgeLabel = "Checking…";
  let badgeClass = "bg-muted text-text-secondary";
  if (!loadingStatus && status) {
    if (canSend) {
      badgeLabel = "Ready to send";
      badgeClass = "bg-emerald-50 text-emerald-800";
    } else if (!status.fcmRegistered) {
      badgeLabel = "No device token";
      badgeClass = "bg-amber-50 text-amber-800";
    } else if (!status.notificationsEnabled) {
      badgeLabel = "Notifications off";
      badgeClass = "bg-amber-50 text-amber-800";
    } else {
      badgeLabel = "Cannot send";
      badgeClass = "bg-amber-50 text-amber-800";
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">Push notification</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {statusError ? <p className="mb-3 text-sm text-red-600">{statusError}</p> : null}
      {!loadingStatus && status && !canSend && status.reason ? (
        <p className="mb-3 text-sm text-text-secondary">{status.reason}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-text-secondary">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Spojex update"
            maxLength={120}
            disabled={disabled}
            required
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-text-secondary">Deep link route (optional)</span>
          <input
            value={route}
            onChange={(event) => setRoute(event.target.value)}
            placeholder="/notifications"
            maxLength={200}
            disabled={disabled}
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-text-secondary">Message</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the notification body"
            rows={3}
            maxLength={500}
            disabled={disabled}
            required
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>

        {feedback ? (
          <p
            className={`text-sm ${
              feedback.type === "success" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={loadingStatus || sending}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Refresh status
          </button>
          <button
            type="submit"
            disabled={disabled || !title.trim() || !body.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send push"}
          </button>
        </div>
      </form>
    </section>
  );
}
