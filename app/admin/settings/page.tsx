"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Languages,
  ListOrdered,
  Mail,
  PercentCircle,
  Plus,
  Receipt,
  Save,
  Shield,
  Smartphone,
  Trash2,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminReloadButton } from "@/components/admin-layout";
import {
  ADMIN_SETTINGS_CACHE_KEY,
  fetchAdminSettingsPayload,
  type AdminSettingsPayload,
} from "@/lib/admin-settings-query";
import { postAdminResponse } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminUiState } from "@/lib/use-admin-ui-state";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

type TabId =
  | "app"
  | "general"
  | "policy"
  | "contact"
  | "commission"
  | "status"
  | "constants"
  | "payment"
  | "country_tax"
  | "language";

type StatusOption = { flag: string; name: string };
type LanguageRow = { id?: string; code: string; name: string; active: boolean };
type Tier = { total_price: number; max_services: number };
type TaxRow = {
  id?: number;
  country: string;
  name: string;
  value: string;
  type: "percentage" | "fixed";
  active: boolean;
};

const DEFAULT_TIERS: Tier[] = [
  { total_price: 99, max_services: 1 },
  { total_price: 249, max_services: 4 },
  { total_price: 499, max_services: 10 },
  { total_price: 999, max_services: -1 },
];

const DEFAULT_CONTACT = {
  email: "support@spojex.app",
  phoneNumber: "",
  address: "Addis Ababa, Ethiopia",
  emailSubject: "Spojex support",
};

