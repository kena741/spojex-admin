import type { ReactNode } from "react";
import {
  AchievementsSection,
  CareerHistorySection,
  DetailField,
  DetailGroup,
} from "@/components/profile-details";
import { PersonDisclosure, PersonSection } from "@/components/people/person-section";
import {
  catalogHasRoleContent,
  fieldDisplay,
  type CatalogProfileDocument,
  type CatalogProfileField,
} from "@/lib/people/catalog-profile";

export interface Props {
  catalogProfile: CatalogProfileDocument | null;
}

/** Role-specific details from the profile catalog (not legacy *_profiles tables). */
export function PersonProfileSection({ catalogProfile }: Props) {
  if (!catalogHasRoleContent(catalogProfile) || !catalogProfile) return null;

  const title = catalogProfile.profile_title || "Profile";
  const categoryLabel = catalogProfile.category?.label;
  const tabs = catalogProfile.tabs ?? [];
  const careerDoc = {
    version: 1,
    entries: (catalogProfile.career ?? []).map((e) => ({
      id: e.id,
      entry_type: e.entry_type,
      organization: {
        name: e.organization_name,
        short_name: e.organization_short_name,
      },
      role: {
        title: e.role_title,
        league_or_competition: e.league_or_competition,
      },
      location: { city: e.city, country: e.country },
      period: {
        start_date: e.start_date,
        end_date: e.end_date,
        is_current: e.is_current,
      },
      honours: e.honours,
      summary: e.summary,
      sort_order: e.sort_order,
    })),
  };
  const achievementsDoc = {
    version: 1,
    entries: (catalogProfile.achievements ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      organization: a.organization,
      year: a.year,
      category: a.category,
      summary: a.summary,
    })),
  };

  return (
    <PersonSection
      id="profile"
      title="Profile"
    >
      <div className="space-y-6">
        <ProfileBody title={title}>
          {categoryLabel ? (
            <p className="text-xs text-text-secondary">Category: {categoryLabel}</p>
          ) : null}

          {tabs.map((tab) => {
            const fields = (tab.fields ?? []).filter((f) => hasValue(f));
            if (!fields.length && !(tab.groups?.length ?? 0)) return null;
            return (
              <DetailGroup key={tab.key || tab.label} title={tab.label || tab.key || "Details"}>
                {fields.map((field) => (
                  <DetailField
                    key={field.id || field.key}
                    label={field.label || field.key || "Field"}
                    value={fieldDisplay(field)}
                  />
                ))}
              </DetailGroup>
            );
          })}

          {(catalogProfile.performance?.length ?? 0) > 0 ? (
            <DetailGroup title="Performance">
              {catalogProfile.performance!.map((m) => (
                <DetailField
                  key={m.key || m.label}
                  label={m.label || m.key || "Metric"}
                  value={m.display_value || (m.value != null ? String(m.value) : "-")}
                />
              ))}
            </DetailGroup>
          ) : null}

          <PersonDisclosure title="Career history">
            <CareerHistorySection value={careerDoc} />
          </PersonDisclosure>
          <PersonDisclosure title="Achievements">
            <AchievementsSection value={achievementsDoc} />
          </PersonDisclosure>
        </ProfileBody>
      </div>
    </PersonSection>
  );
}

function hasValue(field: CatalogProfileField): boolean {
  if (field.display_value != null && String(field.display_value).trim()) return true;
  const v = field.value;
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

interface ProfileBodyProps {
  title: string;
  children: ReactNode;
}

function ProfileBody({ title, children }: ProfileBodyProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-heading text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  );
}
