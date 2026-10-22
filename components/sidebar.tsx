"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  FolderTree,
  Flag,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  Music,
  Newspaper,
  Sparkles,
  Share2,
  Shield,
  ShieldCheck,
  Store,
  UserCog,
  UserRound,
  Users,
  Calendar,
  Landmark,
  Heart,
  Radio,
  ShoppingBag,
  ClipboardList,
  AppWindow,
  BadgeCheck,
  Briefcase,
  Wallet,
  Banknote,
  Coins,
  CreditCard,
  Receipt,
  Scale,
  Settings,
  ScrollText,
  Dumbbell,
  Images,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SpojexLogo } from "@/components/spojex-logo";
import { canReadRadioChat } from "@/lib/admin-permissions";
import { canManageLiveEvents } from "@/lib/live-events";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

function navClass(active: boolean) {
  return active
    ? "bg-primary/10 text-primary font-medium"
    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground";
}

function iconClass(active: boolean) {
  return active ? "text-primary" : "text-text-hint group-hover:text-muted-foreground";
}

type NavItem = {
  href: string;
  label: string;
  icon: typeof Users;
  visible: (can: (permission: string) => boolean) => boolean;
  /** Non-navigable placeholder (e.g. Shops). */
  comingSoon?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const identityItems: NavItem[] = [
  {
    href: "/admin/people",
    label: "People",
    icon: Users,
    visible: (can) => can("users:read") || can("profiles:read"),
  },
  {
    href: "/admin/organizations",
    label: "Organizations",
    icon: Building2,
    visible: (can) => can("organizations:read"),
  },
  {
    href: "/admin/verifications",
    label: "Verification Center",
    icon: BadgeCheck,
    visible: (can) => can("users:read") || can("profiles:read") || can("users:verify"),
  },
];

const marketplaceItems: NavItem[] = [
  {
    href: "/admin/marketplace",
    label: "Overview",
    icon: LayoutDashboard,
    visible: (can) =>
      can("services:read") ||
      can("requests:read") ||
      can("opportunities:read") ||
      can("miniapps:read") ||
      can("catalog:read"),
  },
  { href: "/admin/services", label: "Services", icon: ShoppingBag, visible: (can) => can("services:read") },
  { href: "/admin/requests", label: "Bookings", icon: ClipboardList, visible: (can) => can("requests:read") },
  {
    href: "/admin/opportunities",
    label: "Opportunities",
    icon: Briefcase,
    visible: (can) => can("opportunities:read"),
  },
  { href: "/admin/miniapps", label: "Mini Apps", icon: AppWindow, visible: (can) => can("miniapps:read") },
  {
    href: "/admin/marketplace/settings",
    label: "Settings",
    icon: FolderTree,
    visible: (can) => can("catalog:read") || can("services:write"),
  },
];

const nativeAppItems: NavItem[] = [
  {
    href: "/admin/native-apps",
    label: "Overview",
    icon: LayoutDashboard,
    visible: (can) =>
      can("stadiums:read") ||
      can("gyms:read") ||
      can("events:read") ||
      can("donations:read") ||
      can("streams:read") ||
      canManageLiveEvents(can),
  },
  { href: "/admin/stadiums", label: "Stadiums", icon: Landmark, visible: (can) => can("stadiums:read") },
  { href: "/admin/gyms", label: "Gyms", icon: Dumbbell, visible: (can) => can("gyms:read") },
  { href: "/admin/events", label: "Events", icon: Calendar, visible: (can) => can("events:read") },
  { href: "/admin/donations", label: "Donations", icon: Heart, visible: (can) => can("donations:read") },
  {
    href: "/admin/streams",
    label: "Streams",
    icon: Radio,
    visible: (can) => can("streams:read") || canManageLiveEvents(can),
  },
  {
    href: "/admin/shops",
    label: "Shops",
    icon: Store,
    comingSoon: true,
    visible: (can) =>
      can("stadiums:read") ||
      can("gyms:read") ||
      can("events:read") ||
      can("donations:read") ||
      can("streams:read") ||
      canManageLiveEvents(can),
  },
];

/** Wallet + coin + payment surfaces in one Finance group. */
const financeItems: NavItem[] = [
  {
    href: "/admin/finance",
    label: "Overview",
    icon: LayoutDashboard,
    visible: (can) =>
      can("finance:read") || can("wallets:read") || can("payments:read") || can("withdrawals:read"),
  },
  {
    href: "/admin/finance/transactions",
    label: "Transactions",
    icon: Receipt,
    visible: (can) => can("finance:read") || can("wallets:read") || can("payments:read"),
  },
  {
    href: "/admin/finance/wallets",
    label: "Wallets & Ledgers",
    icon: Wallet,
    visible: (can) => can("wallets:read") || can("requests:read") || can("finance:read"),
  },
  {
    href: "/admin/finance/payouts",
    label: "Payouts",
    icon: Banknote,
    visible: (can) =>
      can("withdrawals:read") || can("coins:read") || can("requests:read") || can("donations:read"),
  },
  {
    href: "/admin/finance/coins",
    label: "Coins & Gifts",
    icon: Coins,
    visible: (can) => can("coins:read") || can("donations:read"),
  },
  {
    href: "/admin/finance/reconciliation",
    label: "Reconciliation",
    icon: Scale,
    visible: (can) => can("finance:read") || can("wallets:read"),
  },
  {
    href: "/admin/finance/payment-settings",
    label: "Payment Settings",
    icon: CreditCard,
    visible: (can) => can("payments:read") || can("settings:read"),
  },
];

const contentItems: NavItem[] = [
  {
    href: "/admin/content",
    label: "Overview",
    icon: LayoutDashboard,
    visible: (can) =>
      can("news:read") ||
      can("sounds:read") ||
      can("banners:read") ||
      can("streams:read") ||
      can("reports:read") ||
      can("analytics:read"),
  },
  { href: "/admin/news", label: "Sport News", icon: Newspaper, visible: (can) => can("news:read") },
  {
    href: "/admin/media-library",
    label: "Media Library",
    icon: Music,
    visible: (can) => can("sounds:read") || can("news:read"),
  },
  {
    href: "/admin/banners",
    label: "Banners",
    icon: Images,
    visible: (can) =>
      can("banners:read") ||
      can("banners:write") ||
      can("services:read") ||
      can("services:write"),
  },
  { href: "/admin/radio-chat", label: "Radio Chat", icon: MessageCircle, visible: canReadRadioChat },
  {
    href: "/admin/feed-insights",
    label: "Feed Insights",
    icon: Sparkles,
    visible: (can) => can("news:read") || can("users:read"),
  },
];

const networkItems: NavItem[] = [
  { href: "/admin/network", label: "Connections", icon: Share2, visible: (can) => can("network:read") },
  { href: "/admin/reports", label: "Reports", icon: Flag, visible: (can) => can("reports:read") },
  { href: "/admin/messages", label: "Messages", icon: MessagesSquare, visible: (can) => can("messages:read") },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, visible: (can) => can("notifications:read") },
];

