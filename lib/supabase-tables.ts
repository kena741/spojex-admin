import { getSupabase } from "@/lib/supabase/client";

function isMissingTableError(message: string) {
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}

export async function safeCount(
  table: string,
  filters?: Record<string, string | boolean>,
): Promise<number> {
  try {
    let query = getSupabase().from(table).select("*", { count: "exact", head: true });
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
    }
    const { count, error } = await query;
    if (error) {
      if (isMissingTableError(error.message)) return 0;
      throw error;
    }
    return count ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) return 0;
    throw err;
  }
}

export async function safeSelect<T>(
  run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await run();
    if (error) {
      if (isMissingTableError(error.message)) return { data: null, error: null };
      return { data: null, error: error.message };
    }
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingTableError(message)) return { data: null, error: null };
    return { data: null, error: message };
  }
}
