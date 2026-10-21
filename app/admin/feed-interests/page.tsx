"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminSearchInput,
  AdminTableShell,
} from "@/components/admin-layout";
import { formatDateTime } from "@/lib/utils";

type AffinityTopic = { topic: string; score: number; recent_score: number };
type AffinityCreator = { creator_key: string; score: number; recent_score: number };

type FeedInterestRow = {
  user_id: string;
  user: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
  interests: string[];
  preferred_languages: string[];
  top_topics: AffinityTopic[];
  top_creators: AffinityCreator[];
  topic_count: number;
  creator_count: number;
  feedback_count: number;
  not_interested_count: number;
  updated_at: string | null;
  has_preferences: boolean;
};

type Summary = {
  users_with_signals: number;
  users_with_preferences: number;
  topic_affinity_rows: number;
  creator_affinity_rows: number;
  feedback_rows: number;
};

function ChipList({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-text-hint">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function scoreLabel(score: number) {
  return score.toFixed(1);
}

export default function FeedInterestsPage() {
  const [rows, setRows] = useState<FeedInterestRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/feed-interests", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: FeedInterestRow[];
          summary?: Summary;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load feed interests");
        setRows(payload.data ?? []);
        setSummary(payload.summary ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const name = row.user?.display_name || "";
      const username = row.user?.username || "";
      const haystack = [
        name,
        username,
        row.user_id,
        ...row.interests,
        ...row.preferred_languages,
        ...row.top_topics.map((item) => item.topic),
        ...row.top_creators.map((item) => item.creator_key),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, rows]);

  return (
    <>
      <AdminPageHeader
        title="Feed interests"
        description="Explicit preferences and learned topic/creator affinities from the For You feed"
      />
      {loading ? <AdminLoadingRow label="Loading feed interests…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Users with signals", value: summary.users_with_signals },
            { label: "Saved preferences", value: summary.users_with_preferences },
            { label: "Topic affinities", value: summary.topic_affinity_rows },
            { label: "Creator affinities", value: summary.creator_affinity_rows },
            { label: "Feedback events", value: summary.feedback_rows },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-xs text-text-secondary">{item.label}</p>
              <p className="mt-1 font-heading text-xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <AdminFilterPanel>
        <AdminSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by user, interest, topic, or creator"
        />
      </AdminFilterPanel>

      <AdminTableShell>
        {filtered.length === 0 && !loading ? (
          <AdminEmpty
            title="No feed interest data"
            description="Preferences and affinities appear after users watch Sport news and interact with the For You feed."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Interests</th>
                  <th className="px-4 py-3 font-medium">Languages</th>
                  <th className="px-4 py-3 font-medium">Top topics</th>
                  <th className="px-4 py-3 font-medium">Top creators</th>
                  <th className="px-4 py-3 font-medium">Feedback</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => {
                  const label =
                    row.user?.display_name ||
                    (row.user?.username ? `@${row.user.username}` : null) ||
                    row.user_id.slice(0, 8);
                  return (
                    <tr key={row.user_id} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${row.user_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {label}
                        </Link>
                        {row.user?.username ? (
                          <p className="text-xs text-text-secondary">@{row.user.username}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <ChipList items={row.interests} empty={row.has_preferences ? "None set" : "—"} />
                      </td>
                      <td className="px-4 py-3">
                        <ChipList items={row.preferred_languages} />
                      </td>
                      <td className="px-4 py-3">
                        {row.top_topics.length === 0 ? (
                          <span className="text-text-hint">—</span>
                        ) : (
                          <div className="space-y-1">
                            {row.top_topics.map((item) => (
                              <div key={item.topic} className="text-xs">
                                <span className="font-medium">{item.topic}</span>{" "}
                                <span className="text-text-secondary">{scoreLabel(item.score)}</span>
                              </div>
                            ))}
                            {row.topic_count > row.top_topics.length ? (
                              <p className="text-xs text-text-hint">{row.topic_count} total</p>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.top_creators.length === 0 ? (
                          <span className="text-text-hint">—</span>
                        ) : (
                          <div className="space-y-1">
                            {row.top_creators.map((item) => (
                              <div key={item.creator_key} className="text-xs">
                                <span className="font-medium">{item.creator_key}</span>{" "}
                                <span className="text-text-secondary">{scoreLabel(item.score)}</span>
                              </div>
                            ))}
                            {row.creator_count > row.top_creators.length ? (
                              <p className="text-xs text-text-hint">{row.creator_count} total</p>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {row.feedback_count === 0
                          ? "—"
                          : `${row.not_interested_count} not interested · ${row.feedback_count} total`}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {row.updated_at ? formatDateTime(row.updated_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminTableShell>
    </>
  );
}
