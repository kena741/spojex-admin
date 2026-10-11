import type { AchievementEntry, CareerEntry } from "./profile-docs";

export type JsonDoc<T> = {
  version?: number;
  updated_at?: string;
  entries?: T[];
};

export type UserRow = {
  id: string;
  user_id: string;
  display_name: string;
  full_name: string;
  username: string | null;
  role: string;
  headline: string;
  bio: string;
  country: string;
  city: string;
  currency: string;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
  athlete_profiles?: AthleteProfile | AthleteProfile[] | null;
  professional_profiles?: ProfessionalProfile | ProfessionalProfile[] | null;
  media_profiles?: MediaProfile | MediaProfile[] | null;
};

export type IdentityVerificationDocumentRow = {
  id: string;
  request_id: string;
  user_id: string;
  kind: string;
  label: string;
  storage_path: string;
  mime_type: string;
  created_at: string;
  signed_url?: string;
};

export type IdentityVerificationRequestRow = {
  id: string;
  user_id: string;
  status: string;
  notes: string;
  review_note: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "full_name" | "role" | "avatar_url" | "verified"> | null;
  identity_verification_documents?: IdentityVerificationDocumentRow[] | null;
  role_requirements?: Array<{
    slug: string;
    label: string;
    step: string;
    is_required: boolean;
    requirement_description?: string;
    sort_order?: number;
  }> | null;
};

