"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { allRoles, extraProfileTable, roleLabel } from "@/lib/catalog";
import { professionalProfileCopy } from "@/lib/identity-catalog";
import { UserDeleteModal, UserPasswordResetModal } from "@/components/user-account-modals";
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
import { formatCoins, formatDate, formatMoney, formatStatusLabel, locationLabel } from "@/lib/utils";
import { verificationStatusLabel } from "@/lib/verification";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { catalog, roleOptions, roleLabel: catalogRoleLabel, extraProfileTable: catalogExtraProfileTable } =
    useIdentityCatalog();

  const load = async () => {
    setError(null);
    const [{ data, error: userError }, orgRes, serviceRes, verificationRes, mediaRes, marketRes, coinMap] =
      await Promise.all([
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
      fetch(`/api/admin/users/${id}/marketplace`, { credentials: "same-origin" }),
      loadCoinWalletsByUserIds([id]),
    ]);
    if (userError) throw userError;
    if (orgRes.error) throw orgRes.error;
    if (serviceRes.error) throw new Error(serviceRes.error);
    if (verificationRes.error && !/does not exist|schema cache/i.test(verificationRes.error.message)) {
      throw verificationRes.error;
    }
    if (mediaRes.error && !/does not exist|schema cache/i.test(mediaRes.error.message)) {
      throw mediaRes.error;
    }
    setUser(data as UserRow | null);
    setOrgs((orgRes.data ?? []) as OrganizationRow[]);
    setMediaItems((mediaRes.data ?? []) as ProfileMediaRow[]);
    setVerificationId(verificationRes.data?.id ?? null);
    setVerificationStatus(verificationRes.data?.status ?? null);
    setCoinWallet(coinMap[id] ?? null);

    let nextServices = (serviceRes.data ?? []) as ServiceRow[];
    if (marketRes.ok) {
      const market = (await marketRes.json()) as {
        services?: ServiceRow[];
        wallet?: WalletRow | null;
        withdrawals?: WithdrawalRow[];
        bookings?: ServiceRequestRow[];
      };
      if (Array.isArray(market.services)) nextServices = market.services;
      setWallet(market.wallet ?? null);
      setWithdrawals(market.withdrawals ?? []);
      setBookings(market.bookings ?? []);
    }
    setServices(nextServices);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async (patch: Partial<UserRow>) => {
    if (!user) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await patchAdmin(`/api/admin/users/${user.id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
      router.push("/admin/users");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Delete failed");
      setAccountBusy(false);
    }
  };

  if (loading) return <AdminLoadingRow label="Loading user…" />;
  if (!user) return <AdminErrorAlert message={error || "User not found"} />;

  const athlete = nestedRecord<AthleteProfile>(user.athlete_profiles);
  const professional = nestedRecord<ProfessionalProfile>(user.professional_profiles);
  const media = nestedRecord<MediaProfile>(user.media_profiles);
  const professionalCopy = professionalProfileCopy(user.role);

  return (
    <>
      <AdminPageHeader
        title={user.display_name || "User"}
        description={user.email || user.username || undefined}
        backHref="/admin/users"
        breadcrumbs={[
          { label: "Users", href: "/admin/users" },
          { label: user.display_name || "Detail" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || accountBusy}
              onClick={() => save({ verified: !user.verified })}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {user.verified ? "Unverify" : "Verify"}
            </button>
            <button
              type="button"
              disabled={accountBusy}
              onClick={() => {
                setModalError(null);
                setPasswordOpen(true);
              }}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Reset password
            </button>
            <button
              type="button"
              disabled={accountBusy}
              onClick={() => {
                setModalError(null);
                setDeleteOpen(true);
              }}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Delete user
            </button>
          </div>
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
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

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <UserAvatar name={user.display_name} src={user.avatar_url} size={72} />
            <h2 className="mt-3 font-heading text-base font-semibold">{user.display_name || "Unnamed"}</h2>
            <p className="text-sm text-text-secondary">{user.full_name || user.username || "—"}</p>
            <div className="mt-3">
              <StatusBadge tone={verifiedTone(user.verified)}>
                {user.verified ? "Verified" : "Unverified"}
              </StatusBadge>
            </div>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <Row label="Role" value={catalog ? catalogRoleLabel(user.role) : roleLabel(user.role)} />
            <Row label="Location" value={locationLabel(user.city, user.country)} />
            <Row label="Email" value={user.email || "—"} />
            <Row label="Phone" value={user.phone || "—"} />
            <Row label="Joined" value={formatDate(user.created_at)} />
          </dl>
          {verificationId ? (
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="mb-2 text-text-secondary">ID verification</p>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge tone={requestTone(verificationStatus || "")}>
                  {verificationStatusLabel(verificationStatus)}
                </StatusBadge>
                <Link href={`/admin/verifications/${verificationId}`} className="font-medium text-primary">
                  Review docs
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {can("notifications:write") ? <SendPushForm userId={user.id} /> : null}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-heading text-sm font-semibold">Message</h3>
            <div className="grid gap-3">
              <Field
                label="Headline"
                value={user.headline}
                onSave={(value) => save({ headline: value })}
              />
              <Field
                label="Bio"
                value={user.bio}
                onSave={(value) => save({ bio: value })}
                multiline
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-heading text-sm font-semibold">
              Highlights
              <Link href="/admin/profile-media" className="ml-3 text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </h3>
            <HighlightsGallery items={mediaItems} />
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-heading text-sm font-semibold">Identity</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Display name"
                value={user.display_name}
                onSave={(value) => save({ display_name: value })}
              />
              <Field label="Full name" value={user.full_name} onSave={(value) => save({ full_name: value })} />
              <Field
                label="Username"
                value={user.username ?? ""}
                onSave={(value) => save({ username: value || null })}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-text-secondary">Role</span>
                <select
                  value={user.role}
                  onChange={(event) => save({ role: event.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                >
                  {(catalog ? roleOptions : allRoles).map((item) => (
                    <option key={item.id || "none"} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="City" value={user.city} onSave={(value) => save({ city: value })} />
              <Field label="Country" value={user.country} onSave={(value) => save({ country: value })} />
            </div>
            {(catalog ? catalogExtraProfileTable(user.role) : extraProfileTable(user.role)) ? (
              <p className="mt-3 text-xs text-text-hint">
                Extra profile table:{" "}
                {catalog ? catalogExtraProfileTable(user.role) : extraProfileTable(user.role)}
              </p>
            ) : null}
          </section>

          {athlete ? (
            <>
              <ProfileCard title="Athlete profile">
                <DetailGroup title="Playing">
                  <DetailField label="Position" value={athlete.position} />
                  <DetailField label="Secondary position" value={athlete.secondary_position || "—"} />
                  <DetailField label="Preferred foot" value={athlete.preferred_foot} />
                  <DetailField label="Team" value={athlete.team} />
                  <DetailField label="Playing level" value={athlete.playing_level || "—"} />
                  <DetailField label="Jersey" value={athlete.jersey_number?.toString() ?? "—"} />
                </DetailGroup>
                <DetailGroup title="Physical">
                  <DetailField label="Nationality" value={athlete.nationality || "—"} />
                  <DetailField label="Date of birth" value={formatDob(athlete.date_of_birth)} />
                  <DetailField label="Height" value={athlete.height_cm ? `${athlete.height_cm} cm` : "—"} />
                  <DetailField label="Weight" value={athlete.weight_kg ? `${athlete.weight_kg} kg` : "—"} />
                  <DetailField label="Experience" value={athlete.years_experience?.toString() ?? "—"} />
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
                    value={athlete.opportunity_interests?.join(", ") || "—"}
                  />
                </DetailGroup>
              </ProfileCard>
              <ProfileCard title="Career history">
                <CareerHistorySection value={athlete.career_history} />
              </ProfileCard>
              <ProfileCard title="Achievements">
                <AchievementsSection value={athlete.achievements} />
              </ProfileCard>
            </>
          ) : null}
          {professional ? (
            <>
              <ProfileCard title={professionalCopy.title}>
                <DetailGroup title="Credentials">
                  <DetailField label={professionalCopy.organization} value={professional.organization} />
                  <DetailField label={professionalCopy.license} value={professional.license} />
                  <DetailField label="Certified" value={professional.certified ? "Yes" : "No"} />
                  <DetailField label="Experience" value={professional.years_experience?.toString() ?? "—"} />
                </DetailGroup>
                <DetailGroup title="Focus">
                  <DetailField label="Specializations" value={professional.specializations?.join(", ") || "—"} />
                  <DetailField label="Regions" value={professional.regions?.join(", ") || "—"} />
                  <DetailField label="Age groups" value={professional.age_groups?.join(", ") || "—"} />
                  <DetailField label="Notes" value={professional.notes || "—"} />
                </DetailGroup>
              </ProfileCard>
              <ProfileCard title="Career history">
                <CareerHistorySection value={professional.career_history} />
              </ProfileCard>
              <ProfileCard title="Achievements">
                <AchievementsSection value={professional.achievements} />
              </ProfileCard>
            </>
          ) : null}
          {media ? (
            <>
              <ProfileCard title="Media profile">
                <DetailGroup>
                  <DetailField label="Outlet" value={media.outlet} />
                  <DetailField label="Specialty" value={media.specialty} />
                  <DetailField label="Portfolio" value={media.portfolio_url || "—"} />
                  <DetailField label="Experience" value={media.years_experience?.toString() ?? "—"} />
                  <DetailField label="Regions" value={media.regions?.join(", ") || "—"} />
                </DetailGroup>
              </ProfileCard>
              <ProfileCard title="Career history">
                <CareerHistorySection value={media.career_history} />
              </ProfileCard>
              <ProfileCard title="Achievements">
                <AchievementsSection value={media.achievements} />
              </ProfileCard>
            </>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-3 font-heading text-sm font-semibold">Organizations ({orgs.length})</h3>
              {orgs.length === 0 ? (
                <p className="text-sm text-text-secondary">No organizations.</p>
              ) : (
                <ul className="space-y-2">
                  {orgs.map((org) => (
                    <li key={org.id}>
                      <Link href={`/admin/organizations/${org.id}`} className="text-sm font-medium text-primary">
                        {org.name || org.public_id}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-heading text-sm font-semibold">Services ({services.length})</h3>
                {pendingServices.length > 0 ? (
                  <button
                    type="button"
                    disabled={busyService === "all"}
                    onClick={approveAllServices}
                    className="text-sm font-medium text-primary disabled:opacity-50"
                  >
                    Approve all pending
                  </button>
                ) : null}
              </div>
              {services.length === 0 ? (
                <p className="text-sm text-text-secondary">No services.</p>
              ) : (
                <ul className="space-y-3">
                  {services.map((service) => {
                    const cover = coverOf(service);
                    return (
                      <li key={service.id} className="flex gap-3 rounded-lg border border-border p-2">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" className="h-14 w-20 rounded-md object-cover" />
                        ) : (
                          <div className="grid h-14 w-20 place-items-center rounded-md bg-muted text-[10px] text-text-hint">
                            No photo
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/admin/services/${service.id}`} className="text-sm font-medium text-primary">
                            {service.title}
                          </Link>
                          <p className="text-xs text-text-secondary">
                            {[
                              service.city,
                              service.price_amount == null
                                ? formatStatusLabel(service.pricing_type)
                                : formatMoney(service.price_amount, service.currency || "ETB"),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {service.published ? "Approved" : "Pending approval"}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {service.published ? (
                              <button
                                type="button"
                                disabled={busyService === service.id}
                                onClick={() => toggleService(service, false)}
                                className="text-xs font-medium text-text-secondary disabled:opacity-50"
                              >
                                Unpublish
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyService === service.id}
                                onClick={() => toggleService(service, true)}
                                className="text-xs font-medium text-primary disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyService === service.id}
                              onClick={() => removeService(service)}
                              className="text-xs font-medium text-red-600 disabled:opacity-50"
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
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold">Coin gifts</h3>
                <Link href="/admin/coin-catalog" className="text-sm font-medium text-primary">
                  Gift catalog
                </Link>
              </div>
              {coinWallet ? (
                <dl className="space-y-2 text-sm">
                  <Row label="Gifts received (lifetime)" value={formatCoins(coinWallet.lifetime_received)} />
                  <Row label="Received balance" value={formatCoins(coinWallet.received_balance)} />
                  <Row label="Redeemable" value={formatCoins(coinWallet.redeemable_balance)} />
                  <Row label="Gifts sent (lifetime)" value={formatCoins(coinWallet.lifetime_gifted)} />
                  <Row label="Purchased balance" value={formatCoins(coinWallet.purchased_balance)} />
                </dl>
              ) : (
                <p className="text-sm text-text-secondary">
                  No coin wallet yet. It appears after the first gift or purchase.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold">Wallet</h3>
                <Link href="/admin/wallets" className="text-sm font-medium text-primary">
                  All wallets
                </Link>
              </div>
              {wallet ? (
                <dl className="space-y-2 text-sm">
                  <Row label="Available" value={formatMoney(wallet.available, wallet.currency)} />
                  <Row label="Lifetime earned" value={formatMoney(wallet.lifetime_earned, wallet.currency)} />
                  <Row label="Updated" value={formatDate(wallet.updated_at)} />
                </dl>
              ) : (
                <p className="text-sm text-text-secondary">No wallet yet. It appears after a paid booking is completed.</p>
              )}
              <h4 className="mb-2 mt-5 text-xs font-semibold uppercase text-text-secondary">Withdrawals</h4>
              {withdrawals.length === 0 ? (
                <p className="text-sm text-text-secondary">No withdrawal requests.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {withdrawals.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3">
                      <span>
                        {formatMoney(row.amount)} · {row.bank_name}
                      </span>
                      <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold">Bookings ({bookings.length})</h3>
                <Link href="/admin/requests" className="text-sm font-medium text-primary">
                  All bookings
                </Link>
              </div>
              {bookings.length === 0 ? (
                <p className="text-sm text-text-secondary">No bookings for this user.</p>
              ) : (
                <ul className="space-y-3">
                  {bookings.map((row) => {
                    const payment = firstPayment(row.service_payments);
                    const otherId = row.provider_id === id ? row.requester_id : row.provider_id;
                    const otherName =
                      row.provider_id === id
                        ? row.requester?.display_name || "Customer"
                        : row.provider?.display_name || "Provider";
                    return (
                      <li key={row.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/admin/services/${row.service_id}`} className="text-sm font-medium text-primary">
                              {row.services?.title || "Service"}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {row.provider_id === id ? "Incoming from" : "Booked"}{" "}
                              <Link href={`/admin/users/${otherId}`} className="text-primary">
                                {otherName}
                              </Link>
                            </p>
                            {payment ? (
                              <p className="text-xs text-text-secondary">
                                {formatMoney(payment.amount, payment.currency)} · {formatStatusLabel(payment.status)}
                              </p>
                            ) : null}
                          </div>
                          <StatusBadge tone={requestTone(row.status)}>{formatStatusLabel(row.status)}</StatusBadge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 font-heading text-sm font-semibold">{title}</h3>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onSave,
  className,
  multiline,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1 block text-text-secondary">{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
          rows={3}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
        />
      )}
    </label>
  );
}
