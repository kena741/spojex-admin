export const bookingEmbedSelect =
  "*, services:service_id(id, title), requester:requester_id(id, display_name), provider:provider_id(id, display_name), service_payments(id, status, amount, currency)";

export const bookingEmbedFallback = "*, services:service_id(id, title)";

export const listingEmbedSelect =
  "*, users:provider_id(id, display_name, verified, avatar_url, role), category:category_id(id, label, emoji), subcategory:subcategory_id(id, label, emoji)";

export type PaymentSnippet = {
  id: string;
  status: string;
  amount: number;
  currency: string;
};

export function firstPayment(
  value: PaymentSnippet | PaymentSnippet[] | null | undefined,
): PaymentSnippet | null {
  if (!value) return null;
  const rows = Array.isArray(value) ? value : [value];
  return rows.find((row) => row.status === "completed") ?? rows[0] ?? null;
}

export function isMissingRelation(message: string) {
  return /schema cache|does not exist|could not find|relationship/i.test(message);
}
