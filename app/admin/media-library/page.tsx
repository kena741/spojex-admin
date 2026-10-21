"use client";

import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";

/** Media Library hub — Sounds is the first library surface; no second storage system. */
export default function MediaLibraryPage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Media Library"
        description="Shared media assets for Sport News and other surfaces. Sounds is the initial library."
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: "Media Library" },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/admin/sound-library"
          className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="font-heading text-base font-semibold">Sounds</p>
          <p className="mt-2 text-sm text-text-secondary">
            Upload, extract, trim, and catalog audio for news posts. Duplicate names are allowed —
            assets are distinct by ID and URL.
          </p>
          <p className="mt-3 text-xs font-medium text-primary">Open sound library →</p>
        </Link>
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
          <p className="font-heading text-base font-semibold text-text-secondary">More libraries</p>
          <p className="mt-2 text-sm text-text-hint">
            Video/image asset browsers can extend this hub later. Sport News media stays on each
            article — we are not building a parallel storage system.
          </p>
        </div>
      </div>
    </div>
  );
}
