"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Image as ImageIcon,
  KeyRound,
  Package,
  Sparkles,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { StatusBadge, requestTone, verifiedTone } from "@/components/status-badge";
import {
  AchievementsSection,
  CareerHistorySection,
  DetailField,
  DetailGroup,
  formatDob,
  HighlightsGallery,
} from "@/components/profile-details";
import { UserAvatar } from "@/components/user-avatar";
import SendPushForm from "@/components/send-push-form";
import { allRoles, roleLabel } from "@/lib/catalog";
import { professionalProfileCopy } from "@/lib/identity-catalog";
import { UserDeleteModal, UserPasswordResetModal } from "@/components/user-account-modals";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { patchAdmin, postAdmin, postAdminResponse, deleteAdmin, useIdentityCatalog } from "@/lib/hooks";
import { userProfileSelect } from "@/lib/query-embeds";
import { getSpojexClient } from "@/lib/spojex/client";
import { safeSelect } from "@/lib/table-helpers";
import { loadCoinWalletsByUserIds } from "@/lib/coin-wallets";
import { firstPayment } from "@/lib/marketplace";
import {
  nestedRecord,
  type AthleteProfile,
  type CoinWalletRow,
  type MediaProfile,
  type OrganizationRow,
  type ProfessionalProfile,
  type ProfileMediaRow,
  type ServiceRequestRow,
  type ServiceRow,
  type UserRow,
  type WalletRow,
  type WithdrawalRow,
} from "@/lib/types";
import { cn, formatCoins, formatDate, formatDateTime, formatMoney, formatStatusLabel, locationLabel } from "@/lib/utils";
import { verificationStatusLabel } from "@/lib/verification";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useApplyAdminSnapshot } from "@/lib/use-admin-snapshot";

type FeedInterestDetail = {
  preferences: {
    interests: string[];
    preferred_languages: string[];
    updated_at: string | null;
  } | null;
  topics: { topic: string; score: number; recent_score: number; updated_at: string | null }[];
  creators: { creator_key: string; score: number; recent_score: number; updated_at: string | null }[];
  feedback: { id: string; content_key: string; action: string; created_at: string }[];
};

