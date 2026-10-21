"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSpojexClient } from "@/lib/spojex/client";
import { bootstrapFirstAdmin, resolveAdminStaff } from "@/lib/use-admin-permissions";

function errorText(err: unknown) {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Sign up failed.";
}

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = fullName.trim();
    const trimmed = email.trim().toLowerCase();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await getSpojexClient().auth.signOut();
      const { data, error: signUpError } = await getSpojexClient().auth.signUp({
        email: trimmed,
        password,
        full_name: name,
      });
      if (signUpError) throw signUpError;
      const user = data.session?.user;
      if (!user?.id) throw new Error("Sign up failed. No account was returned.");

      const { count } = await getSpojexClient()
        .from("admin")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) === 0) {
        await bootstrapFirstAdmin({
          id: user.id,
          email: trimmed,
          user_metadata: { full_name: name, display_name: name },
        });
        const staff = await resolveAdminStaff(user.id);
        if (!staff?.is_active) {
          throw new Error("The account was created, but the admin record was not saved.");
        }
        router.replace("/admin/dashboard");
        return;
      }
      await getSpojexClient().auth.signOut();
      throw new Error(
        "Admin accounts are invitation-only. Ask a Super Admin to invite you, then sign in.",
      );
    } catch (err: unknown) {
      await getSpojexClient().auth.signOut();
      const message = errorText(err);
      if (/forbidden|invite|writes for this resource require admin/i.test(message)) {
        setError(
          "Admin access is invitation-only. Ask a Super Admin to invite this email.",
        );
      } else if (/already exists|duplicate/i.test(message)) {
        setError("An account with this email already exists. Sign in instead.");
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
          <h1 className="font-heading text-lg font-semibold text-text-primary">Create account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            After the first Super Admin exists, new staff must be invited. Prefer Sign in with an invitation.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div>
            <label htmlFor="full-name" className="mb-1 block text-sm font-medium text-text-primary">
              Name
            </label>
            <input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
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
              placeholder="At least 6 characters"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create admin"}
          </button>
          <p className="text-center text-sm text-text-secondary">
            Already an admin?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
