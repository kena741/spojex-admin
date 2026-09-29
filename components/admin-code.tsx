"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function normalizeAdminCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function AdminCode({
  value,
  empty = "—",
}: {
  value?: string | null;
  empty?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = normalizeAdminCode(value ?? "");
  if (!code) return <span className="text-text-secondary">{empty}</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-md bg-muted px-2 py-1 font-mono text-sm font-semibold tracking-[0.18em] text-text-primary">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
        aria-label={`Copy code ${code}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {copied ? <span className="text-xs text-emerald-700">Copied</span> : null}
    </span>
  );
}
