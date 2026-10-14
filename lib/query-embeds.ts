/** Explicit PostgREST hints — profile tables have both id and user_id → users. */

export const userProfileSelect =
  "*, athlete_profiles!athlete_profiles_user_id_fkey(*), professional_profiles!professional_profiles_user_id_fkey(*), media_profiles!media_profiles_user_id_fkey(*)";

export const athleteWithUserSelect =
  "*, users!athlete_profiles_user_id_fkey(id, display_name, city, country)";

export const professionalWithUserSelect =
  "*, users!professional_profiles_user_id_fkey(id, display_name, role)";

export const mediaWithUserSelect =
  "*, users!media_profiles_user_id_fkey(id, display_name, role)";
