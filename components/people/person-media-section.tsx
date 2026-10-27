import Link from "next/link";
import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { PersonEmptyState, PersonSection } from "@/components/people/person-section";
import { HighlightsGallery } from "@/components/profile-details";
import type { ProfileMediaRow } from "@/lib/types";

export interface Props {
  items: ProfileMediaRow[];
}

export function PersonMediaSection({ items }: Props) {
  return (
    <PersonSection
      id="highlights"
      title="Media"
      description="Photos and highlight clips from the app."
      count={items.length}
      action={
        <Link
          href="/admin/profile-media"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage media
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      }
    >
      {items.length === 0 ? (
        <PersonEmptyState
          icon={ImageIcon}
          title="No photos or highlight clips yet."
          hint="Media appears here once this person uploads from the app."
        />
      ) : (
        <HighlightsGallery items={items} />
      )}
    </PersonSection>
  );
}
