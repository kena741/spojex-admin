import type {
  CoinWalletRow,
  OrganizationRow,
  ProfileMediaRow,
  ServiceRequestRow,
  ServiceRow,
  UserRow,
  WalletRow,
  WithdrawalRow,
} from "@/lib/types";

export type FeedPreferences = {
  interests: string[];
  preferred_languages: string[];
  updated_at: string | null;
};

export type FeedTopicScore = {
  topic: string;
  score: number;
  recent_score: number;
  updated_at: string | null;
};

export type FeedCreatorScore = {
  creator_key: string;
  score: number;
  recent_score: number;
  updated_at: string | null;
};

export type FeedFeedbackEntry = {
  id: string;
  content_key: string;
  action: string;
  created_at: string;
};

/** What the For You feed has learned about a person. */
export type FeedInterestDetail = {
  preferences: FeedPreferences | null;
  topics: FeedTopicScore[];
  creators: FeedCreatorScore[];
  feedback: FeedFeedbackEntry[];
};

/** Everything the person detail page needs, fetched as one payload. */
export type PersonSnapshot = {
  user: UserRow | null;
  orgs: OrganizationRow[];
  mediaItems: ProfileMediaRow[];
  verificationId: string | null;
  verificationStatus: string | null;
  coinWallet: CoinWalletRow | null;
  services: ServiceRow[];
  wallet: WalletRow | null;
  withdrawals: WithdrawalRow[];
  bookings: ServiceRequestRow[];
  feedInterest: FeedInterestDetail | null;
};
