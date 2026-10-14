/** Detect Spojex REST missing-RPC / unavailable function responses. */
export function isRpcUnavailable(error: unknown): boolean {
  const text =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  const lower = text.toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "").toLowerCase()
      : "";
  if (
    code === "unavailable" ||
    code === "unknown_function" ||
    code === "501" ||
    code === "404"
  ) {
    return true;
  }
  return (
    lower.includes("undefinedfunction") ||
    lower.includes("pgrst202") ||
    lower.includes("could not find the function") ||
    lower.includes("schema cache") ||
    lower.includes("action is not available") ||
    lower.includes("not available yet") ||
    lower.includes("unknown_function") ||
    (lower.includes("function") && lower.includes("does not exist"))
  );
}
