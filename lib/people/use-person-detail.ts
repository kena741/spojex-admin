"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminCacheKey, invalidateAdminCache } from "@/lib/admin-session-cache";
import { deleteAdmin, patchAdmin, postAdmin, postAdminResponse } from "@/lib/hooks";
import { fetchPersonSnapshot } from "@/lib/people/fetch-person";
import type { FeedInterestDetail, PersonSnapshot } from "@/lib/people/types";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useApplyAdminSnapshot } from "@/lib/use-admin-snapshot";
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

export interface PersonDetail {
  user: UserRow | null;
  orgs: OrganizationRow[];
  services: ServiceRow[];
  wallet: WalletRow | null;
  coinWallet: CoinWalletRow | null;
  withdrawals: WithdrawalRow[];
  bookings: ServiceRequestRow[];
  mediaItems: ProfileMediaRow[];
  verificationId: string | null;
  verificationStatus: string | null;
  feedInterest: FeedInterestDetail | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  saving: boolean;
  accountBusy: boolean;
  busyService: string | null;
  dismissNotice: () => void;
  reload: () => Promise<void>;
  /** Returns false when the save failed so inline editors can react. */
  save: (patch: Partial<UserRow>, options?: { silent?: boolean }) => Promise<boolean>;
  toggleService: (row: ServiceRow, published: boolean) => Promise<void>;
  deleteService: (row: ServiceRow) => Promise<void>;
  approveAllServices: () => Promise<void>;
  /** Resolves with an error message, or null on success. */
  resetPassword: (password: string) => Promise<string | null>;
  /** Resolves with an error message, or null on success (then navigates away). */
  deletePerson: () => Promise<string | null>;
}

/**
 * Owns the person snapshot plus every mutation the detail page can perform.
 * UI-only state (modals, tabs) stays in the page.
 */
export function usePersonDetail(id: string): PersonDetail {
  const router = useRouter();
  const [user, setUser] = useState<UserRow | null>(null);
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [coinWallet, setCoinWallet] = useState<CoinWalletRow | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [bookings, setBookings] = useState<ServiceRequestRow[]>([]);
  const [mediaItems, setMediaItems] = useState<ProfileMediaRow[]>([]);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [feedInterest, setFeedInterest] = useState<FeedInterestDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [busyService, setBusyService] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: snapshot,
    loading,
    error: loadError,
    refresh,
  } = useAdminQuery<PersonSnapshot>({
    key: adminCacheKey(["people", "detail", id]),
    fetcher: () => fetchPersonSnapshot(id),
  });

  useApplyAdminSnapshot(snapshot, (next) => {
    setUser(next.user);
    setOrgs(next.orgs);
    setMediaItems(next.mediaItems);
    setVerificationId(next.verificationId);
    setVerificationStatus(next.verificationStatus);
    setCoinWallet(next.coinWallet);
    setServices(next.services);
    setWallet(next.wallet);
    setWithdrawals(next.withdrawals);
    setBookings(next.bookings);
    setFeedInterest(next.feedInterest);
  });

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  /** Soft reload after a mutation; also drops the parent list cache. */
  const reload = async () => {
    setError(null);
    invalidateAdminCache(adminCacheKey(["people", "list"]));
    const next = await refresh();
    if (!next) throw new Error("Failed to reload user");
  };

  const save = async (
    patch: Partial<UserRow>,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    if (!options?.silent) setNotice(null);
    setError(null);
    try {
      await patchAdmin(`/api/admin/users/${user.id}`, patch);
      await reload();
      if (!options?.silent) setNotice("Changes saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleService = async (row: ServiceRow, published: boolean) => {
    setBusyService(row.id);
    try {
      await patchAdmin(`/api/admin/services/${row.id}`, { published });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyService(null);
    }
  };

  const deleteService = async (row: ServiceRow) => {
    if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setBusyService(row.id);
    try {
      await deleteAdmin(`/api/admin/services/${row.id}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyService(null);
    }
  };

  const approveAllServices = async () => {
    if (!services.some((service) => !service.published)) return;
    setBusyService("all");
    try {
      await postAdmin("/api/admin/services", { action: "approve_all", provider_id: id });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve all failed");
    } finally {
      setBusyService(null);
    }
  };

  const resetPassword = async (password: string): Promise<string | null> => {
    if (!user) return "No user loaded";
    setAccountBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postAdminResponse(`/api/admin/users/${user.id}/password`, { password });
      setNotice("Password updated.");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Password reset failed";
    } finally {
      setAccountBusy(false);
    }
  };

  const deletePerson = async (): Promise<string | null> => {
    if (!user) return "No user loaded";
    setAccountBusy(true);
    setError(null);
    try {
      await deleteAdmin(`/api/admin/users/${user.id}`);
      invalidateAdminCache(adminCacheKey(["people"]));
      router.push("/admin/people");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Delete failed";
    } finally {
      setAccountBusy(false);
    }
  };

  return {
    user,
    orgs,
    services,
    wallet,
    coinWallet,
    withdrawals,
    bookings,
    mediaItems,
    verificationId,
    verificationStatus,
    feedInterest,
    loading,
    error,
    notice,
    saving,
    accountBusy,
    busyService,
    dismissNotice: () => setNotice(null),
    reload,
    save,
    toggleService,
    deleteService,
    approveAllServices,
    resetPassword,
    deletePerson,
  };
}
