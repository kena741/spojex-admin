"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

export function VisiblePassword({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-text-secondary">-</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${className ?? ""}`}>
      <span>{hidden ? "••••••••" : value}</span>
      <button
        type="button"
        onClick={() => setHidden((current) => !current)}
        className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
        aria-label={hidden ? "Show password" : "Hide password"}
      >
        {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
        aria-label="Copy password"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {copied ? <span className="text-xs text-emerald-700">Copied</span> : null}
    </span>
  );
}
