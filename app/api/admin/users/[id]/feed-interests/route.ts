import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["news:read", "users:read"]);
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const client = auth.context.client;

  const [prefsRes, topicsRes, creatorsRes, feedbackRes] = await Promise.all([
    client.from("feed_preferences").select("*").eq("user_id", id).maybeSingle(),
    client
      .from("feed_topic_affinity")
      .select("topic, score, recent_score, updated_at")
      .eq("user_id", id)
      .order("score", { ascending: false })
      .limit(100),
    client
      .from("feed_creator_affinity")
      .select("creator_key, score, recent_score, updated_at")
      .eq("user_id", id)
      .order("score", { ascending: false })
      .limit(100),
    client
      .from("feed_feedback")
      .select("id, content_key, action, impression_id, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const firstError =
    prefsRes.error || topicsRes.error || creatorsRes.error || feedbackRes.error;
  if (firstError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${firstError.message}. ${hint}` : firstError.message },
      { status: 400 },
    );
  }

  const preferences = prefsRes.data
    ? {
        interests: asStringArray(prefsRes.data.interests),
        preferred_languages: asStringArray(prefsRes.data.preferred_languages),
        updated_at: prefsRes.data.updated_at ?? null,
      }
    : null;

  return NextResponse.json({
    preferences,
    topics: (topicsRes.data ?? []).map(
      (row: { topic: string; score?: number; recent_score?: number; updated_at?: string | null }) => ({
        topic: row.topic,
        score: Number(row.score) || 0,
        recent_score: Number(row.recent_score) || 0,
        updated_at: row.updated_at ?? null,
      }),
    ),
    creators: (creatorsRes.data ?? []).map(
      (row: {
        creator_key: string;
        score?: number;
        recent_score?: number;
        updated_at?: string | null;
      }) => ({
        creator_key: row.creator_key,
        score: Number(row.score) || 0,
        recent_score: Number(row.recent_score) || 0,
        updated_at: row.updated_at ?? null,
      }),
    ),
    feedback: feedbackRes.data ?? [],
  });
}
