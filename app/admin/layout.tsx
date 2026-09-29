import type { ReactNode } from "react";
import AuthGuard from "@/components/auth-guard";
import { AdminShell } from "@/components/admin-layout";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
