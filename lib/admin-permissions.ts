export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
}

/** Keep in sync with backend admin_rbac.PERMISSION_CATALOG */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "users:read", label: "View users", group: "Identity" },
  { key: "users:write", label: "Edit users", group: "Identity" },
  { key: "users:verify", label: "Verify users", group: "Identity" },
  { key: "users:reset_password", label: "Reset user passwords", group: "Identity" },
  { key: "users:delete", label: "Delete users", group: "Identity" },
  { key: "organizations:read", label: "View organizations", group: "Identity" },
  { key: "organizations:write", label: "Edit organizations", group: "Identity" },
  { key: "organizations:verify", label: "Verify organizations", group: "Identity" },
  { key: "profiles:read", label: "View role profiles", group: "Identity" },
  { key: "profiles:write", label: "Manage profiles & media", group: "Identity" },
  { key: "profile_catalog:read", label: "View profile configuration", group: "Identity" },
  { key: "profile_catalog:write", label: "Edit profile configuration drafts", group: "Identity" },
  { key: "profile_catalog:publish", label: "Publish profile configuration", group: "Identity" },
  { key: "services:read", label: "View services", group: "Marketplace" },
  { key: "services:write", label: "Manage services", group: "Marketplace" },
  { key: "catalog:read", label: "View categories", group: "Marketplace" },
  { key: "catalog:write", label: "Manage categories", group: "Marketplace" },
  { key: "requests:read", label: "View bookings", group: "Marketplace" },
  { key: "requests:write", label: "Manage bookings", group: "Marketplace" },
  { key: "reviews:read", label: "View reviews", group: "Marketplace" },
  { key: "reviews:write", label: "Moderate reviews", group: "Marketplace" },
  { key: "miniapps:read", label: "View mini apps", group: "Marketplace" },
  { key: "miniapps:write", label: "Manage mini apps", group: "Marketplace" },
  { key: "opportunities:read", label: "View opportunities", group: "Marketplace" },
  { key: "opportunities:write", label: "Manage opportunities", group: "Marketplace" },
  { key: "stadiums:read", label: "View stadiums", group: "Native apps" },
  { key: "stadiums:write", label: "Manage stadiums", group: "Native apps" },
  { key: "gyms:read", label: "View gyms", group: "Native apps" },
  { key: "gyms:write", label: "Manage gyms", group: "Native apps" },
  { key: "events:read", label: "View events", group: "Native apps" },
  { key: "events:write", label: "Manage events", group: "Native apps" },
  { key: "donations:read", label: "View donations", group: "Native apps" },
  { key: "donations:write", label: "Manage donations", group: "Native apps" },
  { key: "streams:read", label: "View FM / live streams", group: "Native apps" },
  { key: "streams:write", label: "Manage FM / live streams", group: "Native apps" },
  { key: "news:read", label: "View sport news", group: "Content" },
  { key: "news:write", label: "Manage sport news", group: "Content" },
  { key: "sounds:read", label: "View sound library", group: "Content" },
  { key: "sounds:write", label: "Manage sound library", group: "Content" },
  { key: "banners:read", label: "View banners", group: "Content" },
  { key: "banners:write", label: "Manage banners", group: "Content" },
  { key: "analytics:read", label: "View analytics dashboard", group: "Content" },
  { key: "finance:read", label: "View transaction summaries", group: "Finance" },
  { key: "finance:sensitive:read", label: "View sensitive payment details", group: "Finance" },
  { key: "finance:export", label: "Export transactions", group: "Finance" },
  { key: "wallets:read", label: "View balances and ledger", group: "Finance" },
  { key: "wallets:adjust:request", label: "Request wallet adjustment", group: "Finance" },
  { key: "wallets:adjust:approve", label: "Approve wallet adjustment", group: "Finance" },
  { key: "wallets:adjust:execute", label: "Execute approved wallet adjustment", group: "Finance" },
  { key: "wallets:adjust:history", label: "View adjustment history", group: "Finance" },
  { key: "wallets:write", label: "Legacy: wallet adjust (maps to request/approve/execute)", group: "Finance" },
  { key: "withdrawals:read", label: "View withdrawals", group: "Finance" },
  { key: "withdrawals:prepare", label: "Prepare / request withdrawal action", group: "Finance" },
  { key: "withdrawals:approve", label: "Approve / reject withdrawal", group: "Finance" },
  { key: "withdrawals:execute", label: "Execute / retry eligible withdrawal", group: "Finance" },
  { key: "withdrawals:beneficiaries", label: "Manage payout beneficiaries", group: "Finance" },
  { key: "withdrawals:write", label: "Legacy: resolve withdrawals (maps to prepare/approve/execute)", group: "Finance" },
  { key: "coins:read", label: "View coin catalog", group: "Finance" },
  { key: "coins:catalog:write", label: "Manage coin catalog", group: "Finance" },
  { key: "coins:rates:propose", label: "Propose coin rate changes", group: "Finance" },
  { key: "coins:rates:approve", label: "Approve coin rate changes", group: "Finance" },
  { key: "coins:redemptions:execute", label: "Resolve coin redemptions", group: "Finance" },
  { key: "coins:write", label: "Legacy: manage coins & redemptions", group: "Finance" },
  { key: "payments:read", label: "View payment gateway status (no secrets)", group: "Finance" },
  { key: "payments:config:propose", label: "Propose commission / fee changes", group: "Finance" },
  { key: "payments:config:approve", label: "Approve commission / fee changes", group: "Finance" },
  { key: "payments:credentials", label: "Rotate payment credentials (privileged)", group: "Finance" },
  { key: "payments:write", label: "Legacy: edit payment settings", group: "Finance" },
  { key: "finance:reconcile:read", label: "View reconciliation discrepancies", group: "Finance" },
  { key: "finance:reconcile:propose", label: "Propose reconciliation resolution", group: "Finance" },
  { key: "finance:reconcile:approve", label: "Approve reconciliation corrective action", group: "Finance" },
  { key: "network:read", label: "View connections", group: "Network" },
  { key: "network:write", label: "Manage connections", group: "Network" },
  { key: "reports:read", label: "View reports", group: "Network" },
  { key: "reports:write", label: "Manage reports", group: "Network" },
  { key: "messages:read", label: "View messages", group: "Network" },
  { key: "notifications:read", label: "View notifications", group: "Network" },
  { key: "notifications:write", label: "Send push notifications", group: "Network" },
  { key: "admins:read", label: "View admins", group: "Administration" },
  { key: "admins:write", label: "Manage admins & invitations", group: "Administration" },
  { key: "admins:invite", label: "Invite staff", group: "Administration" },
  { key: "roles:read", label: "View roles", group: "Administration" },
  { key: "roles:write", label: "Manage roles", group: "Administration" },
  { key: "settings:read", label: "View global settings", group: "Administration" },
  { key: "settings:write", label: "Edit global settings", group: "Administration" },
  { key: "logs:read", label: "View activity logs", group: "Administration" },
  { key: "logs:export", label: "Export activity logs", group: "Administration" },
];