type UserSnapshot = {
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

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { can } = useAdminPermissions();
  const [user, setUser] = useState<UserRow | null>(null);
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [coinWallet, setCoinWallet] = useState<CoinWalletRow | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [bookings, setBookings] = useState<ServiceRequestRow[]>([]);
  const [busyService, setBusyService] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<ProfileMediaRow[]>([]);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [feedInterest, setFeedInterest] = useState<FeedInterestDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { catalog, roleOptions, roleLabel: catalogRoleLabel } = useIdentityCatalog();

  const fetchSnapshot = async (): Promise<UserSnapshot> => {
    const [
      { data, error: userError },
      orgRes,
      serviceRes,
      verificationRes,
      mediaRes,
      athleteRes,
      professionalRes,
      mediaProfileRes,
      marketRes,
      coinMap,
      feedRes,
    ] = await Promise.all([
      getSpojexClient().from("users").select(userProfileSelect).eq("id", id).maybeSingle(),
      getSpojexClient().from("organizations").select("*").eq("user_id", id),
      safeSelect(() =>
        getSpojexClient()
          .from("services")
          .select("id, title, published, category_id, created_at, cover_url, city, price_amount, currency, pricing_type")
          .eq("provider_id", id),
      ),
      getSpojexClient()
        .from("identity_verification_requests")
        .select("id, status")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getSpojexClient()
        .from("profile_media")
        .select("*")
        .eq("user_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      // The API does not expand PostgREST-style embeds, so the role profile
      // tables are fetched explicitly instead of relying on `userProfileSelect`.
      safeSelect(() =>
        getSpojexClient().from("athlete_profiles").select("*").eq("user_id", id).maybeSingle(),
      ),
      safeSelect(() =>
        getSpojexClient().from("professional_profiles").select("*").eq("user_id", id).maybeSingle(),
      ),
      safeSelect(() =>
        getSpojexClient().from("media_profiles").select("*").eq("user_id", id).maybeSingle(),
      ),
      fetch(`/api/admin/users/${id}/marketplace`, { credentials: "same-origin" }),
      loadCoinWalletsByUserIds([id]),
      fetch(`/api/admin/users/${id}/feed-interests`, { credentials: "same-origin" }),
    ]);
    if (userError) throw new Error(userError.message);
    if (orgRes.error) throw new Error(orgRes.error.message);
    if (serviceRes.error) throw new Error(serviceRes.error);
    if (verificationRes.error && !/does not exist|schema cache/i.test(verificationRes.error.message)) {
      throw new Error(verificationRes.error.message);
    }
    if (mediaRes.error && !/does not exist|schema cache/i.test(mediaRes.error.message)) {
      throw new Error(mediaRes.error.message);
    }
    let nextServices = (serviceRes.data ?? []) as ServiceRow[];
    let wallet: WalletRow | null = null;
    let withdrawals: WithdrawalRow[] = [];
    let bookings: ServiceRequestRow[] = [];
    if (marketRes.ok) {
      const market = (await marketRes.json()) as {
        services?: ServiceRow[];
        wallet?: WalletRow | null;
        withdrawals?: WithdrawalRow[];
        bookings?: ServiceRequestRow[];
      };
      if (Array.isArray(market.services)) nextServices = market.services;
      wallet = market.wallet ?? null;
      withdrawals = market.withdrawals ?? [];
      bookings = market.bookings ?? [];
    }

    let feedInterest: FeedInterestDetail | null = null;
    if (feedRes.ok) {
      const feed = (await feedRes.json()) as FeedInterestDetail;
      feedInterest = {
        preferences: feed.preferences ?? null,
        topics: feed.topics ?? [],
        creators: feed.creators ?? [],
        feedback: feed.feedback ?? [],
      };
    }

    const baseUser = (data as UserRow | null) ?? null;
    const mergedUser = baseUser
      ? {
          ...baseUser,
          athlete_profiles: (athleteRes.data as AthleteProfile | null) ?? null,
          professional_profiles: (professionalRes.data as ProfessionalProfile | null) ?? null,
          media_profiles: (mediaProfileRes.data as MediaProfile | null) ?? null,
        }
      : null;

    return {
      user: mergedUser,
      orgs: (orgRes.data ?? []) as OrganizationRow[],
      mediaItems: (mediaRes.data ?? []) as ProfileMediaRow[],
      verificationId: verificationRes.data?.id ?? null,
      verificationStatus: verificationRes.data?.status ?? null,
      coinWallet: coinMap[id] ?? null,
      services: nextServices,
      wallet,
      withdrawals,
      bookings,
      feedInterest,
    };
  };

  const {
    data: snapshot,
    loading,
    error: loadError,
    refresh,
  } = useAdminQuery<UserSnapshot>({
    key: adminCacheKey(["people", "detail", id]),
    fetcher: fetchSnapshot,
  });

  useApplyAdminSnapshot(snapshot, (snap) => {
    setUser(snap.user);
    setOrgs(snap.orgs);
    setMediaItems(snap.mediaItems);
    setVerificationId(snap.verificationId);
    setVerificationStatus(snap.verificationStatus);
    setCoinWallet(snap.coinWallet);
    setServices(snap.services);
    setWallet(snap.wallet);
    setWithdrawals(snap.withdrawals);
    setBookings(snap.bookings);
    setFeedInterest(snap.feedInterest);
  });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  /** Soft reload after a mutation; also drops the parent list cache. */
  const load = async () => {
    setError(null);
    invalidateAdminCache(adminCacheKey(["people", "list"]));
    const next = await refresh();
    if (!next) throw new Error("Failed to reload user");
  };

  /** Saves a field. Returns false so inline editors can show failure. */
  const save = async (patch: Partial<UserRow>, opts?: { silent?: boolean }): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    if (!opts?.silent) setNotice(null);
    setError(null);
    try {
      await patchAdmin(`/api/admin/users/${user.id}`, patch);
      await load();
      if (!opts?.silent) setNotice("Changes saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const pendingServices = services.filter((service) => !service.published);

  const coverOf = (row: ServiceRow) => {
    const images = Array.isArray(row.images) ? row.images.filter((item) => typeof item === "string") : [];
    return (typeof images[0] === "string" && images[0]) || row.cover_url || "";
  };

  const toggleService = async (row: ServiceRow, published: boolean) => {
    setBusyService(row.id);
    try {
      await patchAdmin(`/api/admin/services/${row.id}`, { published });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyService(null);
    }
  };

  const removeService = async (row: ServiceRow) => {
    if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setBusyService(row.id);
    try {
      await deleteAdmin(`/api/admin/services/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyService(null);
    }
  };

  const approveAllServices = async () => {
    if (!pendingServices.length) return;
    setBusyService("all");
    try {
      await postAdmin("/api/admin/services", { action: "approve_all", provider_id: id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve all failed");
    } finally {
      setBusyService(null);
    }
  };

  const submitPassword = async (password: string) => {
    if (!user) return;
    setAccountBusy(true);
    setModalError(null);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/users/${user.id}/password`, { password });
      setPasswordOpen(false);
      setNotice("Password updated.");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setAccountBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!user) return;
    setAccountBusy(true);
    setModalError(null);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/users/${user.id}`);
      invalidateAdminCache(adminCacheKey(["people"]));
      router.push("/admin/people");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Delete failed");
      setAccountBusy(false);
    }
  };

  if (loading) return <AdminLoadingRow fill label="Loading profile…" />;
  if (!user) {
    return (
      <div className="space-y-3">
        <AdminErrorAlert message={error || "User not found"} />
        <Link href="/admin/people" className="text-sm font-medium text-primary hover:underline">
          Back to people
        </Link>
      </div>
    );
  }

  const athlete = nestedRecord<AthleteProfile>(user.athlete_profiles);
  const professional = nestedRecord<ProfessionalProfile>(user.professional_profiles);
  const media = nestedRecord<MediaProfile>(user.media_profiles);
  const professionalCopy = professionalProfileCopy(user.role);
  const hasRoleProfile = Boolean(athlete || professional || media);
  const canPush = can("notifications:write");

  const navItems = [
    { id: "about", label: "About" },
    { id: "identity", label: "Identity" },
    { id: "highlights", label: "Media" },
    ...(hasRoleProfile ? [{ id: "profile", label: "Profile" }] : []),
    { id: "marketplace", label: "Marketplace" },
    { id: "engagement", label: "Engagement" },
    { id: "organizations", label: "Organizations" },
    ...(canPush ? [{ id: "notifications", label: "Push" }] : []),
  ];

  const feedIsEmpty =
    !feedInterest ||
    (!feedInterest.preferences &&
      feedInterest.topics.length === 0 &&
      feedInterest.creators.length === 0 &&
      feedInterest.feedback.length === 0);

  return (
    <>
      <AdminPageHeader
        title={user.display_name || "User"}
        description={user.email || user.username || undefined}
        backHref="/admin/people"
        breadcrumbs={[
          { label: "People", href: "/admin/people" },
          { label: user.display_name || "Detail" },
        ]}
        actions={
          <button
            type="button"
            disabled={saving || accountBusy}
            onClick={() => void save({ verified: !user.verified })}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50",
              user.verified
                ? "border-border bg-card hover:bg-muted"
                : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
            )}
          >
            {user.verified ? "Remove verification" : "Verify person"}
          </button>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="rounded px-1 leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : null}

      <UserPasswordResetModal
        user={user}
        open={passwordOpen}
        saving={accountBusy}
        error={modalError}
        onClose={() => {
          if (accountBusy) return;
          setPasswordOpen(false);
          setModalError(null);
        }}
        onSubmit={submitPassword}
      />
      <UserDeleteModal
        user={user}
        open={deleteOpen}
        saving={accountBusy}
        error={modalError}
        onClose={() => {
          if (accountBusy) return;
          setDeleteOpen(false);
          setModalError(null);
        }}
        onConfirm={confirmDelete}
      />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <IdentityRail
          user={user}
          roleName={catalog ? catalogRoleLabel(user.role) : roleLabel(user.role)}
          verificationId={verificationId}
          verificationStatus={verificationStatus}
          accountBusy={accountBusy}
          onResetPassword={() => {
            setModalError(null);
            setPasswordOpen(true);
          }}
          onDelete={() => {
            setModalError(null);
            setDeleteOpen(true);
          }}
        />

        <div className="min-w-0 space-y-8">
          <SectionNav items={navItems} />

          <Section
            id="about"
            title="About"
            description="How this person presents themselves in the app."
            action={
              <span className="text-xs text-text-hint">
                {saving ? "Saving…" : "Edits save when you click away"}
              </span>
            }
          >
            <div className="grid gap-4">
              <Field
                label="Headline"
                value={user.headline}
                placeholder="Short one-line introduction"
                onSave={(value) => save({ headline: value }, { silent: true })}
              />
              <Field
                label="Bio"
                value={user.bio}
                placeholder="Longer introduction shown on the profile"
                multiline
                rows={5}
                onSave={(value) => save({ bio: value }, { silent: true })}
              />
            </div>
          </Section>

          <IdentitySection
            user={user}
            roleOptionsList={roleOptions}
            catalogReady={Boolean(catalog)}
            onSave={save}
            saving={saving}
          />

          <Section
            id="highlights"
            title="Media"
            description="Photos and highlight clips from the app."
            count={mediaItems.length}
            action={
              <Link
                href="/admin/profile-media"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Manage media
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            {mediaItems.length === 0 ? (
              <EmptyState
                icon={ImageIcon}
                title="No photos or highlight clips yet."
                hint="Media appears here once this person uploads from the app."
              />
            ) : (
              <HighlightsGallery items={mediaItems} />
            )}
          </Section>

          {hasRoleProfile ? (
            <Section
              id="profile"
              title="Profile"
              description="Role-specific details captured during onboarding."
            >
              <div className="space-y-6">
                {athlete ? (
                  <ProfileBody title="Athlete profile">
                    <DetailGroup title="Playing">
                      <DetailField label="Position" value={athlete.position} />
                      <DetailField label="Secondary position" value={athlete.secondary_position || "-"} />
                      <DetailField label="Preferred foot" value={athlete.preferred_foot} />
                      <DetailField label="Team" value={athlete.team} />
                      <DetailField label="Playing level" value={athlete.playing_level || "-"} />
                      <DetailField label="Jersey" value={athlete.jersey_number?.toString() ?? "-"} />
                    </DetailGroup>
                    <DetailGroup title="Physical">
                      <DetailField label="Nationality" value={athlete.nationality || "-"} />
                      <DetailField label="Date of birth" value={formatDob(athlete.date_of_birth)} />
                      <DetailField label="Height" value={athlete.height_cm ? `${athlete.height_cm} cm` : "-"} />
                      <DetailField label="Weight" value={athlete.weight_kg ? `${athlete.weight_kg} kg` : "-"} />
                      <DetailField label="Experience" value={athlete.years_experience?.toString() ?? "-"} />
                    </DetailGroup>
                    <DetailGroup title="Season">
                      <DetailField label="Matches" value={String(athlete.matches_played)} />
                      <DetailField label="Goals" value={String(athlete.goals)} />
                      <DetailField label="Assists" value={String(athlete.assists)} />
                      <DetailField label="Man of the match" value={String(athlete.man_of_the_match ?? 0)} />
                    </DetailGroup>
                    <DetailGroup title="Opportunities">
                      <DetailField
                        label="Looking for opportunities"
                        value={athlete.looking_for_opportunities ? "Yes" : "No"}
                      />
                      <DetailField
                        label="Opportunity interests"
                        value={athlete.opportunity_interests?.join(", ") || "-"}
                      />
                    </DetailGroup>
                    <Disclosure title="Career history">
                      <CareerHistorySection value={athlete.career_history} />
                    </Disclosure>
                    <Disclosure title="Achievements">
                      <AchievementsSection value={athlete.achievements} />
                    </Disclosure>
                  </ProfileBody>
                ) : null}

                {professional ? (
                  <ProfileBody title={professionalCopy.title}>
                    <DetailGroup title="Credentials">
                      <DetailField label={professionalCopy.organization} value={professional.organization} />
                      <DetailField label={professionalCopy.license} value={professional.license} />
                      <DetailField label="Certified" value={professional.certified ? "Yes" : "No"} />
                      <DetailField label="Experience" value={professional.years_experience?.toString() ?? "-"} />
                    </DetailGroup>
                    <DetailGroup title="Focus">
                      <DetailField label="Specializations" value={professional.specializations?.join(", ") || "-"} />
                      <DetailField label="Regions" value={professional.regions?.join(", ") || "-"} />
                      <DetailField label="Age groups" value={professional.age_groups?.join(", ") || "-"} />
                      <DetailField label="Notes" value={professional.notes || "-"} />
                    </DetailGroup>
                    <Disclosure title="Career history">
                      <CareerHistorySection value={professional.career_history} />
                    </Disclosure>
                    <Disclosure title="Achievements">
                      <AchievementsSection value={professional.achievements} />
                    </Disclosure>
                  </ProfileBody>
                ) : null}

                {media ? (
                  <ProfileBody title="Media profile">
                    <DetailGroup>
                      <DetailField label="Outlet" value={media.outlet} />
                      <DetailField label="Specialty" value={media.specialty} />
                      <DetailField label="Portfolio" value={media.portfolio_url || "-"} />
                      <DetailField label="Experience" value={media.years_experience?.toString() ?? "-"} />
                      <DetailField label="Regions" value={media.regions?.join(", ") || "-"} />
                    </DetailGroup>
                    <Disclosure title="Career history">
                      <CareerHistorySection value={media.career_history} />
                    </Disclosure>
                    <Disclosure title="Achievements">
                      <AchievementsSection value={media.achievements} />
                    </Disclosure>
                  </ProfileBody>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section
            id="marketplace"
            title="Marketplace"
            description="Services, bookings and money tied to this account."
          >
            <div className="@container">
              <div className="grid gap-3 @lg:grid-cols-2 @lg:items-start">
                <Panel
                  title="Services"
                count={services.length}
                action={
                  pendingServices.length > 0 ? (
                    <button
                      type="button"
                      disabled={busyService === "all"}
                      onClick={() => void approveAllServices()}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      Approve {pendingServices.length} pending
                    </button>
                  ) : null
                }
              >
                {services.length === 0 ? (
                  <EmptyState icon={Package} title="No services listed." compact />
                ) : (
                  <ul className="space-y-3">
                    {services.map((service) => {
                      const cover = coverOf(service);
                      const busy = busyService === service.id;
                      return (
                        <li key={service.id} className="flex gap-3">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                              No photo
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <Link
                                href={`/admin/services/${service.id}`}
                                className="min-w-0 truncate text-sm font-medium text-primary hover:underline"
                              >
                                {service.title}
                              </Link>
                              <StatusBadge tone={service.published ? "success" : "warning"}>
                                {service.published ? "Approved" : "Pending"}
                              </StatusBadge>
                            </div>
                            <p className="truncate text-xs text-text-secondary">
                              {[
                                service.city,
                                service.price_amount == null
                                  ? formatStatusLabel(service.pricing_type)
                                  : formatMoney(service.price_amount, service.currency || "ETB"),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "No location or price set"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleService(service, !service.published)}
                                className="font-medium text-primary hover:underline disabled:opacity-50"
                              >
                                {service.published ? "Unpublish" : "Approve"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void removeService(service)}
                                className="font-medium text-red-600 hover:underline disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Bookings" count={bookings.length}>
                {bookings.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="No bookings for this person." compact />
                ) : (
                  <ul className="space-y-3">
                    {bookings.map((row) => {
                      const payment = firstPayment(row.service_payments);
                      const isProvider = row.provider_id === id;
                      const otherId = isProvider ? row.requester_id : row.provider_id;
                      const otherName = isProvider
                        ? row.requester?.display_name || "Customer"
                        : row.provider?.display_name || "Provider";
                      return (
                        <li key={row.id} className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/admin/services/${row.service_id}`}
                              className="min-w-0 truncate text-sm font-medium text-primary hover:underline"
                            >
                              {row.services?.title || "Service"}
                            </Link>
                            <StatusBadge tone={requestTone(row.status)}>
                              {formatStatusLabel(row.status)}
                            </StatusBadge>
                          </div>
                          <p className="truncate text-xs text-text-secondary">
                            {isProvider ? "From" : "Booked with"}{" "}
                            <Link href={`/admin/people/${otherId}`} className="text-primary hover:underline">
                              {otherName}
                            </Link>
                          </p>
                          {payment ? (
                            <p className="text-xs text-text-hint">
                              {formatMoney(payment.amount, payment.currency)} ·{" "}
                              {formatStatusLabel(payment.status)}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Wallet"
                action={
                  <Link href="/admin/wallets" className="text-xs font-medium text-primary hover:underline">
                    All wallets
                  </Link>
                }
              >
                {wallet ? (
                  <dl className="space-y-1.5">
                    <StatRow label="Available" value={formatMoney(wallet.available, wallet.currency)} strong />
                    <StatRow label="Lifetime earned" value={formatMoney(wallet.lifetime_earned, wallet.currency)} />
                    <StatRow label="Updated" value={formatDate(wallet.updated_at)} />
                  </dl>
                ) : (
                  <EmptyState
                    icon={Wallet}
                    title="No wallet yet."
                    hint="Created after the first completed paid booking."
                    compact
                  />
                )}
                <h4 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-hint">
                  Withdrawals
                </h4>
                {withdrawals.length === 0 ? (
                  <p className="text-xs text-text-secondary">No withdrawal requests.</p>
                ) : (
                  <ul className="space-y-2">
                    {withdrawals.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          {formatMoney(row.amount)} · {row.bank_name}
                        </span>
                        <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Coin gifts"
                action={
                  <Link href="/admin/coin-catalog" className="text-xs font-medium text-primary hover:underline">
                    Gift catalog
                  </Link>
                }
              >
                {coinWallet ? (
                  <dl className="space-y-1.5">
                    <StatRow label="Redeemable" value={formatCoins(coinWallet.redeemable_balance)} strong />
                    <StatRow label="Received balance" value={formatCoins(coinWallet.received_balance)} />
                    <StatRow label="Purchased balance" value={formatCoins(coinWallet.purchased_balance)} />
                    <StatRow label="Gifts received" value={formatCoins(coinWallet.lifetime_received)} />
                    <StatRow label="Gifts sent" value={formatCoins(coinWallet.lifetime_gifted)} />
                  </dl>
                ) : (
                  <EmptyState
                    icon={Coins}
                    title="No coin wallet yet."
                    hint="Appears after the first gift or purchase."
                    compact
                  />
                )}
              </Panel>
              </div>
            </div>
          </Section>

          <Section
            id="engagement"
            title="Engagement"
            description="What the For You feed has learned about this person."
            action={
              <Link
                href="/admin/feed-interests"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All feed interests
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            {feedIsEmpty ? (
              <EmptyState
                icon={Sparkles}
                title="No feed preferences or affinities collected yet."
                hint="Scores build up as this person likes, saves and skips content."
              />
            ) : (
              <div className="@container">
                <div className="grid gap-5 @lg:grid-cols-2">
                <div>
                  <SubHeading>Saved preferences</SubHeading>
                  {feedInterest?.preferences ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-text-hint">Interests</p>
                        <Chips
                          items={feedInterest.preferences.interests}
                          empty="None selected."
                        />
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-text-hint">Languages</p>
                        <Chips
                          items={feedInterest.preferences.preferred_languages}
                          empty="None selected."
                        />
                      </div>
                      <p className="text-[11px] text-text-hint">
                        Updated {formatDateTime(feedInterest.preferences.updated_at)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">No explicit preferences saved.</p>
                  )}
                </div>

                <div>
                  <SubHeading>Topic affinity ({feedInterest?.topics.length ?? 0})</SubHeading>
                  {!feedInterest?.topics.length ? (
                    <p className="text-xs text-text-secondary">No topic scores yet.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {feedInterest.topics.slice(0, 8).map((item) => (
                        <MeterRow
                          key={item.topic}
                          label={item.topic}
                          value={item.score}
                          recent={item.recent_score}
                          max={feedInterest.topics[0].score}
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <SubHeading>Creator affinity ({feedInterest?.creators.length ?? 0})</SubHeading>
                  {!feedInterest?.creators.length ? (
                    <p className="text-xs text-text-secondary">No creator scores yet.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {feedInterest.creators.slice(0, 8).map((item) => (
                        <MeterRow
                          key={item.creator_key}
                          label={item.creator_key}
                          value={item.score}
                          recent={item.recent_score}
                          max={feedInterest.creators[0].score}
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <SubHeading>Feedback ({feedInterest?.feedback.length ?? 0})</SubHeading>
                  {!feedInterest?.feedback.length ? (
                    <p className="text-xs text-text-secondary">No not-interested or hide feedback.</p>
                  ) : (
                    <ul className="space-y-2">
                      {feedInterest.feedback.slice(0, 6).map((item) => (
                        <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">{formatStatusLabel(item.action)}</p>
                            <p className="text-[11px] text-text-hint">{formatDateTime(item.created_at)}</p>
                          </div>
                          <p className="truncate text-[11px] text-text-secondary">{item.content_key}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                </div>
              </div>
            )}
          </Section>

          <Section id="organizations" title="Organizations" count={orgs.length}>
            {orgs.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Not part of any organization."
                hint="Organization membership appears here once this person joins or creates one."
              />
            ) : (
              <ul className="divide-y divide-border">
                {orgs.map((org) => (
                  <li key={org.id}>
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-text-hint" aria-hidden />
                        <span className="truncate font-medium">{org.name || org.public_id}</span>
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-hint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canPush ? (
            <div id="notifications" className="scroll-mt-24">
              <SendPushForm userId={user.id} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Identity rail                                                       */
/* ------------------------------------------------------------------ */

function IdentityRail({
  user,
  roleName,
  verificationId,
  verificationStatus,
  accountBusy,
  onResetPassword,
  onDelete,
}: {
  user: UserRow;
  roleName: string;
  verificationId: string | null;
  verificationStatus: string | null;
  accountBusy: boolean;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const secondary = user.username ? `@${user.username}` : user.full_name || "";
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
          <UserAvatar name={user.display_name || user.full_name} src={user.avatar_url} size={80} />
          <h2 className="mt-3 max-w-full break-words font-heading text-lg font-semibold leading-tight">
            {user.display_name || "Unnamed"}
          </h2>
          {secondary ? <p className="mt-0.5 max-w-full truncate text-xs text-text-secondary">{secondary}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <StatusBadge tone="info">{roleName}</StatusBadge>
            <StatusBadge tone={verifiedTone(user.verified)}>
              {user.verified ? "Verified" : "Unverified"}
            </StatusBadge>
          </div>
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Contact</p>
          <RailField label="Email" value={user.email || "-"} copy={user.email || undefined} breakAll />
          <RailField label="Phone" value={user.phone || "-"} copy={user.phone || undefined} />
          <RailField label="Location" value={locationLabel(user.city, user.country)} />
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Record</p>
          <RailField label="Joined" value={formatDate(user.created_at)} />
          <RailField label="User ID" value={user.id} copy={user.id} mono truncateValue />
        </div>

        {verificationId ? (
          <div className="space-y-2 border-t border-border px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">
              ID verification
            </p>
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone={requestTone(verificationStatus || "")}>
                {verificationStatusLabel(verificationStatus)}
              </StatusBadge>
              <Link
                href={`/admin/verifications/${verificationId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Review docs
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-border px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-hint">Account</p>
          <button
            type="button"
            disabled={accountBusy}
            onClick={onResetPassword}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4 text-text-hint" aria-hidden />
            Reset password
          </button>
          <button
            type="button"
            disabled={accountBusy}
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete account
          </button>
        </div>
      </div>
    </aside>
  );
}

function RailField({
  label,
  value,
  copy,
  mono,
  breakAll,
  truncateValue,
}: {
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
  breakAll?: boolean;
  truncateValue?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-text-hint">{label}</p>
      <div className="mt-0.5 flex items-start justify-between gap-1">
        <p
          title={truncateValue ? value : undefined}
          className={cn(
            "min-w-0 text-sm font-medium text-text-primary",
            mono && "font-mono text-[11px] leading-5",
            breakAll && "break-all",
            truncateValue && "truncate",
          )}
        >
          {value || "-"}
        </p>
        {copy ? <CopyButton value={copy} label={label} /> : null}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="shrink-0 rounded p-1 text-text-hint transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Section chrome                                                      */
/* ------------------------------------------------------------------ */

function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const active = useActiveSection(items.map((item) => item.id));
  return (
    <nav aria-label="Profile sections">
      <ul className="flex flex-wrap gap-1 pb-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active === item.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-text-secondary hover:text-text-primary",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    const elements = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

function Section({
  id,
  title,
  description,
  count,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-sm font-semibold text-text-primary">
            {title}
            {count != null ? (
              <span className="ml-1.5 text-xs font-medium text-text-hint">{count}</span>
            ) : null}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-text-secondary">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">{children}</div>
    </section>
  );
}

function Panel({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {title}
          {count != null ? <span className="ml-1.5 font-medium text-text-hint">{count}</span> : null}
        </h3>
        {action}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function ProfileBody({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="font-heading text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-hint">{children}</h3>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Borderless, tighter variant for use inside a panel. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 text-center",
        compact ? "px-2 py-3" : "rounded-lg border border-dashed border-border px-4 py-6",
      )}
    >
      <Icon className="h-5 w-5 text-text-hint" aria-hidden />
      <p className="text-sm text-text-secondary">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-text-hint">{hint}</p> : null}
    </div>
  );
}

function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={cn("tabular-nums text-sm", strong ? "font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}

function MeterRow({
  label,
  value,
  recent,
  max,
}: {
  label: string;
  value: number;
  recent: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(4, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-text-primary">{label}</span>
        <span className="shrink-0 tabular-nums text-text-secondary">
          {value.toFixed(1)}
          <span className="text-text-hint"> / r {recent.toFixed(1)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-xs text-text-secondary">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-text-primary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline editing                                                      */
/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onSave,
  multiline,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<boolean>;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  const commit = async () => {
    if (draft === value) return;
    setState("saving");
    const ok = await onSave(draft);
    setState(ok ? "saved" : "idle");
  };

  const dirty = draft !== value;
  const inputClass = cn(
    "w-full rounded-lg border bg-card px-3 text-sm text-text-primary transition-colors placeholder:text-text-hint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    dirty ? "border-primary/50" : "border-border",
  );

  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-text-secondary">{label}</span>
        <span aria-live="polite" className="text-[11px] text-emerald-600">
          {state === "saving" ? <span className="text-text-hint">Saving…</span> : null}
          {state === "saved" ? "Saved" : null}
        </span>
      </span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          rows={rows}
          placeholder={placeholder}
          className={cn(inputClass, "py-2 leading-relaxed")}
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          placeholder={placeholder}
          className={cn(inputClass, "h-10")}
        />
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Identity fields (immediate save)                                    */
/* ------------------------------------------------------------------ */

function IdentitySection({
  user,
  roleOptionsList,
  catalogReady,
  onSave,
  saving,
}: {
  user: UserRow;
  roleOptionsList: { id: string; label: string }[];
  catalogReady: boolean;
  onSave: (patch: Partial<UserRow>) => Promise<boolean>;
  saving: boolean;
}) {
  return (
    <Section
      id="identity"
      title="Identity"
      description="Names and role are visible across the network."
      action={saving ? <span className="text-xs text-text-hint">Saving…</span> : null}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Display name"
          value={user.display_name}
          onSave={(value) => onSave({ display_name: value })}
        />
        <Field label="Full name" value={user.full_name} onSave={(value) => onSave({ full_name: value })} />
        <Field
          label="Username"
          value={user.username ?? ""}
          onSave={(value) => onSave({ username: value || null })}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-text-secondary">Role</span>
          <select
            value={user.role}
            onChange={(event) => void onSave({ role: event.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {(catalogReady ? roleOptionsList : allRoles).map((item) => (
              <option key={item.id || "none"} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Field label="City" value={user.city} onSave={(value) => onSave({ city: value })} />
        <Field label="Country" value={user.country} onSave={(value) => onSave({ country: value })} />
      </div>
    </Section>
  );
}