const systemItems: NavItem[] = [
  {
    href: "/admin/settings",
    label: "Global settings",
    icon: Settings,
    visible: (can) => can("settings:read"),
  },
  {
    href: "/admin/activity-logs",
    label: "Activity Logs",
    icon: ScrollText,
    visible: (can) => can("logs:read"),
  },
  { href: "/admin/admins", label: "Admins", icon: UserCog, visible: (can) => can("admins:read") },
  { href: "/admin/roles", label: "Roles", icon: Shield, visible: (can) => can("roles:read") },
];

const NAV_SECTIONS: NavSection[] = [
  { id: "identity", label: "Identity", items: identityItems },
  { id: "marketplace", label: "Service marketplace", items: marketplaceItems },
  { id: "native-apps", label: "Native apps", items: nativeAppItems },
  { id: "finance", label: "Finance", items: financeItems },
  { id: "content", label: "Content", items: contentItems },
  { id: "network", label: "Network", items: networkItems },
  { id: "admin", label: "Administration", items: systemItems },
];

const SIDEBAR_OPEN_KEY = "spojex-admin-sidebar-open";
const FREQUENT_NAV_KEY = "spojex-admin-frequent-nav";
const FREQUENT_NAV_LIMIT = 5;

type FrequentNavEntry = {
  href: string;
  count: number;
  lastAt: number;
};

