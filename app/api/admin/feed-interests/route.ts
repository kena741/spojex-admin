import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAnyAdminPermission } from "@/lib/admin-auth";

type PrefRow = {
  user_id: string;
  interests: string[] | null;
  preferred_languages: string[] | null;
  updated_at: string | null;
};

type AffinityTopic = {
  user_id: string;
  topic: string;
  score: number;
  recent_score: number;
  updated_at: string | null;
};

type AffinityCreator = {
  user_id: string;
  creator_key: string;
  score: number;
  recent_score: number;
  updated_at: string | null;
};

type FeedbackRow = {
  user_id: string;
  action: string;
};

type UserLite = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function topByScore<T extends { score: number }>(rows: T[], limit = 5): T[] {
  return [...rows].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, limit);
}

export async function GET() {
  const auth = await requireAnyAdminPermission(["news:read", "users:read"]);
  if (!auth.ok) return auth.error;

  const client = auth.context.client;

  const [prefsRes, topicsRes, creatorsRes, feedbackRes] = await Promise.all([
    client.from("feed_preferences").select("*").order("updated_at", { ascending: false }).limit(500),
    client
      .from("feed_topic_affinity")
      .select("user_id, topic, score, recent_score, updated_at")
      .order("score", { ascending: false })
      .limit(2000),
    client
      .from("feed_creator_affinity")
      .select("user_id, creator_key, score, recent_score, updated_at")
      .order("score", { ascending: false })
      .limit(2000),
    client.from("feed_feedback").select("user_id, action").limit(5000),
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

  const prefs = (prefsRes.data ?? []) as PrefRow[];
  const topics = (topicsRes.data ?? []) as AffinityTopic[];
  const creators = (creatorsRes.data ?? []) as AffinityCreator[];
  const feedback = (feedbackRes.data ?? []) as FeedbackRow[];

  const userIds = Array.from(
    new Set([
      ...prefs.map((row) => row.user_id),
      ...topics.map((row) => row.user_id),
      ...creators.map((row) => row.user_id),
      ...feedback.map((row) => row.user_id),
    ]),
  );

  const usersById = new Map<string, UserLite>();
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await client
      .from("users")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);
    if (usersError) {
      const hint = missingServiceRoleMessage();
      return NextResponse.json(
        { error: hint ? `${usersError.message}. ${hint}` : usersError.message },
        { status: 400 },
      );
    }
    for (const user of (users ?? []) as UserLite[]) {
      usersById.set(user.id, user);
    }
  }

  const topicsByUser = new Map<string, AffinityTopic[]>();
  for (const row of topics) {
    const list = topicsByUser.get(row.user_id) ?? [];
    list.push(row);
    topicsByUser.set(row.user_id, list);
  }

  const creatorsByUser = new Map<string, AffinityCreator[]>();
  for (const row of creators) {
    const list = creatorsByUser.get(row.user_id) ?? [];
    list.push(row);
    creatorsByUser.set(row.user_id, list);
  }

  const feedbackByUser = new Map<string, { not_interested: number; total: number }>();
  for (const row of feedback) {
    const current = feedbackByUser.get(row.user_id) ?? { not_interested: 0, total: 0 };
    current.total += 1;
    if (row.action === "not_interested") current.not_interested += 1;
    feedbackByUser.set(row.user_id, current);
  }

  const prefsByUser = new Map(prefs.map((row) => [row.user_id, row]));

  const rows = userIds
    .map((userId) => {
      const pref = prefsByUser.get(userId);
      const userTopics = topicsByUser.get(userId) ?? [];
      const userCreators = creatorsByUser.get(userId) ?? [];
      const feedbackCounts = feedbackByUser.get(userId) ?? { not_interested: 0, total: 0 };
      const user = usersById.get(userId) ?? null;
      const updatedCandidates = [
        pref?.updated_at,
        ...userTopics.map((item) => item.updated_at),
        ...userCreators.map((item) => item.updated_at),
      ].filter((value): value is string => Boolean(value));
      const updatedAt =
        updatedCandidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

      return {
        user_id: userId,
        user,
        interests: asStringArray(pref?.interests),
        preferred_languages: asStringArray(pref?.preferred_languages),
        top_topics: topByScore(userTopics).map((item) => ({
          topic: item.topic,
          score: Number(item.score) || 0,
          recent_score: Number(item.recent_score) || 0,
        })),
        top_creators: topByScore(userCreators).map((item) => ({
          creator_key: item.creator_key,
          score: Number(item.score) || 0,
          recent_score: Number(item.recent_score) || 0,
        })),
        topic_count: userTopics.length,
        creator_count: userCreators.length,
        feedback_count: feedbackCounts.total,
        not_interested_count: feedbackCounts.not_interested,
        updated_at: updatedAt,
        has_preferences: Boolean(pref),
      };
    })
    .sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    });

  return NextResponse.json({
    data: rows,
    summary: {
      users_with_signals: rows.length,
      users_with_preferences: prefs.length,
      topic_affinity_rows: topics.length,
      creator_affinity_rows: creators.length,
      feedback_rows: feedback.length,
    },
  });
}
