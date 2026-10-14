"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  FolderTree,
  Flag,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Moon,
  Newspaper,
  Share2,
  Shield,
  ShieldCheck,
  Store,
  Sun,
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
  ArrowLeftRight,
  Settings,
  ScrollText,
  Dumbbell,
  Menu,
  Search,
  X,
} from "lucide-react";
import { getSpojexClient } from "@/lib/spojex/client";
import { canReadRadioChat } from "@/lib/admin-permissions";
import { canManageLiveEvents } from "@/lib/live-events";
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
  { href: "/admin/users", label: "Users", icon: Users, visible: (can) => can("users:read") },
  { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck, visible: (can) => can("users:read") },
  {
    href: "/admin/verification-docs",
    label: "Verification docs",
    icon: ClipboardList,
    visible: (can) => can("profiles:read"),
  },
  { href: "/admin/categories", label: "Account roles", icon: FolderTree, visible: (can) => can("profiles:read") },
  { href: "/admin/organizations", label: "Organizations", icon: Building2, visible: (can) => can("organizations:read") },
  { href: "/admin/athletes", label: "Athletes", icon: ShieldCheck, visible: (can) => can("profiles:read") },
  { href: "/admin/professionals", label: "Professionals", icon: UserRound, visible: (can) => can("profiles:read") },
  { href: "/admin/media", label: "Media profiles", icon: Newspaper, visible: (can) => can("profiles:read") },
];

const marketplaceItems: NavItem[] = [
  { href: "/admin/services", label: "Services", icon: ShoppingBag, visible: (can) => can("services:read") },
  { href: "/admin/requests", label: "Bookings", icon: ClipboardList, visible: (can) => can("requests:read") },
  { href: "/admin/service-categories", label: "Categories", icon: FolderTree, visible: (can) => can("catalog:read") },
  { href: "/admin/miniapps", label: "Mini apps", icon: AppWindow, visible: (can) => can("miniapps:read") },
  {
    href: "/admin/opportunities",
    label: "Opportunities",
    icon: Briefcase,
    visible: (can) => can("opportunities:read"),
  },
];

const nativeAppItems: NavItem[] = [
  { href: "/admin/stadiums", label: "Stadiums", icon: Landmark, visible: (can) => can("stadiums:read") },
  { href: "/admin/gyms", label: "Gyms", icon: Dumbbell, visible: (can) => can("gyms:read") },
  {
    href: "/admin/gym-categories",
    label: "Gym categories",
    icon: FolderTree,
    visible: (can) => can("gyms:read"),
  },
  { href: "/admin/events", label: "Events", icon: Calendar, visible: (can) => can("events:read") },
  {
    href: "/admin/shops",
    label: "Shops",
    icon: Store,
    comingSoon: true,
    // Visible alongside other native apps when the admin can manage any of them.
    visible: (can) =>
      can("stadiums:read") ||
      can("gyms:read") ||
      can("events:read") ||
      can("donations:read") ||
      can("streams:read") ||
      canManageLiveEvents(can),
  },
  { href: "/admin/donations", label: "Donations", icon: Heart, visible: (can) => can("donations:read") },
  {
    href: "/admin/streams",
    label: "Stream",
    icon: Radio,
    visible: (can) => can("streams:read") || canManageLiveEvents(can),
  },
];

/** Wallet + coin + payment surfaces in one Finance group. */
const financeItems: NavItem[] = [
  { href: "/admin/wallets", label: "Wallets", icon: Wallet, visible: (can) => can("requests:read") },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: Banknote, visible: (can) => can("requests:read") },
  {
    href: "/admin/coin-catalog",
    label: "Coin catalog",
    icon: Coins,
    visible: (can) => can("donations:read"),
  },
  {
    href: "/admin/coin-redemptions",
    label: "Coin redemptions",
    icon: ArrowLeftRight,
    visible: (can) => can("donations:read") || can("requests:read"),
  },
  {
    href: "/admin/finance/payment-settings",
    label: "Payment settings",
    icon: CreditCard,
    visible: (can) => can("settings:read"),
  },
];

const contentItems: NavItem[] = [
  { href: "/admin/news", label: "Sport news", icon: Newspaper, visible: (can) => can("news:read") },
  { href: "/admin/radio-chat", label: "Radio chat", icon: MessageCircle, visible: canReadRadioChat },
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
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 2.2 14.7 8h6.3l-5.1 3.8 1.9 6-5.8-3.9-5.8 3.9 1.9-6L3 8h6.3L12 2.2Z" />
      </svg>
    </span>
  );
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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
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
  const { can, staff } = useAdminPermissions();

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.visible(can)),
  })).filter((section) => section.items.length > 0);

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
    const saved = localStorage.getItem("theme");
    const initial = saved === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", initial === "dark");
    setTheme(initial);

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

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("theme", next);
      return next;
    });
  };

  const signOut = async () => {
    await getSpojexClient().auth.signOut();
    router.replace("/login");
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
                  <span>Dashboard</span>
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

      <div className="border-t border-sidebar-border p-3">
        {staff ? (
          <p className="mb-2 truncate px-3 text-xs text-text-hint">
            {staff.full_name || staff.email || "Admin"} · {staff.role.replace(/_/g, " ")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={toggleTheme}
          className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger — visible only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-lg border border-border bg-card shadow-sm lg:hidden"
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
          "fixed left-0 top-0 z-50 flex h-screen w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out lg:hidden",
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
