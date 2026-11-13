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

const NO_DEVICE = "This user hasn't turned on notifications in the Spojex app yet.";
const DEVICE_CHANGED =
  "This user's phone is no longer connected. They need to open the Spojex app again.";
const NOTIFICATIONS_OFF = "This user has turned off notifications.";
const SEND_FAILED = "The notification couldn't be sent. Please try again.";

/** Plain-language reason for why a user can't get a push right now. */
function friendlyStatusReason(status: PushStatus): string {
  if (!status.fcmRegistered) return NO_DEVICE;
  if (!status.notificationsEnabled) return NOTIFICATIONS_OFF;
  return SEND_FAILED;
}

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
        console.warn("Push status failed", data.error);
        setStatusError("Couldn't check this user's notification status.");
        setStatus(null);
        return;
      }
      setStatus(data);
    } catch {
      setStatusError("Couldn't check this user's notification status. Check your connection.");
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
        skipped?: string | boolean;
        messageId?: string;
      };
      // A cleared or skipped send delivered nothing, even if the request succeeded.
      if (!response.ok || data.clearedToken || data.skipped) {
        // Keep technical details out of the UI; they stay in the console.
        console.warn("Push not delivered", { status: response.status, ...data });
        setFeedback({
          type: "error",
          text: data.clearedToken ? DEVICE_CHANGED : SEND_FAILED,
        });
        await loadStatus();
        return;
      }
      setFeedback({ type: "success", text: "Notification sent." });
      setTitle("");
      setBody("");
    } catch {
      setFeedback({
        type: "error",
        text: "The notification couldn't be sent. Check your connection and try again.",
      });
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
      badgeLabel = "Notifications on";
      badgeClass = "bg-emerald-50 text-emerald-800";
    } else if (!status.fcmRegistered) {
      badgeLabel = "Not set up";
      badgeClass = "bg-amber-50 text-amber-800";
    } else if (!status.notificationsEnabled) {
      badgeLabel = "Notifications off";
      badgeClass = "bg-amber-50 text-amber-800";
    } else {
      badgeLabel = "Unavailable";
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
      {!loadingStatus && status && !canSend ? (
        <p className="mb-3 text-sm text-text-secondary">{friendlyStatusReason(status)}</p>
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
          <span className="text-text-secondary">Screen to open (optional)</span>
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
            placeholder="Write your message"
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
            Check again
          </button>
          <button
            type="submit"
            disabled={disabled || !title.trim() || !body.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send notification"}
          </button>
        </div>
      </form>
    </section>
  );
}
