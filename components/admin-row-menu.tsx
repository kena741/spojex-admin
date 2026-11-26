"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminRowMenuItem = {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger" | "success";
  disabled?: boolean;
  separatorBefore?: boolean;
};

type MenuPos = { top?: number; bottom?: number; left: number };

/**
 * Compact ⋯ menu for dense admin tables (Stripe / Linear / Notion pattern).
 * Prefer this over inline text links in Actions columns.
 */
export function AdminRowMenu({
  items,
  disabled,
  align = "right",
  "aria-label": ariaLabel = "Row actions",
}: {
  items: AdminRowMenuItem[];
  disabled?: boolean;
  align?: "left" | "right";
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePos = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < 200 && rect.top > spaceBelow;
    setPos(
      openUp
        ? { bottom: window.innerHeight - rect.top + gap, left: align === "right" ? rect.right - 168 : rect.left }
        : { top: rect.bottom + gap, left: align === "right" ? rect.right - 168 : rect.left },
    );
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (items.length === 0) {
    return <span className="text-text-secondary">-</span>;
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: Math.max(8, pos.left),
            }}
            className="z-[200] min-w-[10.5rem] rounded-lg border border-border bg-card py-1 shadow-xl"
          >
            {items.map((item) => (
              <li key={item.id} role="none">
                {item.separatorBefore ? (
                  <div className="my-1 border-t border-border" aria-hidden />
                ) : null}
                {item.href ? (
                  <Link
                    role="menuitem"
                    href={item.href}
                    className={menuItemClass(item.tone, item.disabled)}
                    onClick={() => {
                      setOpen(false);
                      item.onClick?.();
                    }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled || item.disabled}
                    className={menuItemClass(item.tone, item.disabled)}
                    onClick={() => {
                      setOpen(false);
                      item.onClick?.();
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-text-secondary",
          "hover:bg-muted hover:text-text-primary disabled:opacity-50",
          open && "bg-muted text-text-primary",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}

function menuItemClass(tone?: AdminRowMenuItem["tone"], itemDisabled?: boolean) {
  return cn(
    "block w-full px-3 py-2 text-left text-sm transition-colors",
    "hover:bg-muted disabled:opacity-50",
    tone === "danger" && "text-red-600 hover:bg-red-50",
    tone === "success" && "text-emerald-700 hover:bg-emerald-50",
    tone !== "danger" && tone !== "success" && "text-text-primary",
    itemDisabled && "pointer-events-none opacity-50",
  );
}

/** Backward-compatible Actions cell: ⋯ menu with Edit / Save / Delete. */
export function AdminTableActions({
  canWrite,
  editing,
  saving,
  deleting,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onView,
  viewHref,
  extraItems,
}: {
  canWrite: boolean;
  editing?: boolean;
  saving?: boolean;
  deleting?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onView?: () => void;
  viewHref?: string;
  extraItems?: AdminRowMenuItem[];
}) {
  if (editing) {
    return (
      <div className="flex flex-nowrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    );
  }

  const menuItems: AdminRowMenuItem[] = [];
  if (viewHref || onView) {
    menuItems.push({
      id: "view",
      label: "View",
      href: viewHref,
      onClick: onView,
    });
  }
  if (canWrite && onEdit) {
    menuItems.push({ id: "edit", label: "Edit", onClick: onEdit, disabled: deleting });
  }
  if (extraItems?.length) {
    extraItems.forEach((item, index) => {
      menuItems.push({
        ...item,
        separatorBefore: item.separatorBefore ?? (index === 0 && menuItems.length > 0),
      });
    });
  }
  if (canWrite && onDelete) {
    menuItems.push({
      id: "delete",
      label: deleting ? "Deleting…" : "Delete",
      onClick: onDelete,
      tone: "danger",
      disabled: deleting,
      separatorBefore: menuItems.length > 0,
    });
  }

  if (menuItems.length === 0) {
    return <span className="text-text-secondary">-</span>;
  }

  return <AdminRowMenu items={menuItems} disabled={saving || deleting} />;
}

export function AdminRowMenuLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
