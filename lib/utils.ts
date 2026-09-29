import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatStatusLabel(value: string | null | undefined) {
  if (!value) return "Unset";
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function locationLabel(city?: string | null, country?: string | null) {
  return [city, country].filter((part) => part && part.trim()).join(", ") || "—";
}

export function formatMoney(amount: number | null | undefined, currency = "ETB") {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return `${currency} 0`;
  return `${currency} ${value.toLocaleString("en-ET", { maximumFractionDigits: 2 })}`;
}

/** Format coin gift totals for admin tables. */
export function formatCoins(amount: number | null | undefined) {
  const value = Math.max(0, Math.floor(Number(amount ?? 0)));
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-ET");
}

export function initials(name?: string | null) {
  const source = (name ?? "").trim();
  if (!source) return "SJ";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
