"use client";

import { useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import { AdminReloadButton } from "@/components/admin-layout";
import { RevenueOverviewPanel } from "@/components/awards/revenue";

export default function AwardsRevenuePage() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div>
      <AdminPageHeader
        title="Awards revenue"
        backHref="/admin/awards"
        breadcrumbs={[{ label: "Awards & Voting", href: "/admin/awards" }, { label: "Revenue" }]}
        actions={<AdminReloadButton onClick={() => setReloadKey((k) => k + 1)} refreshing={false} />}
      />
      <RevenueOverviewPanel reloadKey={reloadKey} />
    </div>
  );
}
