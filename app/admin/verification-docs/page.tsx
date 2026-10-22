"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminPageHeader from "@/components/admin-header";
import { AdminLoadingRow } from "@/components/admin-layout";

/** Legacy route - requirements editor now lives in Verification Center. */
export default function VerificationDocsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/verifications?tab=requirements");
  }, [router]);

  return (
    <>
      <AdminPageHeader
        title="Document requirements"
        description="Redirecting to Verification Center…"
        backHref="/admin/verifications"
      />
      <AdminLoadingRow label="Opening requirements editor…" />
    </>
  );
}
