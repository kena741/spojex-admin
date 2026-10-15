export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "users:read", label: "View users", group: "Identity" },
  { key: "users:write", label: "Edit users", group: "Identity" },
  { key: "users:verify", label: "Verify users", group: "Identity" },
  { key: "organizations:read", label: "View organizations", group: "Identity" },
  { key: "organizations:write", label: "Edit organizations", group: "Identity" },
  { key: "organizations:verify", label: "Verify organizations", group: "Identity" },
  { key: "profiles:read", label: "View role profiles", group: "Identity" },
  { key: "profiles:write", label: "Manage account roles & profiles", group: "Identity" },
  { key: "services:read", label: "View services", group: "Marketplace" },
  { key: "services:write", label: "Manage services", group: "Marketplace" },
  { key: "catalog:read", label: "View categories", group: "Marketplace" },
  { key: "catalog:write", label: "Manage categories", group: "Marketplace" },
  { key: "requests:read", label: "View bookings", group: "Marketplace" },
  { key: "requests:write", label: "Manage bookings", group: "Marketplace" },
  { key: "reviews:read", label: "View reviews", group: "Marketplace" },
  { key: "stadiums:read", label: "View stadiums", group: "Marketplace" },
  { key: "stadiums:write", label: "Manage stadiums", group: "Marketplace" },
  { key: "gyms:read", label: "View gyms", group: "Marketplace" },
  { key: "gyms:write", label: "Manage gyms", group: "Marketplace" },
  { key: "events:read", label: "View events", group: "Marketplace" },
  { key: "events:write", label: "Manage events", group: "Marketplace" },
  { key: "donations:read", label: "View donations", group: "Marketplace" },
  { key: "donations:write", label: "Manage donations", group: "Marketplace" },
  { key: "news:read", label: "View sport news", group: "Marketplace" },
  { key: "news:write", label: "Manage sport news", group: "Marketplace" },
  { key: "banners:read", label: "View banners", group: "Content" },
  { key: "banners:write", label: "Manage banners", group: "Content" },
  { key: "streams:read", label: "View FM streams", group: "Marketplace" },
  { key: "streams:write", label: "Manage FM streams", group: "Marketplace" },
  { key: "miniapps:read", label: "View mini apps", group: "Marketplace" },
  { key: "miniapps:write", label: "Manage mini apps", group: "Marketplace" },
  { key: "opportunities:read", label: "View opportunities", group: "Marketplace" },
  { key: "opportunities:write", label: "Manage opportunities", group: "Marketplace" },
  { key: "network:read", label: "View connections", group: "Network" },
  { key: "network:write", label: "Manage connections", group: "Network" },
  { key: "reports:read", label: "View reports", group: "Network" },
  { key: "reports:write", label: "Manage reports", group: "Network" },
  { key: "messages:read", label: "View messages", group: "Network" },
  { key: "notifications:read", label: "View notifications", group: "Network" },
  { key: "notifications:write", label: "Send push notifications", group: "Network" },
  { key: "admins:read", label: "View admins", group: "Administration" },
  { key: "admins:write", label: "Manage admins", group: "Administration" },
  { key: "roles:read", label: "View roles", group: "Administration" },
  { key: "roles:write", label: "Manage roles", group: "Administration" },
  { key: "settings:read", label: "View global settings", group: "Administration" },
  { key: "settings:write", label: "Edit global settings", group: "Administration" },
  { key: "logs:read", label: "View activity logs", group: "Administration" },
];

