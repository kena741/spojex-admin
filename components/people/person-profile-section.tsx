import type { ReactNode } from "react";
import {
  AchievementsSection,
  CareerHistorySection,
  DetailField,
  DetailGroup,
  formatDob,
} from "@/components/profile-details";
import { PersonDisclosure, PersonSection } from "@/components/people/person-section";
import { professionalProfileCopy } from "@/lib/identity-catalog";
import { personRoleProfiles } from "@/lib/people/role-profiles";
import type { UserRow } from "@/lib/types";

export interface Props {
  user: UserRow;
}

/** Athlete / professional / media details captured during onboarding. */
export function PersonProfileSection({ user }: Props) {
  const { athlete, professional, media } = personRoleProfiles(user);
  const copy = professionalProfileCopy(user.role);

  return (
    <PersonSection
      id="profile"
      title="Profile"
      description="Role-specific details captured during onboarding."
    >
      <div className="space-y-6">
        {athlete ? (
          <ProfileBody title="Athlete profile">
            <DetailGroup title="Playing">
              <DetailField label="Position" value={athlete.position} />
              <DetailField label="Secondary position" value={athlete.secondary_position || "-"} />
              <DetailField label="Preferred foot" value={athlete.preferred_foot} />
              <DetailField label="Team" value={athlete.team} />
              <DetailField label="Playing level" value={athlete.playing_level || "-"} />
              <DetailField label="Jersey" value={athlete.jersey_number?.toString() ?? "-"} />
            </DetailGroup>
            <DetailGroup title="Physical">
              <DetailField label="Nationality" value={athlete.nationality || "-"} />
              <DetailField label="Date of birth" value={formatDob(athlete.date_of_birth)} />
              <DetailField
                label="Height"
                value={athlete.height_cm ? `${athlete.height_cm} cm` : "-"}
              />
              <DetailField
                label="Weight"
                value={athlete.weight_kg ? `${athlete.weight_kg} kg` : "-"}
              />
              <DetailField
                label="Experience"
                value={athlete.years_experience?.toString() ?? "-"}
              />
            </DetailGroup>
            <DetailGroup title="Season">
              <DetailField label="Matches" value={String(athlete.matches_played)} />
              <DetailField label="Goals" value={String(athlete.goals)} />
              <DetailField label="Assists" value={String(athlete.assists)} />
              <DetailField
                label="Man of the match"
                value={String(athlete.man_of_the_match ?? 0)}
              />
            </DetailGroup>
            <DetailGroup title="Opportunities">
              <DetailField
                label="Looking for opportunities"
                value={athlete.looking_for_opportunities ? "Yes" : "No"}
              />
              <DetailField
                label="Opportunity interests"
                value={athlete.opportunity_interests?.join(", ") || "-"}
              />
            </DetailGroup>
            <PersonDisclosure title="Career history">
              <CareerHistorySection value={athlete.career_history} />
            </PersonDisclosure>
            <PersonDisclosure title="Achievements">
              <AchievementsSection value={athlete.achievements} />
            </PersonDisclosure>
          </ProfileBody>
        ) : null}

        {professional ? (
          <ProfileBody title={copy.title}>
            <DetailGroup title="Credentials">
              <DetailField label={copy.organization} value={professional.organization} />
              <DetailField label={copy.license} value={professional.license} />
              <DetailField label="Certified" value={professional.certified ? "Yes" : "No"} />
              <DetailField
                label="Experience"
                value={professional.years_experience?.toString() ?? "-"}
              />
            </DetailGroup>
            <DetailGroup title="Focus">
              <DetailField
                label="Specializations"
                value={professional.specializations?.join(", ") || "-"}
              />
              <DetailField label="Regions" value={professional.regions?.join(", ") || "-"} />
              <DetailField label="Age groups" value={professional.age_groups?.join(", ") || "-"} />
              <DetailField label="Notes" value={professional.notes || "-"} />
            </DetailGroup>
            <PersonDisclosure title="Career history">
              <CareerHistorySection value={professional.career_history} />
            </PersonDisclosure>
            <PersonDisclosure title="Achievements">
              <AchievementsSection value={professional.achievements} />
            </PersonDisclosure>
          </ProfileBody>
        ) : null}

        {media ? (
          <ProfileBody title="Media profile">
            <DetailGroup>
              <DetailField label="Outlet" value={media.outlet} />
              <DetailField label="Specialty" value={media.specialty} />
              <DetailField label="Portfolio" value={media.portfolio_url || "-"} />
              <DetailField label="Experience" value={media.years_experience?.toString() ?? "-"} />
              <DetailField label="Regions" value={media.regions?.join(", ") || "-"} />
            </DetailGroup>
            <PersonDisclosure title="Career history">
              <CareerHistorySection value={media.career_history} />
            </PersonDisclosure>
            <PersonDisclosure title="Achievements">
              <AchievementsSection value={media.achievements} />
            </PersonDisclosure>
          </ProfileBody>
        ) : null}
      </div>
    </PersonSection>
  );
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
