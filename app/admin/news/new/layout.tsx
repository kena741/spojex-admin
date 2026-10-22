import type { ReactNode } from "react";
import { Suspense } from "react";
import { AdminLoadingRow } from "@/components/admin-layout";

export default function NewsComposerLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AdminLoadingRow label="Opening composer…" />}>{children}</Suspense>;
}
