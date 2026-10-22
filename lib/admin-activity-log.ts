import type { AdminContext } from "@/lib/admin-auth";
import { sanitizeLogMetadata } from "@/lib/sanitize-log-metadata";

export type LogAdminActivityInput = {
  context: AdminContext;
  request?: Request;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  route?: string | null;
  outcome?: "success" | "denied" | "error";
};

export async function logAdminActivity(input: LogAdminActivityInput): Promise<void> {
  try {
    const route =
      input.route ??
      (input.request ? new URL(input.request.url).pathname : null);
    const raw = (
      process.env.NEXT_PUBLIC_SPOJEX_ENV ||
      process.env.SPOJEX_ENV ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      ""
    )
      .trim()
      .toLowerCase();
    const env =
      raw === "production" || raw === "prod"
        ? "production"
        : raw === "preview" || raw === "staging"
          ? "staging"
          : raw === "development" || raw === "dev" || raw === "local"
            ? "development"
            : raw || "production";

    const { error } = await input.context.client.from("admin_activity_log").insert({
      admin_id: input.context.staff.id,
      admin_email: input.context.user.email ?? input.context.staff.email ?? null,
      admin_name: input.context.staff.full_name ?? null,
      admin_role: input.context.staff.role ?? null,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      route,
      summary: input.summary,
      metadata: sanitizeLogMetadata(input.metadata ?? {}),
      env,
      outcome: input.outcome ?? "success",
    });

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[activity-log] insert failed:", error.message);
    }
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development") {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn("[activity-log] unexpected error:", message);
    }
  }
}