function loadFrequentNav(): FrequentNavEntry[] {
  try {
    const raw = localStorage.getItem(FREQUENT_NAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FrequentNavEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.href === "string" &&
          typeof item.count === "number" &&
          typeof item.lastAt === "number",
      )
      .map((item) => ({
        href: item.href,
        count: Math.max(0, item.count),
        lastAt: item.lastAt,
      }));
  } catch {
    return [];
  }
}

function saveFrequentNav(entries: FrequentNavEntry[]) {
  try {
    localStorage.setItem(FREQUENT_NAV_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota */
  }
}

function rankFrequentNav(entries: FrequentNavEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt - a.lastAt;
  });
}

function itemIsActive(pathname: string, href: string) {
  if (href === "/admin/streams") {
    return (
      pathname === "/admin/streams" ||
      pathname.startsWith("/admin/streams/") ||
      pathname === "/admin/live-events" ||
      pathname.startsWith("/admin/live-events/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionHasActive(pathname: string, items: NavItem[]) {
  return items.some((item) => !item.comingSoon && itemIsActive(pathname, item.href));
}

function LogoMark() {
  return <SpojexLogo size={32} className="h-8 w-8" priority />;
}

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Users }) {
  const pathname = usePathname();
  const active = itemIsActive(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
        navClass(active),
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconClass(active))} />
      <span>{label}</span>
    </Link>
  );
}

function ComingSoonNavItem({ label, icon: Icon }: { label: string; icon: typeof Users }) {
  return (
    <span
      className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground/70"
      title="Coming soon"
      aria-disabled="true"
    >
      <Icon className="h-4 w-4 shrink-0 text-text-hint" />
      <span className="flex-1">{label}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-hint">
        Soon
      </span>
    </span>
  );
}

function resolveNavItem(
  href: string,
  can: (permission: string) => boolean,
): { href: string; label: string; icon: typeof Users } | null {
  if (href === "/admin/dashboard") {
    return { href, label: "Analytics", icon: LayoutDashboard };
  }
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.comingSoon || item.href !== href) continue;
      if (!item.visible(can)) return null;
      return { href: item.href, label: item.label, icon: item.icon };
    }
  }
  return null;
}

