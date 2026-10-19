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
  stackOnSmall = true,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 -mt-5 mb-4 border-b border-border bg-background/95 px-4 pb-3 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:-mt-8 sm:mb-6 sm:px-6 sm:pl-6 sm:pt-4 lg:-mx-8 lg:flex lg:h-16 lg:items-center lg:gap-3 lg:px-8 lg:pb-0 lg:pt-0",
        "flex flex-col items-stretch gap-3 lg:flex-row",
        !stackOnSmall && "sm:flex-row sm:items-center",
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
          <div className="flex min-w-0 flex-col lg:flex-row lg:items-baseline lg:gap-2">
            <h1 className="truncate font-heading text-base font-semibold tracking-normal text-text-primary sm:text-[15px]">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 line-clamp-2 min-w-0 text-sm text-text-secondary lg:mt-0 lg:truncate">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end [&_button]:min-h-10 [&_a]:min-h-10">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
