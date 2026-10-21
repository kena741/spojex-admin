"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SpojexLogo } from "@/components/spojex-logo";
import { getSpojexClient } from "@/lib/spojex/client";

function errorText(err: unknown) {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Failed to sign in.";
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const queryError = params.get("error");
  const queryMessage =
    queryError === "unauthorized"
      ? "You are not authorized to access that page."
      : queryError === "auth"
        ? "Authentication is required. Please sign in."
        : queryError === "forbidden"
          ? "This account is not an admin. Ask a Super Admin to grant access."
        : queryError === "timeout"
          ? "Session check timed out. Please sign in again."
          : queryError
            ? "Please sign in to continue."
            : null;
  const displayError = error ?? queryMessage;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    try {
      await getSpojexClient().auth.signOut();
      const { data, error: signInError } = await getSpojexClient().auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) throw signInError;
      if (!data.session?.user) throw new Error("Login failed. No session returned.");

      const { bootstrapFirstAdmin, resolveAdminStaff } = await import("@/lib/use-admin-permissions");
      let staff = null;
      try {
        staff = await resolveAdminStaff(data.session.user.id);
      } catch {
        staff = null;
      }
      if (!staff) {
        // Bootstrap only when no admin rows exist yet (empty install).
        const { count } = await getSpojexClient()
          .from("admin")
          .select("id", { count: "exact", head: true });
        if ((count ?? 0) === 0) {
          try {
            await bootstrapFirstAdmin(data.session.user);
            staff = await resolveAdminStaff(data.session.user.id);
          } catch (bootstrapError) {
            await getSpojexClient().auth.signOut();
            throw new Error(errorText(bootstrapError));
          }
        }
      }
      const inviteToken = params.get("invite");
      if ((!staff || !staff.is_active) && inviteToken) {
        const base =
          process.env.NEXT_PUBLIC_SPOJEX_API_BASE_URL ||
          process.env.SPOJEX_API_BASE_URL ||
          "";
        const access = data.session.access_token;
        const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/admin/invitations/accept`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: inviteToken }),
        });
        const payload = (await res.json().catch(() => ({}))) as { detail?: unknown; error?: string };
        if (!res.ok) {
          await getSpojexClient().auth.signOut();
          const detail = payload.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : typeof (detail as { message?: string })?.message === "string"
                ? (detail as { message: string }).message
                : "Invitation could not be accepted.";
          throw new Error(msg);
        }
        staff = await resolveAdminStaff(data.session.user.id);
      }

      if (!staff?.is_active) {
        await getSpojexClient().auth.signOut();
        throw new Error(
          "This account is not an admin. Ask a Super Admin to send you an invitation.",
        );
      }

      router.replace(params.get("next") || "/admin/dashboard");
    } catch (err: unknown) {
      const message = errorText(err);
      if (/forbidden|invite_required|writes for this resource require admin/i.test(message)) {
        setError(
          "Signed in, but this account is not an admin. Ask a Super Admin for an invitation.",
        );
      } else if (/could not find the table|schema cache|relation .*admin|Not authenticated|401/i.test(message)) {
        setError("Admin sign-in failed. Confirm SPOJEX_API_BASE_URL points at the API and this account has an active admin row.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <SpojexLogo size={48} className="h-12 w-12" priority />
          </div>
          <h1 className="font-heading text-lg font-semibold text-text-primary">SpoJex Admin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sign in with an invited admin account. Access is granted by a Super Admin.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {displayError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {displayError}
            </div>
          ) : null}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-primary">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-primary">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-sm text-text-secondary">
            No admin account yet?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