export type AthleteProfile = {
  id: string;
  user_id: string;
  position: string;
  secondary_position?: string;
  preferred_foot: string;
  team: string;
  nationality?: string;
  playing_level?: string;
  height_cm: number | null;
  weight_kg: number | null;
  jersey_number: number | null;
  date_of_birth: string | null;
  years_experience: number | null;
  matches_played: number;
  goals: number;
  assists: number;
  man_of_the_match?: number;
  looking_for_opportunities?: boolean;
  opportunity_interests?: string[];
  career_history?: JsonDoc<CareerEntry> | null;
  achievements?: JsonDoc<AchievementEntry> | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfessionalProfile = {
  id: string;
  user_id: string;
  organization: string;
  license: string;
  certified: boolean;
  specializations: string[];
  regions: string[];
  age_groups: string[];
  years_experience: number | null;
  notes: string;
  career_history?: JsonDoc<CareerEntry> | null;
  achievements?: JsonDoc<AchievementEntry> | null;
  created_at?: string;
  updated_at?: string;
};

export type MediaProfile = {
  id: string;
  user_id: string;
  outlet: string;
  specialty: string;
  portfolio_url: string;
  regions: string[];
  years_experience: number | null;
  career_history?: JsonDoc<CareerEntry> | null;
  achievements?: JsonDoc<AchievementEntry> | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileMediaRow = {
  id: string;
  user_id: string;
  kind: "photo" | "highlight" | string;
  storage_path: string;
  url: string;
  mime_type: string;
  title: string;
  sort_order: number;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "username" | "avatar_url"> | null;
};

export type RadioChatMessageRow = {
  id: string;
  stream_id: string;
  user_id: string;
  message: string;
  created_at: string;
  status: "active" | "hidden" | "deleted" | string;
  deleted_at: string | null;
  radio_streams?: { id: string; name: string } | null;
  users?: Pick<UserRow, "id" | "display_name" | "username"> | null;
};

export type RadioChatReportRow = {
  id: string;
  reporter_id: string;
  message_id: string | null;
  target_user_id: string | null;
  stream_id: string;
  reason: string;
  details: string;
  created_at: string;
  radio_streams?: { id: string; name: string } | null;
  reporter?: Pick<UserRow, "id" | "display_name"> | null;
  target?: Pick<UserRow, "id" | "display_name"> | null;
  radio_chat_messages?: Pick<RadioChatMessageRow, "id" | "message" | "status"> | null;
};

export type OrganizationRow = {
  id: string;
  user_id: string;
  public_id: string;
  organization_type: string;
  name: string;
  description: string;
  country: string;
  city: string;
  currency: string;
  website: string | null;
  logo_url: string | null;
  verified: boolean;
  is_platform?: boolean;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "role"> | null;
};

export type ServiceCategory = {
  id: string;
  slug: string;
  label: string;
  emoji: string;
  sort_order: number;
  is_sport?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ServiceSubcategory = {
  id: string;
  category_id: string;
  slug: string;
  label: string;
  emoji: string;
  sort_order: number;
  is_sport?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ServiceRow = {
  id: string;
  provider_id: string;
  category_id: string;
  subcategory_id?: string | null;
  title: string;
  description: string;
  country: string;
  city: string;
  pricing_type: string;
  price_amount: number | null;
  currency: string;
  availability_mode: string;
  cover_url: string | null;
  images?: unknown;
  published: boolean;
  rating_avg: number;
  review_count: number;
  duration_minutes: number | null;
  service_area?: string;
  is_featured?: boolean;
  feature_requested_status?: string | null;
  feature_requested_at?: string | null;
  feature_request_fee?: number | null;
  feature_request_tx_ref?: string | null;
  feature_request_paid_at?: string | null;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "verified" | "avatar_url" | "role"> | null;
  category?: Pick<ServiceCategory, "id" | "label" | "emoji"> | null;
  subcategory?: Pick<ServiceSubcategory, "id" | "label" | "emoji"> | null;
};

export type ServicePaymentSnippet = {
  id: string;
  status: string;
  amount: number;
  currency: string;
};

export type ServiceRequestRow = {
  id: string;
  service_id: string;
  requester_id: string;
  provider_id: string;
  message: string;
  requested_on: string | null;
  requested_at?: string | null;
  location?: string;
  status: string;
  created_at: string;
  updated_at: string;
  services?: Pick<ServiceRow, "id" | "title"> | null;
  requester?: Pick<UserRow, "id" | "display_name"> | null;
  provider?: Pick<UserRow, "id" | "display_name"> | null;
  service_payments?: ServicePaymentSnippet | ServicePaymentSnippet[] | null;
};

export type WalletRow = {
  user_id: string;
  available: number;
  lifetime_earned: number;
  currency: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "full_name" | "role"> | null;
};

/** Spojex coin gifts wallet (`public.coin_wallets`). */
export type CoinWalletRow = {
  user_id: string;
  purchased_balance: number;
  received_balance: number;
  redeemable_balance: number;
  lifetime_purchased: number;
  lifetime_received: number;
  lifetime_gifted: number;
  updated_at?: string;
};

export type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  status: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "full_name"> | null;
};

export type ServiceReviewRow = {
  id: string;
  service_id: string;
  request_id: string | null;
  reviewer_id: string;
  provider_id: string;
  rating: number;
  body: string;
  created_at: string;
};

export type ReportRow = {
  id: string;
  reporter_id: string;
  target_user_id: string | null;
  target_service_id: string | null;
  reason: string;
  /** Free-text message / explanation submitted with the report. */
  details: string;
  created_at: string;
  reporter?: Pick<UserRow, "id" | "display_name" | "username" | "avatar_url"> | null;
  target?: Pick<UserRow, "id" | "display_name" | "username" | "avatar_url"> | null;
  service?: Pick<ServiceRow, "id" | "title"> | null;
};

export type NetworkUserBrief = {
  id: string;
  display_name: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

/** Unified row for Connections management (requests + accepted pairs). */
export type NetworkConnectionItem = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  from_user_id: string;
  to_user_id: string;
  from_user?: NetworkUserBrief | null;
  to_user?: NetworkUserBrief | null;
  created_at: string;
  responded_at?: string | null;
  request_id?: string | null;
  connection_id?: string | null;
  source: "request" | "connection";
};

export type ConnectionRow = {
  id: string;
  user_a: string;
  user_b: string;
  requester_id?: string;
  addressee_id?: string;
  status?: string;
  created_at: string;
  user_a_profile?: NetworkUserBrief | null;
  user_b_profile?: NetworkUserBrief | null;
};

export type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
  follower?: NetworkUserBrief | null;
  following?: NetworkUserBrief | null;
};

export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocker?: NetworkUserBrief | null;
  blocked?: NetworkUserBrief | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_path?: string | null;
  image_url?: string | null;
  created_at: string;
  conversation?: { type: string; title: string | null; state: string } | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type StadiumRow = {
  id: string;
  name: string;
  slug: string | null;
  location: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  size_type: string;
  capacity: number;
  photos: unknown[];
  image_url: string;
  facilities: string[];
  description: string;
  owner_name: string;
  owner_user_id: string | null;
  contact_phone: string;
  contact_email: string;
  status: string;
  pricing?: unknown;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email"> | null;
};

export type StadiumManagerRow = {
  id: string;
  stadium_id: string;
  user_id: string;
  manager_role: string;
  is_active: boolean;
  login_password: string;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "phone" | "role"> | null;
};

export type StadiumPlanRow = {
  plan_type: string;
  title: string;
  price_amount: number;
  currency: string;
};

export type StadiumBookingRow = {
  id: string;
  stadium_id: string;
  user_id: string;
  plan_id: string | null;
  plan_type: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name"> | null;
};

export type StadiumSubscriptionRow = {
  id: string;
  stadium_id: string;
  user_id: string;
  plan_id: string;
  plan_type: string;
  status: string;
  pass_code: string | null;
  pass_number: number | null;
  start_date: string | null;
  end_date: string | null;
  auto_renew: boolean;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name"> | null;
};

export type StadiumPaymentRow = {
  id: string;
  user_id: string;
  stadium_id: string;
  subscription_id: string | null;
  booking_id: string | null;
  plan_id: string | null;
  plan_type: string | null;
  amount: number;
  currency: string;
  payment_type: string;
  status: string;
  provider_ref: string;
  paid_at: string | null;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name"> | null;
};

export type DonationCampaignRow = {
  id: string;
  title: string;
  slug: string | null;
  summary: string;
  description: string;
  image_url: string;
  cover_url: string;
  goal_amount: number;
  raised_amount: number;
  goal_coins: number;
  raised_coins: number;
  beneficiary_user_id: string | null;
  currency: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DonationContributionRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  amount: number;
  currency: string;
  message: string;
  is_anonymous: boolean;
  status: string;
  provider_ref: string;
  paid_at: string | null;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name"> | null;
};

export type SportNewsRow = {
  id: string;
  title: string;
  slug: string | null;
  summary: string;
  body: string;
  image_url: string;
  cover_url: string;
  video_url?: string;
  audio_url?: string;
  category: string;
  source: string;
  author: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  published_at: string | null;
  organization_id?: string | null;
  created_at: string;
  updated_at: string;
  organizations?: Pick<
    OrganizationRow,
    "id" | "name" | "logo_url" | "user_id" | "public_id" | "is_platform" | "verified"
  > | null;
};

export type MiniAppRow = {
  id: string;
  slug: string;
  name: string;
  partner: string;
  summary: string;
  category: string;
  icon: string;
  logo_url: string;
  url: string;
  published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type RadioStreamRow = {
  id: string;
  name: string;
  slug: string | null;
  tagline: string;
  stream_url: string;
  website_url: string;
  image_url: string;
  genre: string;
  city: string;
  status: string;
  is_featured: boolean;
  sort_order: number;
  host_user_id?: string | null;
  host_org_id?: string | null;
  created_at: string;
  updated_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "role"> | null;
  organizations?: Pick<OrganizationRow, "id" | "name" | "public_id"> | null;
};

export type LiveEventRow = {
  id: string;
  kind: string;
  name: string;
  slug: string | null;
  thumbnail_url: string;
  stream_url: string;
  stream_kind?: string;
  replay_url?: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  location?: string;
  organizer?: string;
  competition?: string;
  stadium?: string;
  home_name: string;
  away_name: string;
  home_logo_url?: string;
  away_logo_url?: string;
  home_score: number;
  away_score: number;
  match_minute: number;
  match_period: string;
  status_line?: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_photo_url?: string;
  fighter_b_photo_url?: string;
  weight_class?: string;
  current_round: number;
  total_rounds: number;
  round_seconds_left: number;
  fight_result: string;
  description: string;
  chat_enabled?: boolean;
  viewer_count?: number;
  sort_order: number;
  host_user_id?: string | null;
  host_org_id?: string | null;
  default_duration_minutes?: number;
  round_ends_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  name: string;
  slug: string | null;
  venue_name: string;
  location: string;
  address: string;
  starts_at: string;
  ends_at: string | null;
  ticket_price: number;
  currency: string;
  capacity: number;
  photos: unknown[];
  image_url: string;
  description: string;
  status: string;
  /** Shown in the app Upcoming Events rail when true. */
  is_upcoming?: boolean;
  category?: string;
  visibility?: string;
  lifecycle?: string;
  service_fee_percent?: number;
  important_info?: string;
  entry_rules?: string;
  organizer_name?: string;
  organizer_info?: string;
  schedule?: unknown[];
  sponsors?: unknown[];
  sales_starts_at?: string | null;
  sales_ends_at?: string | null;
  invite_token?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at: string;
};

export type EventTicketTierRow = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  capacity: number;
  max_per_user: number;
  benefits: string;
  entry_rules: string;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sold?: number;
  remaining?: number | null;
};

export type EventRsvpRow = {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  invited_at: string;
  responded_at: string | null;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "phone"> | null;
};

export type EventTicketRow = {
  id: string;
  event_id: string;
  user_id: string;
  ticket_code: string;
  ticket_number: number | null;
  quantity: number;
  amount: number;
  currency: string;
  status: string;
  guest_name: string;
  guest_phone: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  tier_id?: string | null;
  tier_name?: string;
  order_id?: string | null;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "phone"> | null;
};

export type EventManagerRow = {
  id: string;
  event_id: string;
  user_id: string;
  manager_role: string;
  is_active: boolean;
  login_password: string;
  created_at: string;
  users?: Pick<UserRow, "id" | "display_name" | "email" | "phone" | "role"> | null;
};

export function nestedRecord<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
