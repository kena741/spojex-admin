import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import {
  PersonChips,
  PersonEmptyState,
  PersonMeterRow,
  PersonSection,
  PersonSubHeading,
} from "@/components/people/person-section";
import type { FeedInterestDetail } from "@/lib/people/types";
import { formatDateTime, formatStatusLabel } from "@/lib/utils";

export interface Props {
  feedInterest: FeedInterestDetail | null;
}

/** What the For You feed has learned: preferences, topic and creator scores. */
export function PersonEngagementSection({ feedInterest }: Props) {
  const isEmpty =
    !feedInterest ||
    (!feedInterest.preferences &&
      feedInterest.topics.length === 0 &&
      feedInterest.creators.length === 0 &&
      feedInterest.feedback.length === 0);

  return (
    <PersonSection
      id="engagement"
      title="Engagement"
      description="What the For You feed has learned about this person."
      action={
        <Link
          href="/admin/feed-interests"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          All feed interests
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      }
    >
      {isEmpty ? (
        <PersonEmptyState
          icon={Sparkles}
          title="No feed preferences or affinities collected yet."
          hint="Scores build up as this person likes, saves and skips content."
        />
      ) : (
        <div className="@container">
          <div className="grid gap-5 @lg:grid-cols-2">
            <div>
              <PersonSubHeading>Saved preferences</PersonSubHeading>
              {feedInterest?.preferences ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-text-hint">
                      Interests
                    </p>
                    <PersonChips
                      items={feedInterest.preferences.interests}
                      empty="None selected."
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-text-hint">
                      Languages
                    </p>
                    <PersonChips
                      items={feedInterest.preferences.preferred_languages}
                      empty="None selected."
                    />
                  </div>
                  <p className="text-[11px] text-text-hint">
                    Updated {formatDateTime(feedInterest.preferences.updated_at)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-text-secondary">No explicit preferences saved.</p>
              )}
            </div>

            <div>
              <PersonSubHeading>Topic affinity ({feedInterest?.topics.length ?? 0})</PersonSubHeading>
              {!feedInterest?.topics.length ? (
                <p className="text-xs text-text-secondary">No topic scores yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {feedInterest.topics.slice(0, 8).map((item) => (
                    <PersonMeterRow
                      key={item.topic}
                      label={item.topic}
                      value={item.score}
                      recent={item.recent_score}
                      max={feedInterest.topics[0].score}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div>
              <PersonSubHeading>
                Creator affinity ({feedInterest?.creators.length ?? 0})
              </PersonSubHeading>
              {!feedInterest?.creators.length ? (
                <p className="text-xs text-text-secondary">No creator scores yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {feedInterest.creators.slice(0, 8).map((item) => (
                    <PersonMeterRow
                      key={item.creator_key}
                      label={item.creator_key}
                      value={item.score}
                      recent={item.recent_score}
                      max={feedInterest.creators[0].score}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div>
              <PersonSubHeading>
                Feedback ({feedInterest?.feedback.length ?? 0})
              </PersonSubHeading>
              {!feedInterest?.feedback.length ? (
                <p className="text-xs text-text-secondary">No not-interested or hide feedback.</p>
              ) : (
                <ul className="space-y-2">
                  {feedInterest.feedback.slice(0, 6).map((item) => (
                    <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{formatStatusLabel(item.action)}</p>
                        <p className="text-[11px] text-text-hint">
                          {formatDateTime(item.created_at)}
                        </p>
                      </div>
                      <p className="truncate text-[11px] text-text-secondary">{item.content_key}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </PersonSection>
  );
}