const FINANCE_WRITE_PREFIXES = [
  "wallets:adjust",
  "wallets:write",
  "withdrawals:prepare",
  "withdrawals:approve",
  "withdrawals:execute",
  "withdrawals:beneficiaries",
  "withdrawals:write",
  "coins:catalog",
  "coins:rates",
  "coins:redemptions",
  "coins:write",
  "payments:config",
  "payments:credentials",
  "payments:write",
  "finance:export",
  "finance:sensitive",
  "finance:reconcile:propose",
  "finance:reconcile:approve",
];

function isFinanceWriteKey(key: string) {
  return FINANCE_WRITE_PREFIXES.some((p) => key === p || key.startsWith(p));
}

const READ_KEYS = PERMISSION_DEFINITIONS.filter(
  (p) =>
    p.key.endsWith(":read") &&
    p.key !== "messages:read" &&
    p.key !== "finance:sensitive:read",
).map((p) => p.key);

export const DEFAULT_ADMIN_ROLES = [
  {
    slug: "super_admin",
    name: "Super Admin",
    description:
      "Exceptional platform administration. Does not silently bypass financial dual-control rules.",
    permissions: ["*"],
    is_system: true,
  },
  {
    slug: "operations_admin",
    name: "Operations Admin",
    description: "Identities, marketplace, native apps, content, and network - no money movement",
    permissions: PERMISSION_DEFINITIONS.map((p) => p.key).filter(
      (k) =>
        !k.startsWith("admins:") &&
        !k.startsWith("roles:") &&
        k !== "logs:export" &&
        k !== "messages:read" &&
        k !== "payments:credentials" &&
        !isFinanceWriteKey(k),
    ),
    is_system: true,
  },
  {
    slug: "finance_viewer",
    name: "Finance Viewer",
    description: "Read-only financial reporting (no sensitive payment secrets or exports)",
    permissions: [
      "finance:read",
      "finance:reconcile:read",
      "wallets:read",
      "wallets:adjust:history",
      "withdrawals:read",
      "coins:read",
      "payments:read",
      "donations:read",
      "requests:read",
      "logs:read",
    ],
    is_system: true,
  },
  {
    slug: "finance_operator",
    name: "Finance Operator",
    description: "Prepares financial requests; cannot approve own operations",
    permissions: [
      "finance:read",
      "finance:reconcile:read",
      "finance:reconcile:propose",
      "wallets:read",
      "wallets:adjust:request",
      "wallets:adjust:history",
      "withdrawals:read",
      "withdrawals:prepare",
      "coins:read",
      "coins:catalog:write",
      "coins:rates:propose",
      "payments:read",
      "payments:config:propose",
      "donations:read",
      "requests:read",
      "logs:read",
    ],
    is_system: true,
  },
  {
    slug: "finance_approver",
    name: "Finance Approver",
    description: "Approves eligible finance requests and executes when authorized",
    permissions: [
      "finance:read",
      "finance:sensitive:read",
      "finance:reconcile:read",
      "finance:reconcile:approve",
      "wallets:read",
      "wallets:adjust:approve",
      "wallets:adjust:execute",
      "wallets:adjust:history",
      "withdrawals:read",
      "withdrawals:approve",
      "withdrawals:execute",
      "coins:read",
      "coins:rates:approve",
      "coins:redemptions:execute",
      "payments:read",
      "payments:config:approve",
      "donations:read",
      "requests:read",
      "logs:read",
    ],
    is_system: true,
  },
  {
    slug: "finance_admin",
    name: "Finance Admin",
    description: "Legacy combined finance role. Prefer split viewer/operator/approver for SoD.",
    permissions: [
      "finance:read",
      "finance:sensitive:read",
      "finance:export",
      "finance:reconcile:read",
      "finance:reconcile:propose",
      "finance:reconcile:approve",
      "wallets:read",
      "wallets:write",
      "wallets:adjust:request",
      "wallets:adjust:approve",
      "wallets:adjust:execute",
      "wallets:adjust:history",
      "withdrawals:read",
      "withdrawals:write",
      "withdrawals:prepare",
      "withdrawals:approve",
      "withdrawals:execute",
      "withdrawals:beneficiaries",
      "coins:read",
      "coins:write",
      "coins:catalog:write",
      "coins:rates:propose",
      "coins:rates:approve",
      "coins:redemptions:execute",
      "payments:read",
      "payments:write",
      "payments:config:propose",
      "payments:config:approve",
      "donations:read",
      "requests:read",
      "logs:read",
    ],
    is_system: true,
  },
  {
    slug: "content_admin",
    name: "Content Admin",
    description: "News, sound library, banners, and analytics",
    permissions: [
      "news:read",
      "news:write",
      "sounds:read",
      "sounds:write",
      "banners:read",
      "banners:write",
      "analytics:read",
      "streams:read",
      "donations:read",
    ],
    is_system: true,
  },
  {
    slug: "identity_admin",
    name: "Identity Admin",
    description: "Users, organizations, and role profiles",
    permissions: [
      "users:read",
      "users:write",
      "users:verify",
      "organizations:read",
      "organizations:write",
      "organizations:verify",
      "profiles:read",
      "profiles:write",
      "profile_catalog:read",
      "profile_catalog:write",
      "profile_catalog:publish",
    ],
    is_system: true,
  },
  {
    slug: "marketplace_admin",
    name: "Marketplace Admin",
    description: "Services, bookings, stadiums, gyms, events, and apps",
    permissions: [
      "services:read",
      "services:write",
      "catalog:read",
      "catalog:write",
      "requests:read",
      "requests:write",
      "reviews:read",
      "reviews:write",
      "stadiums:read",
      "stadiums:write",
      "gyms:read",
      "gyms:write",
      "events:read",
      "events:write",
      "donations:read",
      "donations:write",
      "streams:read",
      "streams:write",
      "miniapps:read",
      "miniapps:write",
      "opportunities:read",
      "opportunities:write",
    ],
    is_system: true,
  },
  {
    slug: "support_admin",
    name: "Support Admin",
    description: "Reports, messages, notifications, and read access to users",
    permissions: [
      "users:read",
      "reports:read",
      "reports:write",
      "messages:read",
      "notifications:read",
      "notifications:write",
      "network:read",
      "network:write",
    ],
    is_system: true,
  },
  {
    slug: "viewer",
    name: "Viewer",
    description:
      "Read-only operational access. Excludes private messages, sensitive finance, and exports.",
    permissions: READ_KEYS,
    is_system: true,
  },
] as const;

