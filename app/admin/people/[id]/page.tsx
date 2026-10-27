"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow } from "@/components/admin-layout";
import { PersonEngagementSection } from "@/components/people/person-engagement-section";
import { PersonIdentityForm } from "@/components/people/person-identity-form";
import { PersonIdentityRail } from "@/components/people/person-identity-rail";
import { PersonInlineField } from "@/components/people/person-inline-field";
import { PersonMarketplaceSection } from "@/components/people/person-marketplace-section";
import { PersonMediaSection } from "@/components/people/person-media-section";
import { PersonOrganizationsSection } from "@/components/people/person-organizations-section";
import { PersonProfileSection } from "@/components/people/person-profile-section";
import { PersonSection } from "@/components/people/person-section";
import { PersonSectionNav } from "@/components/people/person-section-nav";
import SendPushForm from "@/components/send-push-form";
import { UserDeleteModal, UserPasswordResetModal } from "@/components/user-account-modals";
import { roleLabel } from "@/lib/catalog";
import { useIdentityCatalog } from "@/lib/hooks";
import { hasPersonRoleProfile } from "@/lib/people/role-profiles";
import { usePersonDetail } from "@/lib/people/use-person-detail";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = usePersonDetail(id);
  const { can } = useAdminPermissions();
  const { catalog, roleOptions, roleLabel: catalogRoleLabel } = useIdentityCatalog();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const { user, loading, error, notice, saving, accountBusy } = detail;

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

  const canPush = can("notifications:write");
  const navItems = [
    { id: "about", label: "About" },
    { id: "identity", label: "Identity" },
    { id: "highlights", label: "Media" },
    ...(hasPersonRoleProfile(user) ? [{ id: "profile", label: "Profile" }] : []),
    { id: "marketplace", label: "Marketplace" },
    { id: "engagement", label: "Engagement" },
    { id: "organizations", label: "Organizations" },
    ...(canPush ? [{ id: "notifications", label: "Push" }] : []),
  ];

  const submitPassword = async (password: string) => {
    const message = await detail.resetPassword(password);
    if (message) {
      setModalError(message);
      return;
    }
    setPasswordOpen(false);
    setModalError(null);
  };

  const confirmDelete = async () => {
    const message = await detail.deletePerson();
    if (message) setModalError(message);
  };

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
            onClick={() => void detail.save({ verified: !user.verified })}
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
            onClick={detail.dismissNotice}
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
        <PersonIdentityRail
          user={user}
          roleName={catalog ? catalogRoleLabel(user.role) : roleLabel(user.role)}
          verificationId={detail.verificationId}
          verificationStatus={detail.verificationStatus}
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
          <PersonSectionNav items={navItems} />

          <PersonSection
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
              <PersonInlineField
                label="Headline"
                value={user.headline}
                placeholder="Short one-line introduction"
                onSave={(value) => detail.save({ headline: value }, { silent: true })}
              />
              <PersonInlineField
                label="Bio"
                value={user.bio}
                placeholder="Longer introduction shown on the profile"
                multiline
                rows={5}
                onSave={(value) => detail.save({ bio: value }, { silent: true })}
              />
            </div>
          </PersonSection>

          <PersonIdentityForm
            user={user}
            roleOptions={roleOptions}
            catalogReady={Boolean(catalog)}
            onSave={detail.save}
            saving={saving}
          />

          <PersonMediaSection items={detail.mediaItems} />

          {hasPersonRoleProfile(user) ? <PersonProfileSection user={user} /> : null}

          <PersonMarketplaceSection
            userId={user.id}
            services={detail.services}
            bookings={detail.bookings}
            wallet={detail.wallet}
            withdrawals={detail.withdrawals}
            coinWallet={detail.coinWallet}
            busyService={detail.busyService}
            onToggleService={(row, published) => void detail.toggleService(row, published)}
            onDeleteService={(row) => void detail.deleteService(row)}
            onApproveAll={() => void detail.approveAllServices()}
          />

          <PersonEngagementSection feedInterest={detail.feedInterest} />

          <PersonOrganizationsSection orgs={detail.orgs} />

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
