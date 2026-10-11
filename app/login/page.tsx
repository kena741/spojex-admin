"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

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
      await getSupabase().auth.signOut();
      const { data, error: signInError } = await getSupabase().auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) throw signInError;
      if (!data.session?.user) throw new Error("Login failed. No session returned.");

      const { bootstrapFirstAdmin, resolveAdminStaff } = await import("@/lib/use-admin-permissions");
      let staff = await resolveAdminStaff(data.session.user.id);
      if (!staff) {
        try {
          await bootstrapFirstAdmin(data.session.user);
          staff = await resolveAdminStaff(data.session.user.id);
        } catch {
          // SQL only allows bootstrap when the admin table is empty.
        }
      }
      if (!staff?.is_active) {
        await getSupabase().auth.signOut();
        throw new Error("This account is not an admin. Ask a Super Admin to grant access.");
      }

      router.replace(params.get("next") || "/admin/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in.";
      if (/could not find the table|schema cache|relation .*admin|Not authenticated|401/i.test(message)) {
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
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2.2 14.7 8h6.3l-5.1 3.8 1.9 6-5.8-3.9-5.8 3.9 1.9-6L3 8h6.3L12 2.2Z" />
            </svg>
          </div>
          <h1 className="font-heading text-lg font-semibold text-text-primary">SpoJex Admin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sign in with an admin account. The first login becomes Super Admin.
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