/** Legacy broad grants expand to granular keys (mirror backend PERMISSION_EXPANDS). */
const PERMISSION_EXPANDS: Record<string, string[]> = {
  "wallets:write": [
    "wallets:adjust:request",
    "wallets:adjust:approve",
    "wallets:adjust:execute",
    "wallets:adjust:history",
  ],
  "withdrawals:write": ["withdrawals:prepare", "withdrawals:approve", "withdrawals:execute"],
  "coins:write": [
    "coins:catalog:write",
    "coins:rates:propose",
    "coins:rates:approve",
    "coins:redemptions:execute",
  ],
  "payments:write": ["payments:config:propose", "payments:config:approve"],
  "finance:read": ["finance:reconcile:read", "wallets:adjust:history"],
};

export const SENSITIVE_PERMISSION_KEYS = new Set([
  "finance:sensitive:read",
  "finance:export",
  "logs:export",
  "payments:credentials",
  "payments:write",
  "wallets:adjust:execute",
  "wallets:write",
  "withdrawals:execute",
  "withdrawals:write",
  "coins:redemptions:execute",
  "coins:write",
  "messages:read",
  "admins:write",
  "roles:write",
  "*",
]);

export type AdminRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminRoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  staff_count?: number;
  created_at: string;
  updated_at: string;
};

