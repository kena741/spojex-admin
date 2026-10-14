"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSpojexClient } from "@/lib/spojex/client";
import { canAccessAdminRoute } from "@/lib/admin-permissions";
import { useAdminPermissions } from "@/lib/use-admin-permissions";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, staff, can } = useAdminPermissions();
  const redirected = useRef(false);

  useEffect(() => {
    if (loading) return;

    const reject = async (reason: "auth" | "forbidden") => {
      if (redirected.current) return;
      redirected.current = true;
      if (reason === "forbidden") await getSpojexClient().auth.signOut();
      router.replace(
        `/login?error=${reason}&next=` + encodeURIComponent(pathname || "/admin/dashboard"),
      );
    };

    if (!staff) {
      void reject("forbidden");
      return;
    }
    redirected.current = false;

    if (pathname !== "/admin/dashboard" && !canAccessAdminRoute(pathname || "/admin/dashboard", can)) {
      router.replace("/admin/dashboard");
    }
  }, [can, loading, pathname, router, staff]);

  if (loading || !staff) {
    return (
      <div className="ml-64 grid min-h-screen w-full place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
          Checking access…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
