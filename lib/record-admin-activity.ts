import { postAdminResponse } from "@/lib/hooks";

export type RecordAdminActivityInput = {
  action: string;
  resource_type: string;
  resource_id?: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export async function recordAdminActivity(
  input: RecordAdminActivityInput,
): Promise<boolean> {
  try {
    await postAdminResponse("/api/admin/activity-logs", input);
    return true;
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development") {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn("[activity-log] failed to record:", message);
    }
    return false;
  }
}

export async function logClientAdminActivity(
  input: RecordAdminActivityInput,
): Promise<boolean> {
  return recordAdminActivity(input);
}