export function permissionMatches(granted: string, required: string) {
  if (granted === "*") return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -2);
    return required === prefix || required.startsWith(`${prefix}:`);
  }
  return granted === required;
}

export function hasPermission(permissions: string[], required: string) {
  const expanded = new Set<string>();
  for (const key of permissions) {
    expanded.add(key);
    for (const extra of PERMISSION_EXPANDS[key] ?? []) expanded.add(extra);
  }
  if ([...expanded].some((g) => permissionMatches(g, "*")) || expanded.has("*")) {
    return true;
  }
  const known = new Set(PERMISSION_DEFINITIONS.map((p) => p.key));
  if (!known.has(required)) return false;
  return [...expanded].some((granted) => permissionMatches(granted, required));
}

export function groupPermissionsByCategory(permissions: PermissionDefinition[]) {
  return permissions.reduce<Record<string, PermissionDefinition[]>>((acc, permission) => {
    if (!acc[permission.group]) acc[permission.group] = [];
    acc[permission.group].push(permission);
    return acc;
  }, {});
}

export function permissionsForRole(slug: string, stored?: string[] | null) {
  if (slug === "super_admin") return ["*"];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  const fallback = DEFAULT_ADMIN_ROLES.find((role) => role.slug === slug);
  return fallback ? [...fallback.permissions] : [];
}