function matchTrackedHref(pathname: string): string | null {
  if (pathname === "/admin/dashboard" || pathname === "/admin") {
    return "/admin/dashboard";
  }
  const candidates: string[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.comingSoon) continue;
      candidates.push(item.href);
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  for (const href of candidates) {
    if (itemIsActive(pathname, href)) return href;
  }
  return null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const section of NAV_SECTIONS) {
      defaults[section.id] =
        section.id === "identity" || section.id === "marketplace" || section.id === "native-apps";
    }
    return defaults;
  });
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [frequentNav, setFrequentNav] = useState<FrequentNavEntry[]>([]);
  const { can } = useAdminPermissions();

  const signOut = async () => {
    await getSpojexClient().auth.signOut();
    router.replace("/login");
  };

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.visible(can)),
  })).filter((section) => section.items.length > 0);

  const frequentItems = rankFrequentNav(frequentNav)
    .map((entry) => resolveNavItem(entry.href, can))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, FREQUENT_NAV_LIMIT);

  const normalizedQuery = navQuery.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;
  const showDashboard = !searching || "dashboard".includes(normalizedQuery);
  const filteredSections = visibleSections
    .map((section) => {
      if (!searching) return section;
      if (section.label.toLowerCase().includes(normalizedQuery)) return section;
      return {
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
      };
    })
    .filter((section) => section.items.length > 0);
  const hasNavMatches = showDashboard || filteredSections.length > 0;

  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
      if (raw) stored = JSON.parse(raw) as Record<string, boolean>;
    } catch {
      stored = {};
    }

    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of NAV_SECTIONS) {
        if (section.id in stored) next[section.id] = stored[section.id];
        if (sectionHasActive(window.location.pathname, section.items)) next[section.id] = true;
      }
      return next;
    });
    setFrequentNav(loadFrequentNav());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setOpenSections((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const section of NAV_SECTIONS) {
        if (sectionHasActive(pathname, section.items) && !next[section.id]) {
          next[section.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, hydrated]);

  // Track frequently used nav destinations (top-level admin pages).
  useEffect(() => {
    if (!hydrated) return;
    const href = matchTrackedHref(pathname);
    if (!href) return;
    setFrequentNav((prev) => {
      const now = Date.now();
      const existing = prev.find((item) => item.href === href);
      const next = existing
        ? prev.map((item) =>
            item.href === href
              ? { ...item, count: item.count + 1, lastAt: now }
              : item,
          )
        : [...prev, { href, count: 1, lastAt: now }];
      saveFrequentNav(next);
      return next;
    });
  }, [pathname, hydrated]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  };

  const removeFrequent = (href: string) => {
    setFrequentNav((prev) => {
      const next = prev.filter((item) => item.href !== href);
      saveFrequentNav(next);
      return next;
    });
  };

  const sidebarContent = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <LogoMark />
        <span className="font-heading text-[15px] font-semibold tracking-normal">SpoJex Admin</span>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-hint" />
          <input
            value={navQuery}
            onChange={(event) => setNavQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNavQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search"
            aria-label="Search sidebar items"
            className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/60 py-2 pl-9 pr-8 text-sm text-sidebar-foreground placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {navQuery ? (
            <button
              type="button"
              onClick={() => setNavQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-text-hint hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {!searching && frequentItems.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-text-hint">
              Frequently used
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {frequentItems.map((item) => {
                const Icon = item.icon;
                const active = itemIsActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                        active
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-sidebar-border bg-sidebar-accent/60 text-muted-foreground hover:text-sidebar-foreground",
                      )}
                    >
                      <Link
                        href={item.href}
                        className="inline-flex min-w-0 items-center gap-1"
                        title={item.label}
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFrequent(item.href)}
                        aria-label={`Remove ${item.label} from frequently used`}
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-black/10 hover:text-sidebar-foreground dark:hover:bg-white/10"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <nav>
          <ul className="space-y-0.5">
            {showDashboard ? (
            <li>
              <Link
                href="/admin/dashboard"
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
                  navClass(pathname === "/admin/dashboard"),
                )}
              >
                <LayoutDashboard className={cn("h-4 w-4", iconClass(pathname === "/admin/dashboard"))} />
                <span>Analytics</span>
              </Link>
              </li>
            ) : null}

            {filteredSections.map((section) => {
              const open = searching || (openSections[section.id] ?? false);
              const activeInSection = sectionHasActive(pathname, section.items);
                    return (
                <li key={section.id} className="pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!searching) toggleSection(section.id);
                    }}
                    aria-expanded={open}
                          className={cn(
                      "mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-sidebar-accent",
                      activeInSection ? "text-sidebar-foreground" : "text-text-hint",
                    )}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider">{section.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>
                  {open ? (
                <ul className="space-y-0.5">
                      {section.items.map((item) => (
                        <li key={item.href}>
                          {item.comingSoon ? (
                            <ComingSoonNavItem label={item.label} icon={item.icon} />
                          ) : (
                            <NavLink href={item.href} label={item.label} icon={item.icon} />
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                      </li>
                    );
                  })}
                </ul>
          {searching && !hasNavMatches ? (
            <p className="px-3 py-6 text-center text-sm text-text-hint">No matching pages</p>
            ) : null}
        </nav>
      </div>

      {/* Pinned footer: only its own height; nav above scrolls independently */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border px-3 py-2">
        <button
          type="button"
          onClick={() => void signOut()}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0 text-text-hint group-hover:text-muted-foreground" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger - visible only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-lg border border-border bg-card shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-text-primary" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Mobile sidebar (slide-over) */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-[100dvh] w-72 max-w-[min(18rem,85vw)] flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-text-secondary hover:bg-sidebar-accent"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar (fixed) */}
      <aside className="admin-shell fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        {sidebarContent}
    </aside>
    </>
  );
}
