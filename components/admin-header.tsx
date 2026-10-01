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
  /** On small screens, show the description under the title and wrap actions beneath it. */
  stackOnSmall?: boolean;
};

export default function AdminPageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  backHref,
  className,
  stackOnSmall = false,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 -mt-8 mb-6 border-b border-border bg-background px-4 pl-14 pt-14 sm:-mx-6 sm:px-6 sm:pl-6 lg:-mx-8 lg:px-8 lg:pl-8 lg:pt-0",
        stackOnSmall
          ? "flex flex-col items-stretch gap-3 pb-3 lg:flex-row lg:items-center"
          : "flex h-16 items-center gap-3",
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
          <div
            className={cn(
              "min-w-0",
              stackOnSmall ? "flex flex-col lg:flex-row lg:items-baseline lg:gap-2" : "flex items-baseline gap-2",
            )}
          >
            <h1 className="truncate font-heading text-[15px] font-semibold tracking-normal text-text-primary">
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  "min-w-0 text-sm text-text-secondary",
                  stackOnSmall ? "mt-0.5 line-clamp-2 lg:mt-0 lg:truncate" : "hidden truncate md:block",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            stackOnSmall ? "w-full lg:w-auto lg:shrink-0 lg:justify-end" : "shrink-0 justify-end",
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