export function canAccessAdminRoute(pathname: string, can: (permission: string) => boolean) {
  if (pathname === "/admin/dashboard" || pathname === "/admin") {
    return can("analytics:read") || can("admins:read") || can("users:read");
  }
  if (pathname.startsWith("/admin/people")) {
    return can("users:read") || can("profiles:read");
  }
  if (pathname.startsWith("/admin/users")) return can("users:read") || can("profiles:read");
  if (pathname.startsWith("/admin/verifications")) {
    return can("users:read") || can("profiles:read") || can("users:verify");
  }
  if (pathname.startsWith("/admin/verification-docs")) return can("profiles:read");
  if (pathname.startsWith("/admin/profile-config")) {
    return can("profile_catalog:read") || can("profile_catalog:write");
  }
  if (pathname.startsWith("/admin/organizations")) return can("organizations:read");
  if (
    pathname.startsWith("/admin/athletes") ||
    pathname.startsWith("/admin/professionals") ||
    pathname.startsWith("/admin/media")
  ) {
    return can("profiles:read") || can("users:read");
  }
  if (pathname === "/admin/marketplace" || pathname.startsWith("/admin/marketplace/")) {
    return (
      can("services:read") ||
      can("requests:read") ||
      can("opportunities:read") ||
      can("miniapps:read") ||
      can("catalog:read")
    );
  }
  if (
    pathname.startsWith("/admin/services/settings") ||
    pathname.startsWith("/admin/service-categories")
  ) {
    return can("catalog:read") || can("services:read");
  }
  if (pathname.startsWith("/admin/services")) return can("services:read");
  if (pathname.startsWith("/admin/categories")) return can("profiles:read");
  if (pathname.startsWith("/admin/requests")) return can("requests:read");
  if (pathname.startsWith("/admin/wallets")) return can("wallets:read") || can("requests:read");
  if (pathname.startsWith("/admin/withdrawals")) {
    return can("withdrawals:read") || can("requests:read");
  }
  if (pathname.startsWith("/admin/coin-redemptions")) {
    return can("coins:read") || can("requests:read") || can("donations:read");
  }
  if (pathname.startsWith("/admin/coin-catalog")) {
    return can("coins:read") || can("donations:read");
  }
  if (pathname.startsWith("/admin/reviews")) return can("reviews:read");
  if (pathname.startsWith("/admin/native-apps")) {
    return (
      can("stadiums:read") ||
      can("gyms:read") ||
      can("events:read") ||
      can("donations:read") ||
      can("streams:read") ||
      can("events:read")
    );
  }
  if (pathname.startsWith("/admin/stadiums")) return can("stadiums:read");
  if (pathname.startsWith("/admin/gyms")) return can("gyms:read");
  if (pathname.startsWith("/admin/gym-categories")) return can("gyms:read");
  if (pathname.startsWith("/admin/events")) return can("events:read");
  if (pathname.startsWith("/admin/live-events")) {
    return can("events:read") || can("streams:read");
  }
  if (pathname.startsWith("/admin/donations")) return can("donations:read");
  if (pathname === "/admin/content" || pathname.startsWith("/admin/content/")) {
    return (
      can("news:read") ||
      can("sounds:read") ||
      can("banners:read") ||
      can("streams:read") ||
      can("reports:read") ||
      can("analytics:read")
    );
  }
  if (pathname.startsWith("/admin/news")) return can("news:read");
  if (pathname.startsWith("/admin/feed-insights") || pathname.startsWith("/admin/feed-interests")) {
    return can("news:read") || can("users:read");
  }
  if (pathname.startsWith("/admin/media-library") || pathname.startsWith("/admin/sound-library")) {
    return can("sounds:read") || can("news:read");
  }
  if (pathname.startsWith("/admin/banners")) {
    return can("banners:read") || can("banners:write") || can("services:read");
  }
  if (pathname.match(/^\/admin\/streams\/[^/]+/)) return can("streams:read");
  if (pathname.startsWith("/admin/streams")) {
    return can("streams:read") || can("events:read");
  }
  if (pathname.startsWith("/admin/radio-chat")) {
    return can("streams:read") || can("reports:read") || can("messages:read");
  }
  if (pathname.startsWith("/admin/miniapps")) return can("miniapps:read");
  if (pathname.startsWith("/admin/opportunities")) return can("opportunities:read");
  if (pathname.startsWith("/admin/profile-media")) {
    return can("users:read") || can("profiles:read");
  }
  if (pathname.startsWith("/admin/network")) return can("network:read");
  if (pathname.startsWith("/admin/reports")) return can("reports:read");
  if (pathname.startsWith("/admin/messages")) return can("messages:read");
  if (pathname.startsWith("/admin/notifications")) return can("notifications:read");
  if (pathname.startsWith("/admin/admins")) return can("admins:read");
  if (pathname.startsWith("/admin/roles")) return can("roles:read");
  if (pathname.startsWith("/admin/settings")) return can("settings:read");
  if (pathname === "/admin/finance" || pathname.startsWith("/admin/finance/overview")) {
    return (
      can("finance:read") || can("wallets:read") || can("payments:read") || can("withdrawals:read")
    );
  }
  if (pathname.startsWith("/admin/finance/transactions")) {
    return can("finance:read") || can("wallets:read") || can("payments:read");
  }
  if (
    pathname.startsWith("/admin/finance/wallets") ||
    pathname.startsWith("/admin/wallets")
  ) {
    return can("wallets:read") || can("requests:read") || can("finance:read");
  }
  if (pathname.startsWith("/admin/finance/payouts")) {
    return (
      can("withdrawals:read") || can("coins:read") || can("requests:read") || can("donations:read")
    );
  }
  if (pathname.startsWith("/admin/finance/coins") || pathname.startsWith("/admin/coin-catalog")) {
    return can("coins:read") || can("donations:read");
  }
  if (pathname.startsWith("/admin/finance/reconciliation")) {
    return can("finance:read") || can("wallets:read");
  }
  if (pathname.startsWith("/admin/finance/payment-settings")) {
    return can("payments:read") || can("settings:read");
  }
  if (pathname.startsWith("/admin/activity-logs")) return can("logs:read");
  return false;
}

