/** Shared Bookings (service_requests) labels and action verbs. */

export type BookingAction = {
  status: string;
  label: string;
  reason_required?: boolean;
  note?: string;
};

export type BookingPayment = {
  id?: string | null;
  status?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  provider_ref?: string | null;
  paid_at?: string | null;
  label?: string;
  refund_label?: string | null;
};

export type BookingPerson = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  avatar_url?: string | null;
};

export type BookingRow = {
  id: string;
  reference?: string;
  service_id: string;
  service?: {
    id: string;
    title?: string | null;
    cover_url?: string | null;
    pricing_type?: string | null;
    price_amount?: string | number | null;
    currency?: string | null;
    price_label?: string | null;
    availability_mode?: string | null;
    delivery_label?: string | null;
  } | null;
  requester?: BookingPerson | null;
  provider?: BookingPerson | null;
  location?: string | null;
  message?: string | null;
  appointment_label?: string;
  schedule_state?: string;
  requested_at?: string | null;
  requested_on?: string | null;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  payment?: BookingPayment | null;
  payment_explanation?: {
    code?: string;
    message?: string;
    recovery?: string | null;
  } | null;
  allowed_transitions?: string[];
  allowed_actions?: BookingAction[];
  finance_tx_id?: string | null;
  finance_href?: string | null;
  href?: string;
  people_customer_href?: string;
  people_provider_href?: string;
  service_href?: string;
  agreed_amount?: string | number | null;
  agreed_currency?: string | null;
  price_snapshot_note?: string;
};

export type BookingSummary = {
  awaiting_response?: number;
  awaiting_payment?: number;
  accepted_unscheduled?: number;
  upcoming?: number;
  completed_period?: number;
  closed_period?: number;
  period_from?: string;
  period_to?: string;
  label?: string;
};

export const ACTION_FALLBACK: Record<string, string> = {
  accepted: "Accept booking",
  declined: "Decline booking",
  cancelled: "Cancel booking",
  canceled: "Cancel booking",
  completed: "Mark completed",
};

export function actionVerb(status: string, actions?: BookingAction[]) {
  const fromApi = actions?.find((a) => a.status === status);
  if (fromApi?.label) return fromApi.label;
  return ACTION_FALLBACK[status] || status.replace(/_/g, " ");
}

export function reasonRequired(status: string, actions?: BookingAction[]) {
  const fromApi = actions?.find((a) => a.status === status);
  if (fromApi) return Boolean(fromApi.reason_required);
  return ["declined", "cancelled", "canceled"].includes(status);
}

export function initials(name?: string | null, id?: string) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }
  return (id || "?").slice(0, 2).toUpperCase();
}
