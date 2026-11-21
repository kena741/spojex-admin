/** Users select without legacy role-profile embeds (catalog owns structured fields). */

export const userProfileSelect =
  "id, user_id, display_name, full_name, username, email, phone, role, avatar_url, cover_url, verified, city, country, headline, bio, currency, website, created_at, updated_at, deleted_at";

/** @deprecated Legacy embeds — do not use; tables remain until M6 drop. */
export const athleteWithUserSelect =
  "*, users!athlete_profiles_user_id_fkey(id, display_name, city, country)";

/** @deprecated Legacy embeds — do not use; tables remain until M6 drop. */
export const professionalWithUserSelect =
  "*, users!professional_profiles_user_id_fkey(id, display_name, role)";

/** @deprecated Legacy embeds — do not use; tables remain until M6 drop. */
export const mediaWithUserSelect =
  "*, users!media_profiles_user_id_fkey(id, display_name, role)";
