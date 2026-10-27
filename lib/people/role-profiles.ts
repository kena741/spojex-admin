import {
  nestedRecord,
  type AthleteProfile,
  type MediaProfile,
  type ProfessionalProfile,
  type UserRow,
} from "@/lib/types";

export type PersonRoleProfiles = {
  athlete: AthleteProfile | null;
  professional: ProfessionalProfile | null;
  media: MediaProfile | null;
};

/** Role profiles are fetched separately and merged onto the user row. */
export function personRoleProfiles(user: UserRow): PersonRoleProfiles {
  return {
    athlete: nestedRecord<AthleteProfile>(user.athlete_profiles),
    professional: nestedRecord<ProfessionalProfile>(user.professional_profiles),
    media: nestedRecord<MediaProfile>(user.media_profiles),
  };
}

export function hasPersonRoleProfile(user: UserRow): boolean {
  const { athlete, professional, media } = personRoleProfiles(user);
  return Boolean(athlete || professional || media);
}
