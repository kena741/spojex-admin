"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton } from "@/components/admin-layout";
import {
  ADMIN_SETTINGS_CACHE_KEY,
  fetchAdminSettingsPayload,
  type AdminSettingsPayload,
} from "@/lib/admin-settings-query";
import { postAdminResponse } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

type PaymentProvider = "chapa" | "telebirr" | "wallet";

type PaymentSettings = {
  chapa?: Record<string, string | boolean | number | undefined>;
  telebirr?: Record<string, string | boolean | number | undefined>;
  wallet?: Record<string, string | boolean | number | undefined>;
};

type ChapaFormValues = {
  name: string;
  enable: boolean;
  isActive: boolean;
  isSandbox: boolean;
  publicKey: string;
  secretKey: string;
};

function asObject(value: unknown): Record<string, string | boolean | number | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | boolean | number | undefined>;
}

export default function PaymentSettingsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("settings:write");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null,
  );
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({});
  const [isSecretVisible, setIsSecretVisible] = useState(false);

  const chapaValues: ChapaFormValues = {
    name: String(paymentSettings.chapa?.name || "Chapa"),
    enable: Boolean(paymentSettings.chapa?.enable),
    isActive: Boolean(paymentSettings.chapa?.isActive),
    isSandbox: Boolean(paymentSettings.chapa?.isSandbox),
    publicKey: String(paymentSettings.chapa?.publicKey || ""),
    secretKey: String(paymentSettings.chapa?.secretKey || ""),
  };

  const {
    data: settingsData,
    loading,
    refreshing,
    error: loadError,
    refresh,
  } = useAdminQuery<AdminSettingsPayload>({
    key: ADMIN_SETTINGS_CACHE_KEY,
    fetcher: fetchAdminSettingsPayload,
  });
  const error = actionError ?? loadError;

  useEffect(() => {
    if (!settingsData) return;
    const paymentRow = (settingsData.appRows ?? []).find((row) => row.id === "payment");
    setPaymentSettings(asObject(paymentRow?.data) as PaymentSettings);
  }, [settingsData]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const updatePaymentSetting = (
    provider: PaymentProvider,
    key: string,
    value: string | boolean | number,
  ) => {
    setPaymentSettings((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [key]: value,
      },
    }));
  };

  const updateChapaField = (key: keyof ChapaFormValues, value: string | boolean) => {
    updatePaymentSetting("chapa", key, value);
  };

  const handleSave = async () => {
    if (!canWrite) return;
    setSaving(true);
    setActionError(null);
    try {
      await postAdminResponse("/api/admin/settings", {
        paymentSettings,
      });
      setToast({ message: "Payment settings saved successfully.", variant: "success" });
      await refresh();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to save payment settings.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed right-6 top-6 z-50">
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl",
              toast.variant === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            {toast.message}
          </div>
        </div>
      )}

      <AdminPageHeader
        title="Payment Settings"
        description="Chapa, Telebirr, and wallet gateway configuration for Spojex"
        breadcrumbs={[
          { label: "Finance", href: "/admin/finance" },
          { label: "Payment Settings" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => {
                setActionError(null);
                void refresh();
              }}
            />
            {canWrite ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            ) : null}
          </div>
        }
      />

      {error && <AdminErrorAlert message={error} />}

      {loading ? (
        <AdminLoadingRow label="Loading payment settings…" />
      ) : (
        <fieldset disabled={!canWrite} className="space-y-6 disabled:opacity-90">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-foreground">Chapa</h3>
              <p className="text-xs text-text-secondary">
                {chapaValues.enable && chapaValues.isActive ? "Enabled" : "Disabled"}
                {" · "}
                {chapaValues.isSandbox ? "Test mode" : "Live mode"}
                {" · "}
                {Boolean(paymentSettings.chapa?.secretConfigured)
                  ? "Secret configured"
                  : "Secret missing"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={chapaValues.name}
                  onChange={(e) => updateChapaField("name", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-end gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chapaValues.enable}
                    onChange={(e) => updateChapaField("enable", e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">Enable</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chapaValues.isActive}
                    onChange={(e) => updateChapaField("isActive", e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">Active</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chapaValues.isSandbox}
                    onChange={(e) => updateChapaField("isSandbox", e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">Sandbox</span>
                </label>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Public Key</label>
                <input
                  type="text"
                  value={chapaValues.publicKey}
                  onChange={(e) => updateChapaField("publicKey", e.target.value)}
                  placeholder="CHAPUBK-..."
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Secret Key
                  <span className="ml-2 font-normal text-text-hint">
                    {Boolean(paymentSettings.chapa?.secretConfigured)
                      ? "(configured - leave blank to keep)"
                      : "(not configured)"}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={isSecretVisible ? "text" : "password"}
                    value={chapaValues.secretKey}
                    onChange={(e) => updateChapaField("secretKey", e.target.value)}
                    placeholder={
                      Boolean(paymentSettings.chapa?.secretConfigured)
                        ? "••••••••  (enter new value to replace)"
                        : "CHASECK-..."
                    }
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2 pr-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setIsSecretVisible((prev) => !prev)}
                    className="absolute inset-y-0 right-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={isSecretVisible ? "Hide secret key" : "Show secret key"}
                  >
                    {isSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Telebirr */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-foreground">Telebirr</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={String(paymentSettings.telebirr?.name || "")}
                  onChange={(e) => updatePaymentSetting("telebirr", "name", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {paymentSettings.telebirr &&
                Object.keys(paymentSettings.telebirr)
                  .filter((key) => key !== "name")
                  .map((key) => (
                    <div key={key}>
                      <label className="mb-2 block text-sm font-medium capitalize text-foreground">
                        {key}
                      </label>
                      <input
                        type="text"
                        value={String(paymentSettings.telebirr?.[key] || "")}
                        onChange={(e) => updatePaymentSetting("telebirr", key, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
            </div>
          </div>

          {/* Wallet */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-foreground">Wallet</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={String(paymentSettings.wallet?.name || "")}
                  onChange={(e) => updatePaymentSetting("wallet", "name", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(paymentSettings.wallet?.enable)}
                    onChange={(e) => updatePaymentSetting("wallet", "enable", e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">Enable</span>
                </label>
              </div>
              {paymentSettings.wallet &&
                Object.keys(paymentSettings.wallet)
                  .filter((key) => key !== "name" && key !== "enable")
                  .map((key) => (
                    <div key={key}>
                      <label className="mb-2 block text-sm font-medium capitalize text-foreground">
                        {key}
                      </label>
                      <input
                        type="text"
                        value={String(paymentSettings.wallet?.[key] || "")}
                        onChange={(e) => updatePaymentSetting("wallet", key, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Tip: you can also open this from{" "}
            <Link href="/admin/settings" className="text-primary hover:underline">
              Global settings → Payment
            </Link>
            .
          </p>
        </fieldset>
      )}
    </div>
  );
}
