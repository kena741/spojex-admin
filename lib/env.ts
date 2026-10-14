export const DEFAULT_SPOJEX_API_BASE_URL =
  "https://spojex-backend-prod-576757759417.europe-west3.run.app";

export function getSpojexApiBaseUrl() {
  const url =
    process.env.NEXT_PUBLIC_SPOJEX_API_BASE_URL ||
    process.env.SPOJEX_API_BASE_URL ||
    DEFAULT_SPOJEX_API_BASE_URL;
  return url.replace(/\/$/, "");
}
