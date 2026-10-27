"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface PersonNavItem {
  id: string;
  label: string;
}

export interface Props {
  items: PersonNavItem[];
}

/** Jump links that highlight the section currently in view. */
export function PersonSectionNav({ items }: Props) {
  const active = useActiveSection(items.map((item) => item.id));

  return (
    <nav aria-label="Profile sections">
      <ul className="flex flex-wrap gap-1 pb-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active === item.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-text-secondary hover:text-text-primary",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Tracks which section is inside the band just under the sticky header. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    const elements = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);

  return active;
}