const TABS: { id: TabId; label: string; icon: typeof Smartphone }[] = [
  { id: "app", label: "App", icon: Smartphone },
  { id: "general", label: "General", icon: Globe },
  { id: "policy", label: "Policies", icon: Shield },
  { id: "contact", label: "Contact", icon: Mail },
  { id: "commission", label: "Commission", icon: PercentCircle },
  { id: "status", label: "Statuses", icon: ListOrdered },
  { id: "constants", label: "Constants", icon: Coins },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "country_tax", label: "Country tax", icon: Receipt },
  { id: "language", label: "Language", icon: Languages },
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return (JSON.parse(value) as Record<string, unknown>) ?? {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function fieldClassName() {
  return "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
}

function labelClassName() {
  return "mb-1.5 block text-sm font-medium text-foreground";
}

export default function GlobalSettingsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("settings:write");
  const [tab, setTab] = useAdminUiState<TabId>("settings:global:tab", "app");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<Record<string, unknown>>({});
  const [generalSettings, setGeneralSettings] = useState<Record<string, unknown>>({});
  const [policySettings, setPolicySettings] = useState<Record<string, unknown>>({});
  const [contactUs, setContactUs] = useState(DEFAULT_CONTACT);
  const [adminCommission, setAdminCommission] = useState<Record<string, unknown>>({
    value: "10",
    isFix: false,
    active: true,
  });
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([
    { flag: "pending", name: "Pending" },
  ]);
  const [constants, setConstants] = useState<Record<string, unknown>>({
    service_posting_tiers: DEFAULT_TIERS,
  });
  const [payment, setPayment] = useState<Record<string, unknown>>({
    chapa: {
      name: "Chapa",
      enable: true,
      isActive: true,
      isSandbox: true,
      publicKey: "",
      secretKey: "",
    },
    wallet: { name: "Wallet", enable: true },
  });
  const [languages, setLanguages] = useState<LanguageRow[]>([
    { code: "en", name: "English", active: true },
  ]);
  const [languageDeletedIds, setLanguageDeletedIds] = useState<string[]>([]);
  const [taxes, setTaxes] = useState<TaxRow[]>([]);
  const [taxDeletedIds, setTaxDeletedIds] = useState<number[]>([]);
  const [showMapKey, setShowMapKey] = useState(false);
  const [showChapaSecret, setShowChapaSecret] = useState(false);
  /** 1 Birr = N coins (drives Chapa credit after payment). */
  const [coinsPerBirr, setCoinsPerBirr] = useState("10");

  const tiers = useMemo(() => {
    const raw = constants.service_posting_tiers;
    return Array.isArray(raw) && raw.length > 0
      ? (raw as Tier[])
      : DEFAULT_TIERS;
  }, [constants.service_posting_tiers]);

  const chapa = asObject(payment.chapa);

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

  const hydrate = (payload: AdminSettingsPayload) => {
    const perBirr = Number(payload.coinSettings?.coins_per_birr);
    if (Number.isFinite(perBirr) && perBirr > 0) {
      setCoinsPerBirr(
        Number.isInteger(perBirr) ? String(perBirr) : perBirr.toFixed(2),
      );
    } else {
      setCoinsPerBirr("10");
    }

    const byId = new Map((payload.appRows ?? []).map((row) => [row.id, row.data]));
    const settings = asObject(byId.get("settings"));
    const policy = asObject(byId.get("policy"));
    const contact = asObject(byId.get("contact_us"));
    const commission = asObject(byId.get("admin_commission"));
    const constant = asObject(byId.get("constant"));
    const pay = asObject(byId.get("payment"));
    const statusRaw = byId.get("status");

    setAppSettings({
      appName: settings.appName ?? "Spojex",
      appVersion: settings.appVersion ?? "",
      appColor: settings.appColor ?? "#0A2463",
      googleMapKey: settings.googleMapKey ?? "",
      extraCharge_GST: Boolean(settings.extraCharge_GST),
    });
    setGeneralSettings({
      phoneNumber: settings.phoneNumber ?? "",
      supportEmail: settings.supportEmail ?? "",
      supportURL: settings.supportURL ?? "",
      radius: settings.radius ?? "50",
      referralAmount: settings.referralAmount ?? "",
      notification_server_key: settings.notification_server_key ?? "",
    });
    setPolicySettings({
      privacyPolicy: policy.privacyPolicy ?? settings.privacyPolicy ?? "",
      termsAndConditions:
        policy.termsAndConditions ?? settings.termsAndConditions ?? "",
      communityGuidelines: policy.communityGuidelines ?? "",
      aboutApp: policy.aboutApp ?? settings.aboutApp ?? "",
      aboutAppSpojex:
        policy.aboutAppSpojex ?? settings.aboutAppSpojex ?? "",
    });
    setContactUs({
      ...DEFAULT_CONTACT,
      email: String(contact.email ?? DEFAULT_CONTACT.email),
      phoneNumber: String(contact.phoneNumber ?? ""),
      address: String(contact.address ?? DEFAULT_CONTACT.address),
      emailSubject: String(contact.emailSubject ?? DEFAULT_CONTACT.emailSubject),
    });
    setAdminCommission({
      value: String(commission.value ?? "10"),
      isFix: Boolean(commission.isFix),
      active: commission.active !== false,
    });
    setStatusOptions(
      Array.isArray(statusRaw) && statusRaw.length > 0
        ? (statusRaw as StatusOption[]).map((s) => ({ ...s }))
        : [{ flag: "pending", name: "Pending" }],
    );
    setConstants({
      ...constant,
      service_posting_tiers:
        Array.isArray(constant.service_posting_tiers) &&
        (constant.service_posting_tiers as Tier[]).length > 0
          ? constant.service_posting_tiers
          : DEFAULT_TIERS,
    });
    setPayment({
      chapa: {
        name: "Chapa",
        enable: true,
        isActive: true,
        isSandbox: true,
        publicKey: "",
        secretKey: "",
        ...asObject(pay.chapa),
      },
      wallet: {
        name: "Wallet",
        enable: true,
        ...asObject(pay.wallet),
      },
      telebirr: asObject(pay.telebirr),
    });
    setLanguages(
      (payload.languageRows ?? []).length > 0
        ? payload.languageRows!
        : [{ code: "en", name: "English", active: true }],
    );
    setLanguageDeletedIds([]);
    setTaxes(
      (payload.taxRows ?? []).map((row) => ({
        id: row.id,
        country: row.country || "Ethiopia",
        name: row.name || "",
        value: String(row.value ?? ""),
        type: row.type === "fixed" || row.is_fix ? "fixed" : "percentage",
        active: Boolean(row.active),
      })),
    );
    setTaxDeletedIds([]);
  };

  useEffect(() => {
    if (settingsData) hydrate(settingsData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  const load = async () => {
    await refresh();
  };

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      const rate = Number(coinsPerBirr);
      if (tab === "payment" && (!Number.isFinite(rate) || rate <= 0)) {
        throw new Error("Coins per 1 Birr must be greater than 0.");
      }
      await postAdminResponse("/api/admin/settings", {
        appSettings,
        generalSettings,
        policySettings,
        contactUs,
        adminCommission,
        statusOptions: statusOptions.filter((s) => s.flag.trim()),
        constants: { ...constants, service_posting_tiers: tiers },
        paymentSettings: payment,
        ...(Number.isFinite(rate) && rate > 0 ? { coins_per_birr: rate } : {}),
        languageSettings: languages,
        languageDeletedIds,
      });
      if (tab === "country_tax") {
        await postAdminResponse("/api/admin/settings/tax", {
          rows: taxes,
          deletedIds: taxDeletedIds,
        });
      }
      setNotice("Settings saved.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const saveTaxes = async () => {
    if (!canWrite) return;
    setSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      await postAdminResponse("/api/admin/settings/tax", {
        rows: taxes,
        deletedIds: taxDeletedIds,
      });
      setNotice("Country tax saved.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save tax");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Global settings"
        description="Platform-wide configuration for SpoJex."
        breadcrumbs={[
          { label: "Dashboard", href: "/admin/dashboard" },
          { label: "Global settings" },
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
            {canWrite && (
              <button
                type="button"
                onClick={tab === "country_tax" ? saveTaxes : save}
                disabled={saving || loading}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        }
      />

      {error && <AdminErrorAlert message={error} />}
      {notice && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-5 md:p-6">
          {loading ? (
            <AdminLoadingRow label="Loading settings…" />
          ) : (
            <>
              {tab === "app" && (
                <Section title="App">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="App name"
                      value={String(appSettings.appName ?? "")}
                      onChange={(v) => setAppSettings({ ...appSettings, appName: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="App version"
                      value={String(appSettings.appVersion ?? "")}
                      onChange={(v) => setAppSettings({ ...appSettings, appVersion: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="App color"
                      value={String(appSettings.appColor ?? "")}
                      onChange={(v) => setAppSettings({ ...appSettings, appColor: v })}
                      disabled={!canWrite}
                    />
                    <div>
                      <label className={labelClassName()}>Google Maps key</label>
                      <div className="relative">
                        <input
                          type={showMapKey ? "text" : "password"}
                          className={cn(fieldClassName(), "pr-10")}
                          value={String(appSettings.googleMapKey ?? "")}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setAppSettings({ ...appSettings, googleMapKey: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowMapKey((v) => !v)}
                        >
                          {showMapKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(appSettings.extraCharge_GST)}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setAppSettings({ ...appSettings, extraCharge_GST: e.target.checked })
                        }
                      />
                      Extra charge GST
                    </label>
                    <div className="md:col-span-2">
                      <label className={labelClassName()}>About Spojex (HTML)</label>
                      <textarea
                        className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={String(policySettings.aboutAppSpojex ?? "")}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setPolicySettings({
                            ...policySettings,
                            aboutAppSpojex: e.target.value,
                            aboutApp: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </Section>
              )}

              {tab === "general" && (
                <Section title="General">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Support phone"
                      value={String(generalSettings.phoneNumber ?? "")}
                      onChange={(v) => setGeneralSettings({ ...generalSettings, phoneNumber: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Support email"
                      value={String(generalSettings.supportEmail ?? "")}
                      onChange={(v) => setGeneralSettings({ ...generalSettings, supportEmail: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Support URL"
                      value={String(generalSettings.supportURL ?? "")}
                      onChange={(v) => setGeneralSettings({ ...generalSettings, supportURL: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Search radius (km)"
                      value={String(generalSettings.radius ?? "")}
                      onChange={(v) => setGeneralSettings({ ...generalSettings, radius: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Referral amount"
                      value={String(generalSettings.referralAmount ?? "")}
                      onChange={(v) =>
                        setGeneralSettings({ ...generalSettings, referralAmount: v })
                      }
                      disabled={!canWrite}
                    />
                    <Field
                      label="Notification server key"
                      value={String(generalSettings.notification_server_key ?? "")}
                      onChange={(v) =>
                        setGeneralSettings({
                          ...generalSettings,
                          notification_server_key: v,
                        })
                      }
                      disabled={!canWrite}
                    />
                  </div>
                </Section>
              )}

              {tab === "policy" && (
                <Section title="Policies">
                  <div className="space-y-4">
                    <div>
                      <label className={labelClassName()}>Privacy policy (HTML)</label>
                      <textarea
                        className="min-h-36 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={String(policySettings.privacyPolicy ?? "")}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setPolicySettings({ ...policySettings, privacyPolicy: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClassName()}>Terms and conditions (HTML)</label>
                      <textarea
                        className="min-h-36 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={String(policySettings.termsAndConditions ?? "")}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setPolicySettings({
                            ...policySettings,
                            termsAndConditions: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClassName()}>Community guidelines (HTML)</label>
                      <textarea
                        className="min-h-36 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={String(policySettings.communityGuidelines ?? "")}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setPolicySettings({
                            ...policySettings,
                            communityGuidelines: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClassName()}>About Spojex (shown in app Settings)</label>
                      <textarea
                        className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={String(policySettings.aboutApp ?? "")}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setPolicySettings({ ...policySettings, aboutApp: e.target.value })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      These texts, plus the Contact tab and App name/version,
                      appear in the mobile app under Profile → Settings.
                    </p>
                  </div>
                </Section>
              )}

              {tab === "contact" && (
                <Section title="Contact us">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Email"
                      value={contactUs.email}
                      onChange={(v) => setContactUs({ ...contactUs, email: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Phone"
                      value={contactUs.phoneNumber}
                      onChange={(v) => setContactUs({ ...contactUs, phoneNumber: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Address"
                      value={contactUs.address}
                      onChange={(v) => setContactUs({ ...contactUs, address: v })}
                      disabled={!canWrite}
                    />
                    <Field
                      label="Email subject"
                      value={contactUs.emailSubject}
                      onChange={(v) => setContactUs({ ...contactUs, emailSubject: v })}
                      disabled={!canWrite}
                    />
                  </div>
                </Section>
              )}

              {tab === "commission" && (
                <Section title="Admin commission">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field
                      label="Value"
                      value={String(adminCommission.value ?? "")}
                      onChange={(v) => setAdminCommission({ ...adminCommission, value: v })}
                      disabled={!canWrite}
                    />
                    <label className="flex items-center gap-2 text-sm md:pt-7">
                      <input
                        type="checkbox"
                        checked={Boolean(adminCommission.isFix)}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setAdminCommission({ ...adminCommission, isFix: e.target.checked })
                        }
                      />
                      Fixed amount (else %)
                    </label>
                    <label className="flex items-center gap-2 text-sm md:pt-7">
                      <input
                        type="checkbox"
                        checked={adminCommission.active !== false}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setAdminCommission({ ...adminCommission, active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                  </div>
                </Section>
              )}

              {tab === "status" && (
                <Section title="Booking / request statuses">
                  <RowsEditor
                    canWrite={canWrite}
                    rows={statusOptions}
                    onAdd={() => setStatusOptions((prev) => [...prev, { flag: "", name: "" }])}
                    onRemove={(index) =>
                      setStatusOptions((prev) =>
                        prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
                      )
                    }
                    renderRow={(row, index) => (
                      <>
                        <input
                          className={fieldClassName()}
                          placeholder="flag"
                          value={row.flag}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setStatusOptions((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, flag: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <input
                          className={fieldClassName()}
                          placeholder="display name"
                          value={row.name}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setStatusOptions((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </>
                    )}
                  />
                </Section>
              )}

              {tab === "constants" && (
                <Section title="Constants">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Minimum wallet balance to keep"
                      value={String(constants.minimum_wallet_balance_to_keep ?? "")}
                      onChange={(v) =>
                        setConstants({ ...constants, minimum_wallet_balance_to_keep: v })
                      }
                      disabled={!canWrite}
                    />
                    <Field
                      label="Featured service request fee"
                      value={String(
                        constants.provider_service_featured_request_fee_amount ?? "",
                      )}
                      onChange={(v) =>
                        setConstants({
                          ...constants,
                          provider_service_featured_request_fee_amount: v,
                        })
                      }
                      disabled={!canWrite}
                    />
                  </div>
                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Service posting tiers</h3>
                      {canWrite && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-primary"
                          onClick={() =>
                            setConstants({
                              ...constants,
                              service_posting_tiers: [
                                ...tiers,
                                { total_price: 0, max_services: 0 },
                              ],
                            })
                          }
                        >
                          <Plus className="h-4 w-4" />
                          Add tier
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {tiers.map((tier, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input
                            className={fieldClassName()}
                            type="number"
                            placeholder="price ETB"
                            value={tier.total_price}
                            disabled={!canWrite}
                            onChange={(e) => {
                              const next = [...tiers];
                              next[index] = {
                                ...tier,
                                total_price: Number(e.target.value) || 0,
                              };
                              setConstants({ ...constants, service_posting_tiers: next });
                            }}
                          />
                          <input
                            className={fieldClassName()}
                            type="number"
                            placeholder="max services (-1 = unlimited)"
                            value={tier.max_services}
                            disabled={!canWrite}
                            onChange={(e) => {
                              const next = [...tiers];
                              next[index] = {
                                ...tier,
                                max_services: Number(e.target.value) || 0,
                              };
                              setConstants({ ...constants, service_posting_tiers: next });
                            }}
                          />
                          {canWrite && (
                            <button
                              type="button"
                              className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground"
                              onClick={() => {
                                if (tiers.length <= 1) return;
                                setConstants({
                                  ...constants,
                                  service_posting_tiers: tiers.filter((_, i) => i !== index),
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>
              )}

              {tab === "payment" && (
                <Section title="Payment gateways">
                  <div className="mb-4">
                    <Link
                      href="/admin/finance/payment-settings"
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <CreditCard className="h-4 w-4" />
                      Open full Payment Settings
                    </Link>
                  </div>

                  {/* Coin ↔ Birr - used when crediting wallet after Chapa pay */}
                  <div className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <Coins className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold text-foreground">
                        Coin ↔ Birr rate
                      </h3>
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      After a successful Chapa coin purchase, credited coins = paid
                      Birr × this rate (plus any pack bonus).
                    </p>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Coins per 1 Birr
                        </label>
                        <input
                          type="number"
                          min={0.01}
                          step="1"
                          value={coinsPerBirr}
                          disabled={!canWrite}
                          onChange={(e) => setCoinsPerBirr(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        {Number(coinsPerBirr) > 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Example: 2 Birr →{" "}
                            {Math.floor(2 * Number(coinsPerBirr))} coins · 1 coin ={" "}
                            {(1 / Number(coinsPerBirr)).toFixed(2)} ETB
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-end">
                        <Link
                          href="/admin/coin-catalog"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Manage coin packs &amp; gifts →
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-bold text-foreground">Chapa</h3>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Name
                        </label>
                        <input
                          type="text"
                          value={String(chapa.name || "Chapa")}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setPayment({
                              ...payment,
                              chapa: { ...chapa, name: e.target.value },
                            })
                          }
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="flex items-end gap-6">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(chapa.enable)}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                chapa: { ...chapa, enable: e.target.checked },
                              })
                            }
                            className="h-4 w-4 rounded border-border text-primary"
                          />
                          <span className="text-sm font-medium">Enable</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(chapa.isActive)}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                chapa: { ...chapa, isActive: e.target.checked },
                              })
                            }
                            className="h-4 w-4 rounded border-border text-primary"
                          />
                          <span className="text-sm font-medium">Active</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(chapa.isSandbox)}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                chapa: { ...chapa, isSandbox: e.target.checked },
                              })
                            }
                            className="h-4 w-4 rounded border-border text-primary"
                          />
                          <span className="text-sm font-medium">Sandbox</span>
                        </label>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Public Key
                        </label>
                        <input
                          type="text"
                          value={String(chapa.publicKey || "")}
                          disabled={!canWrite}
                          placeholder="CHAPUBK-..."
                          onChange={(e) =>
                            setPayment({
                              ...payment,
                              chapa: { ...chapa, publicKey: e.target.value },
                            })
                          }
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          Secret Key
                        </label>
                        <div className="relative">
                          <input
                            type={showChapaSecret ? "text" : "password"}
                            value={String(chapa.secretKey || "")}
                            disabled={!canWrite}
                            placeholder="CHASECK-..."
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                chapa: { ...chapa, secretKey: e.target.value },
                              })
                            }
                            className="w-full rounded-lg border border-border bg-background px-4 py-2 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            type="button"
                            onClick={() => setShowChapaSecret((prev) => !prev)}
                            className="absolute inset-y-0 right-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label={
                              showChapaSecret ? "Hide secret key" : "Show secret key"
                            }
                          >
                            {showChapaSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Telebirr */}
                  <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-bold text-foreground">Telebirr</h3>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">Name</label>
                        <input
                          type="text"
                          value={String(asObject(payment.telebirr).name || "")}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setPayment({
                              ...payment,
                              telebirr: {
                                ...asObject(payment.telebirr),
                                name: e.target.value,
                              },
                            })
                          }
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Wallet */}
                  <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-bold text-foreground">Wallet</h3>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">Name</label>
                        <input
                          type="text"
                          value={String(asObject(payment.wallet).name || "Wallet")}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setPayment({
                              ...payment,
                              wallet: {
                                ...asObject(payment.wallet),
                                name: e.target.value,
                              },
                            })
                          }
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(asObject(payment.wallet).enable)}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                wallet: {
                                  ...asObject(payment.wallet),
                                  enable: e.target.checked,
                                },
                              })
                            }
                            className="h-4 w-4 rounded border-border text-primary"
                          />
                          <span className="text-sm font-medium">Enable</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {tab === "country_tax" && (
                <Section title="Country tax">
                  <RowsEditor
                    canWrite={canWrite}
                    rows={taxes}
                    onAdd={() =>
                      setTaxes((prev) => [
                        ...prev,
                        {
                          country: "Ethiopia",
                          name: "",
                          value: "",
                          type: "percentage",
                          active: true,
                        },
                      ])
                    }
                    onRemove={(index) => {
                      const row = taxes[index];
                      if (row?.id) setTaxDeletedIds((ids) => [...ids, row.id!]);
                      setTaxes((prev) => prev.filter((_, i) => i !== index));
                    }}
                    renderRow={(row, index) => (
                      <>
                        <input
                          className={fieldClassName()}
                          placeholder="country"
                          value={row.country}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setTaxes((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, country: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <input
                          className={fieldClassName()}
                          placeholder="name"
                          value={row.name}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setTaxes((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <input
                          className={fieldClassName()}
                          placeholder="value"
                          value={row.value}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setTaxes((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, value: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <select
                          className={fieldClassName()}
                          value={row.type}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setTaxes((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      type: e.target.value as "percentage" | "fixed",
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="percentage">percentage</option>
                          <option value="fixed">fixed</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.active}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setTaxes((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, active: e.target.checked } : item,
                                ),
                              )
                            }
                          />
                          Active
                        </label>
                      </>
                    )}
                    columns="grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]"
                  />
                </Section>
              )}

              {tab === "language" && (
                <Section title="Languages">
                  <RowsEditor
                    canWrite={canWrite}
                    rows={languages}
                    onAdd={() =>
                      setLanguages((prev) => [
                        ...prev,
                        { code: "", name: "", active: true },
                      ])
                    }
                    onRemove={(index) => {
                      const row = languages[index];
                      if (row?.id) {
                        setLanguageDeletedIds((ids) => [...ids, row.id!]);
                      }
                      setLanguages((prev) =>
                        prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
                      );
                    }}
                    renderRow={(row, index) => (
                      <>
                        <input
                          className={fieldClassName()}
                          placeholder="code"
                          value={row.code}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setLanguages((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, code: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <input
                          className={fieldClassName()}
                          placeholder="name"
                          value={row.name}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setLanguages((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.active}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setLanguages((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, active: e.target.checked } : item,
                                ),
                              )
                            }
                          />
                          Active
                        </label>
                      </>
                    )}
                    columns="grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto]"
                  />
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className={labelClassName()}>{label}</label>
      <input
        className={fieldClassName()}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RowsEditor<T>({
  rows,
  canWrite,
  onAdd,
  onRemove,
  renderRow,
  columns = "grid-cols-1 md:grid-cols-[1fr_1fr_auto]",
}: {
  rows: T[];
  canWrite: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderRow: (row: T, index: number) => ReactNode;
  columns?: string;
}) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-sm text-primary"
        >
          <Plus className="h-4 w-4" />
          Add row
        </button>
      )}
      {rows.map((row, index) => (
        <div key={index} className={cn("grid gap-2", columns)}>
          {renderRow(row, index)}
          {canWrite && (
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground"
              onClick={() => onRemove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