export function writePermissionForPatch(path: string) {
  if (path.includes("/users/")) return "users:write";
  if (path.includes("/verifications/")) return "users:verify";
  if (path.includes("/verification-docs")) return "profiles:write";
  if (path.includes("/organizations")) return "organizations:write";
  if (path.includes("/services/")) return "services:write";
  if (path.includes("/requests/")) return "requests:write";
  if (path.includes("/withdrawals/")) return "withdrawals:write";
  if (path.includes("/coin-redemptions/")) return "coins:write";
  if (path.includes("/coin-packages") || path.includes("/coin-gifts") || path.includes("/coin-settings")) {
    return "coins:write";
  }
  if (path.includes("/gym-categories")) return "gyms:write";
  if (path.includes("/gyms")) return "gyms:write";
  if (path.includes("/categories")) return "catalog:write";
  if (path.includes("/stadiums")) return "stadiums:write";
  if (path.includes("/events/")) return "events:write";
  if (path.includes("/live-events/")) return "events:write";
  if (path.includes("/donations/")) return "donations:write";
  if (path.includes("/news/")) return "news:write";
  if (path.includes("/news-sounds")) return "sounds:write";
  if (path.includes("/banners")) return "banners:write";
  if (path.includes("/streams/")) return "streams:write";
  if (path.includes("/radio-chat/")) return "streams:write";
  if (path.includes("/miniapps/")) return "miniapps:write";
  if (path.includes("/opportunities")) return "opportunities:write";
  if (path.includes("/profile-media/")) return "users:write";
  if (path.includes("/reports/")) return "reports:write";
  if (path.includes("/network")) return "network:write";
  if (path.includes("/settings")) return "settings:write";
  if (path.includes("/payment-settings")) return "payments:write";
  return null;
}

export function canReadRadioChat(can: (permission: string) => boolean) {
  return can("streams:read") || can("reports:read") || can("messages:read");
}

export function canModerateRadioChat(can: (permission: string) => boolean) {
  return can("streams:write") || can("reports:write");
}
