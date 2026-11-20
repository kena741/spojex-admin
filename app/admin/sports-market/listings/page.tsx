"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminModal,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
  AdminTableShell,
} from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { ReasonModal, SmTabs, buttonClass, smGet, smPost } from "@/components/sports-market/shared";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { etb, labelize, moderationTone, shortDate, type SmCategory, type SmProduct } from "@/lib/sports-market";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { useAdminQuery } from "@/lib/use-admin-query";

type ModerationAction = "approve" | "reject" | "remove" | "restore";

const ACTION_LABEL: Record<ModerationAction, string> = {
  approve: "Approve",
  reject: "Ask for changes",
  remove: "Remove",
  restore: "Restore",
};

function actionsFor(p: SmProduct): ModerationAction[] {
  switch (p.moderation_status) {
    case "pending":
      return ["approve", "reject", "remove"];
    case "rejected":
      return ["approve", "remove"];
    case "removed":
      return ["restore"];
    default:
      return ["reject", "remove"];
  }
}

export default function SportsMarketListingsPage() {
  const { can } = useAdminPermissions();
  const canWrite = can("sports_market:write");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [moderation, setModeration] = useState("");
  const [category, setCategory] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: categories } = useAdminQuery<SmCategory[]>({
    key: adminCacheKey(["sports-market", "categories"]),
    fetcher: async () => (await smGet<{ categories: SmCategory[] }>("/categories")).categories,
  });
  const params = new URLSearchParams({ limit: "200" });
  if (debounced) params.set("q", debounced);
  if (moderation) params.set("moderation_status", moderation);
  if (category) params.set("category_id", category);
  if (deleted) params.set("include_deleted", "true");
  if (featuredOnly) params.set("featured", "true");
  const { data, loading, refreshing, error, refresh } = useAdminQuery<SmProduct[]>({
    key: adminCacheKey(["sports-market", "products", debounced, moderation, category, String(deleted), String(featuredOnly)]),
    fetcher: async () => (await smGet<{ products: SmProduct[] }>(`/products?${params}`)).products,
  });
  const products = data ?? [];
  const [viewing, setViewing] = useState<SmProduct | null>(null);
  const [acting, setActing] = useState<{ product: SmProduct; action: ModerationAction } | null>(null);

  const moderate = async (product: SmProduct, action: ModerationAction, note: string) => {
    await smPost(`/products/${product.id}/moderate`, { action, note });
    setViewing(null);
    refresh();
  };

  const setFeatured = async (product: SmProduct, featured: boolean, rank?: number) => {
    setFeatureError(null);
    try {
      await smPost(`/products/${product.id}/featured`, { featured, ...(rank ? { rank } : {}) });
      refresh();
    } catch (e) {
      setFeatureError(e instanceof Error ? e.message : "Could not update featured listing");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Sports Marketplace"
        description="Review listings. Removed or rejected products disappear from the app immediately."
        actions={<AdminReloadButton onClick={refresh} refreshing={refreshing} />}
      />
      <SmTabs />
      <AdminFilterPanel>
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1">
            <AdminSearchInput value={q} onChange={setQ} placeholder="Search by product, brand or seller" />
          </div>
          <AdminSelect value={moderation} onChange={setModeration}>
            <option value="">Any review status</option>
            <option value="pending">Waiting for review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Changes requested</option>
            <option value="removed">Removed</option>
          </AdminSelect>
          <AdminSelect value={category} onChange={setCategory}>
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminSelect>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} />
            Include deleted
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={featuredOnly} onChange={(e) => setFeaturedOnly(e.target.checked)} />
            Featured only
          </label>
        </div>
      </AdminFilterPanel>
      {error ? <AdminErrorAlert message={error} /> : null}
      {featureError ? <AdminErrorAlert message={featureError} /> : null}
      <AdminTableShell>
        {loading && !data ? <AdminLoadingRow label="Loading listings…" /> : null}
        {!loading && products.length === 0 && !error ? (
          <AdminEmpty title="No listings" description="Listings from authorized sellers appear here." />
        ) : null}
        {products.length ? (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Featured</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" className="flex items-center gap-3 text-left" onClick={() => setViewing(p)}>
                      <Thumb url={p.images[0]} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text-primary hover:underline">{p.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {labelize(p.condition)} · {shortDate(p.created_at)}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{p.seller.name}</p>
                    {!p.seller.active ? <p className="text-xs text-danger">Seller access revoked</p> : null}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.category.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{etb(p.price, p.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.quantity}
                    <span className="text-text-hint"> · {p.sold_count} sold</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge tone={moderationTone(p.moderation_status)}>{labelize(p.moderation_status)}</StatusBadge>
                      <StatusBadge tone={p.available ? "success" : "neutral"}>{labelize(p.availability)}</StatusBadge>
                      {p.deleted ? <StatusBadge tone="danger">Deleted</StatusBadge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <FeaturedCell product={p} canWrite={canWrite} onChange={(on, rank) => setFeatured(p, on, rank)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && !p.deleted ? (
                      <div className="flex justify-end gap-2">
                        {actionsFor(p).map((a) => (
                          <button
                            key={a}
                            type="button"
                            className={a === "remove" ? `${buttonClass} text-danger` : buttonClass}
                            onClick={() => setActing({ product: p, action: a })}
                          >
                            {ACTION_LABEL[a]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminTableShell>

      <AdminModal open={!!viewing} title={viewing?.name ?? "Listing"} onClose={() => setViewing(null)} className="max-w-2xl">
        {viewing ? <ProductDetail product={viewing} /> : null}
      </AdminModal>

      <ReasonModal
        open={!!acting}
        title={acting ? `${ACTION_LABEL[acting.action]}: ${acting.product.name}` : ""}
        label={acting?.action === "approve" || acting?.action === "restore" ? "Note (optional)" : "Reason shown to the seller"}
        required={acting?.action === "reject" || acting?.action === "remove"}
        saveLabel={acting ? ACTION_LABEL[acting.action] : "Confirm"}
        onClose={() => setActing(null)}
        onSubmit={async (note) => {
          if (acting) await moderate(acting.product, acting.action, note);
        }}
      />
    </div>
  );
}

/** Can this listing show in the app's Featured row? Mirrors the backend rule. */
function featureEligible(p: SmProduct) {
  return !p.deleted && p.moderation_status === "approved" && p.is_active !== false && p.seller.active;
}

function FeaturedCell({
  product: p,
  canWrite,
  onChange,
}: {
  product: SmProduct;
  canWrite: boolean;
  onChange: (featured: boolean, rank?: number) => Promise<void>;
}) {
  const [rank, setRank] = useState(String(p.featured_rank ?? ""));
  const [busy, setBusy] = useState(false);
  useEffect(() => setRank(String(p.featured_rank ?? "")), [p.featured_rank]);
  const run = async (featured: boolean, next?: number) => {
    setBusy(true);
    try {
      await onChange(featured, next);
    } finally {
      setBusy(false);
    }
  };
  if (!p.featured) {
    if (!canWrite) return <span className="text-text-hint">—</span>;
    const ok = featureEligible(p);
    return (
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !ok}
        title={ok ? "Show in the app's Featured row" : "Only approved, active listings from active sellers"}
        onClick={() => run(true)}
      >
        ★ Feature
      </button>
    );
  }
  const live = featureEligible(p) && p.available;
  return (
    <div className="flex items-center gap-2">
      <StatusBadge tone={live ? "success" : "warning"}>{live ? "Featured" : "Featured · hidden"}</StatusBadge>
      {canWrite ? (
        <>
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            Order
            <input
              type="number"
              min={1}
              max={999}
              value={rank}
              disabled={busy}
              onChange={(e) => setRank(e.target.value)}
              onBlur={() => {
                const n = Number(rank);
                if (Number.isInteger(n) && n >= 1 && n <= 999 && n !== p.featured_rank) void run(true, n);
                else setRank(String(p.featured_rank ?? ""));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-8 w-14 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
            />
          </label>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => run(false)}>
            Unfeature
          </button>
        </>
      ) : (
        <span className="text-xs text-text-secondary">#{p.featured_rank}</span>
      )}
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" />
  );
}

function ProductDetail({ product: p }: { product: SmProduct }) {
  return (
    <div className="space-y-4 text-sm">
      {p.images.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {p.images.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="h-28 w-28 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-text-primary">{p.description}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Item label="Price" value={etb(p.price, p.currency)} />
        <Item label="Delivery fee" value={etb(p.delivery_fee, p.currency)} />
        <Item label="Stock" value={String(p.quantity)} />
        <Item label="Condition" value={labelize(p.condition)} />
        <Item label="Brand" value={p.brand || "—"} />
        <Item label="Location" value={[p.location.text, p.location.city].filter(Boolean).join(", ") || "—"} />
        <Item label="Sizes" value={p.sizes.join(", ") || "—"} />
        <Item label="Colors" value={p.colors.join(", ") || "—"} />
      </dl>
      {p.specifications.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
          {p.specifications.map((s) => (
            <Item key={s.label} label={s.label} value={s.value} />
          ))}
        </dl>
      ) : null}
      {p.moderation_note ? <p className="text-text-secondary">Review note: {p.moderation_note}</p> : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
