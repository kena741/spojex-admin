"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn } from "@/lib/utils";

/** Compact account + theme controls in the main content top bar (logout lives in the sidebar). */
export default function AdminTopBar() {
  const { staff } = useAdminPermissions();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial = saved === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", initial === "dark");
    setTheme(initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("theme", next);
      return next;
    });
  };

  const name = staff?.full_name || staff?.email || "Admin";
  const role = staff?.role ? staff.role.replace(/_/g, " ") : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-end gap-2 px-4 sm:px-6 lg:px-8">
        {staff ? (
          <p className="mr-auto hidden min-w-0 truncate text-xs text-text-secondary sm:block lg:mr-0 lg:max-w-[14rem]">
            <span className="font-medium text-text-primary">{name}</span>
            {role ? <span className="text-text-hint"> · {role}</span> : null}
          </p>
        ) : (
          <span className="mr-auto lg:mr-0" />
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-text-secondary hover:bg-muted hover:text-foreground",
          )}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </header>
  );
}
