"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Breadcrumb = {
  label: string;
  href?: string;
};

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  backHref?: string;
  className?: string;
};

export default function AdminPageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  backHref,
  className,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 -mt-8 mb-6 flex h-16 items-center gap-3 border-b border-border bg-background px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex shrink-0 text-text-secondary transition-colors hover:text-text-primary"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <span>/</span> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="transition-colors hover:text-text-primary">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-text-primary">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate font-heading text-[15px] font-semibold tracking-normal text-text-primary">
              {title}
            </h1>
            {description ? (
              <p className="hidden min-w-0 truncate text-sm text-text-secondary md:block">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