export const DEFAULT_ADMIN_ROLES = [
  {
    slug: "super_admin",
    name: "Super Admin",
    description: "Full access to every SpoJex admin module",
    permissions: ["*"],
    is_system: true,
  },
  {
    slug: "operations_admin",
    name: "Operations Admin",
    description: "Identities, organizations, marketplace, and network operations",
    permissions: [
      "users:read",
      "users:write",
      "users:verify",
      "organizations:read",
      "organizations:write",
      "organizations:verify",
      "profiles:read",
      "profiles:write",
      "services:read",
      "services:write",
      "catalog:read",
      "catalog:write",
      "requests:read",
      "requests:write",
      "reviews:read",
      "stadiums:read",
      "stadiums:write",
      "events:read",
      "events:write",
      "donations:read",
      "donations:write",
      "news:read",
      "news:write",
      "banners:read",
      "banners:write",
      "streams:read",
      "streams:write",
      "miniapps:read",
      "miniapps:write",
      "opportunities:read",
      "opportunities:write",
      "network:read",
      "network:write",
      "reports:read",
      "reports:write",
      "messages:read",
      "notifications:read",
      "notifications:write",
      "settings:read",
      "settings:write",
      "logs:read",
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
    ],
    is_system: true,
  },
  {
    slug: "marketplace_admin",
    name: "Marketplace Admin",
    description: "Services, categories, requests, and reviews",
    permissions: [
      "services:read",
      "services:write",
      "catalog:read",
      "catalog:write",
      "requests:read",
      "requests:write",
      "reviews:read",
      "stadiums:read",
      "stadiums:write",
      "events:read",
      "events:write",
      "donations:read",
      "donations:write",
      "news:read",
      "news:write",
      "banners:read",
      "banners:write",
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
    description: "Read-only access across modules",
    permissions: [
      "users:read",
      "organizations:read",
      "profiles:read",
      "services:read",
      "catalog:read",
      "requests:read",
      "reviews:read",
      "stadiums:read",
      "events:read",
      "donations:read",
      "news:read",
      "banners:read",
      "streams:read",
      "miniapps:read",
      "opportunities:read",
      "network:read",
      "reports:read",
      "messages:read",
      "notifications:read",
    ],
    is_system: true,
  },
] as const;

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
  return permissions.some((granted) => permissionMatches(granted, required));
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
  if (pathname === "/admin/dashboard" || pathname === "/admin") return true;
  if (pathname.startsWith("/admin/users")) return can("users:read");
  if (pathname.startsWith("/admin/verifications")) return can("users:read");
  if (pathname.startsWith("/admin/verification-docs")) return can("profiles:read");
  if (pathname.startsWith("/admin/organizations")) return can("organizations:read");
  if (
    pathname.startsWith("/admin/athletes") ||
    pathname.startsWith("/admin/professionals") ||
    pathname.startsWith("/admin/media")
  ) {
    return can("profiles:read");
  }
  if (pathname.startsWith("/admin/services")) return can("services:read");
  if (pathname.startsWith("/admin/service-categories")) return can("catalog:read");
  if (pathname.startsWith("/admin/categories")) return can("profiles:read");
  if (pathname.startsWith("/admin/requests")) return can("requests:read");
  if (pathname.startsWith("/admin/wallets")) return can("requests:read");
  if (pathname.startsWith("/admin/withdrawals")) return can("requests:read");
  if (pathname.startsWith("/admin/coin-redemptions")) {
    return can("requests:read") || can("donations:read");
  }
  if (pathname.startsWith("/admin/coin-catalog")) return can("donations:read");
  if (pathname.startsWith("/admin/reviews")) return can("reviews:read");
  if (pathname.startsWith("/admin/stadiums")) return can("stadiums:read");
  if (pathname.startsWith("/admin/gyms")) return can("gyms:read");
  if (pathname.startsWith("/admin/gym-categories")) return can("gyms:read");
  if (pathname.startsWith("/admin/events")) return can("events:read");
  if (pathname.startsWith("/admin/live-events")) {
    return can("events:read") || can("streams:read");
  }
  if (pathname.startsWith("/admin/donations")) return can("donations:read");
  if (pathname.startsWith("/admin/news")) return can("news:read");
  if (pathname.startsWith("/admin/banners")) {
    return (
      can("banners:read") ||
      can("banners:write") ||
      can("services:read") ||
      can("services:write")
    );
  }
  // Hub lists radio + video; station detail stays streams-only.
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
  if (pathname.startsWith("/admin/finance/payment-settings")) {
    return can("settings:read");
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
  if (path.includes("/withdrawals/")) return "requests:write";
  if (path.includes("/coin-redemptions/")) return "requests:write";
  if (path.includes("/coin-packages") || path.includes("/coin-gifts") || path.includes("/coin-settings")) {
    return "donations:write";
  }
  if (path.includes("/gym-categories")) return "gyms:write";
  if (path.includes("/gyms")) return "gyms:write";
  if (path.includes("/categories")) return "catalog:write";
  if (path.includes("/stadiums")) return "stadiums:write";
  if (path.includes("/events/")) return "events:write";
  if (path.includes("/live-events/")) return "events:write";
  if (path.includes("/donations/")) return "donations:write";
  if (path.includes("/news/")) return "news:write";
  if (path.includes("/banners")) return "banners:write";
  if (path.includes("/streams/")) return "streams:write";
  if (path.includes("/radio-chat/")) return "streams:write";
  if (path.includes("/miniapps/")) return "miniapps:write";
  if (path.includes("/opportunities")) return "opportunities:write";
  if (path.includes("/profile-media/")) return "users:write";
  if (path.includes("/reports/")) return "reports:write";
  if (path.includes("/network")) return "network:write";
  if (path.includes("/settings")) return "settings:write";
  return null;
}

export function canReadRadioChat(can: (permission: string) => boolean) {
  return can("streams:read") || can("reports:read") || can("messages:read");
}

export function canModerateRadioChat(can: (permission: string) => boolean) {
  return can("streams:write") || can("reports:write");
}
