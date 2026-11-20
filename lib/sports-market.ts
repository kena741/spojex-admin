import type { StatusTone } from "@/components/status-badge";

export const SM_API = "/api/admin/sports-market";

export type SmUser = {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string;
  country?: string;
  verified?: boolean;
  seller_status?: "active" | "revoked" | null;
};

export type SmSeller = {
  user_id: string;
  status: "active" | "revoked";
  note: string;
  granted_at: string;
  revoked_at?: string | null;
  revoke_reason?: string;
  user: SmUser;
  product_count?: number;
  live_product_count?: number;
  order_count?: number;
  open_count?: number;
  completed_count?: number;
  cancelled_count?: number;
  returned_count?: number;
  gross_sales?: number;
  commission_total?: number;
  /** Seller take-home on completed orders (net + delivery). */
  net_earnings?: number;
  completion_rate?: number | null;
  cancellation_rate?: number | null;
};

export type SmTopSeller = {
  user_id: string;
  name: string;
  username?: string | null;
  gross_sales: number;
  commission_total: number;
  net_earnings: number;
  completed_count: number;
  order_count: number;
};

export type SmCategory = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  product_count?: number;
};

export type SmProduct = {
  id: string;
  name: string;
  description: string;
  brand: string;
  price: number;
  delivery_fee: number;
  currency: string;
  quantity: number;
  condition: "new" | "used";
  images: string[];
  sizes: string[];
  colors: string[];
  specifications: { label: string; value: string }[];
  location: { text: string; city: string; latitude?: number | null; longitude?: number | null };
  category: { id: string; name: string; slug: string };
  seller: { id: string; name: string; username?: string | null; active: boolean; city?: string };
  available: boolean;
  availability: string;
  sold_count: number;
  is_active?: boolean;
  moderation_status?: "pending" | "approved" | "rejected" | "removed";
  moderation_note?: string;
  deleted?: boolean;
  /** Shown in the app's Featured row; lower rank shows first. */
  featured?: boolean;
  featured_rank?: number | null;
  /** Old price shown struck through while on sale. */
  compare_at_price?: number | null;
  rating?: { average: number | null; count: number };
  created_at: string;
};

/** A listing someone flagged from the app. */
export type SmReport = {
  id: string;
  product: { id: string; name: string; image: string; status?: string | null; seller_id?: string | null };
  reporter: { id: string; name?: string | null; username?: string | null };
  reason: string;
  reason_label: string;
  details: string;
  status: "open" | "dismissed" | "actioned";
  admin_note: string;
  /** Open reports on the same listing. */
  open_count: number;
  created_at: string;
  resolved_at?: string | null;
};

export type SmTimelineStep = { stage: string; label: string; state: "done" | "current" | "upcoming" | "skipped"; at?: string | null };
export type SmEvent = { status: string; from_status?: string | null; label: string; actor_role: string; note: string; at: string };

export type SmOrder = {
  id: string;
  order_no: string;
  status: string;
  status_label: string;
  product: { id: string; name: string; image: string; location?: string; city?: string };
  quantity: number;
  size: string;
  color: string;
  unit_price: number;
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  payment_method: "chapa" | "wallet" | "cod";
  payment_status: string;
  delivery: { address: string; city: string; phone: string; instructions: string; latitude?: number | null; longitude?: number | null };
  tracking_note: string;
  buyer: { id: string; name: string; username?: string | null; phone?: string | null };
  seller: { id: string; name: string; username?: string | null; phone?: string | null };
  actions: string[];
  commission_rate?: number;
  commission_amount?: number;
  seller_net?: number;
  seller_payout?: number;
  commission_status?: string;
  commission_note?: string;
  commission_settled_at?: string | null;
  seller_credited_at?: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  events?: SmEvent[];
  timeline?: SmTimelineStep[];
  payment?: { id: string; method: string; status: string; amount: number; paid_at?: string | null; provider_ref?: string | null } | null;
};

export type SmPayment = {
  id: string;
  order_id: string;
  order_no: string;
  order_status: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  provider_ref: string;
  paid_at?: string | null;
  created_at: string;
  subtotal: number;
  delivery_fee: number;
  commission_amount: number;
  commission_status: string;
  buyer_name: string;
  seller_name: string;
};

export type SmSettings = { commission_percent: number; cod_enabled: boolean; require_listing_approval: boolean };

export type SmOverview = {
  active_sellers: number;
  revoked_sellers: number;
  products: number;
  pending_listings: number;
  orders: number;
  open_orders: number;
  completed_orders?: number;
  delivered_orders?: number;
  cancelled_orders: number;
  returned_orders: number;
  gmv: number;
  /** Total paid out to sellers on completed orders (net + delivery). */
  seller_earnings?: number;
  /** Completed order totals (subtotal + delivery). */
  order_volume?: number;
  commission_collected: number;
  commission_held: number;
  commission_cod_pending: number;
  refunded_volume?: number;
  paid_payments: number;
  open_payments: number;
  refunded_payments?: number;
  top_sellers?: SmTopSeller[];
  settings: SmSettings;
};

export function smPermissionFor(method: string, path: string): string[] {
  const all = ["sports_market:read", "sports_market:sellers", "sports_market:write", "sports_market:finance"];
  if (method === "GET") return all;
  if (path.startsWith("sellers")) return ["sports_market:sellers"];
  if (path.endsWith("settle-commission")) return ["sports_market:finance"];
  return ["sports_market:write"];
}

export function etb(value: number | null | undefined, currency = "ETB") {
  const n = Number(value ?? 0);
  return `${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function shortDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function orderTone(status: string): StatusTone {
  if (status === "completed" || status === "delivered") return "success";
  if (status === "cancelled" || status === "rejected" || status === "returned") return "danger";
  if (status === "payment_pending" || status === "placed") return "warning";
  return "info";
}

export function moderationTone(status?: string): StatusTone {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected" || status === "removed") return "danger";
  return "neutral";
}

export function commissionTone(status?: string): StatusTone {
  if (status === "earned" || status === "settled") return "success";
  if (status === "pending_settlement") return "warning";
  if (status === "void") return "neutral";
  return "info";
}

export const ORDER_STATUSES = [
  "placed",
  "payment_pending",
  "payment_confirmed",
  "accepted",
  "processing",
  "ready_for_dispatch",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "rejected",
  "returned",
] as const;

export function labelize(value?: string | null) {
  if (!value) return "—";
  const map: Record<string, string> = {
    cod: "Cash on delivery",
    chapa: "Chapa",
    wallet: "Wallet",
    pending_settlement: "Awaiting settlement",
    payment_pending: "Payment pending",
    payment_confirmed: "Payment confirmed",
    ready_for_dispatch: "Ready for dispatch",
    out_for_delivery: "Out for delivery",
    out_of_stock: "Out of stock",
  };
  return map[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
