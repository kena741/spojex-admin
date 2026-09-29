import { getSupabase } from "@/lib/supabase/client";
import {
  fallbackRequirementsForRole,
  type IdentityDocumentType,
  type IdentityRoleDocumentRequirement,
  type VerificationRequirement,
  VERIFICATION_DOCUMENT_TYPE_SEEDS,
} from "@/lib/verification-docs";

function isMissingTable(message: string) {
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("Could not find the function")
  );
}

export async function fetchIdentityDocumentTypes(): Promise<{
  types: IdentityDocumentType[];
  fromDatabase: boolean;
}> {
  const client = getSupabase();
  const { data, error } = await client
    .from("identity_document_types")
    .select("*")
    .order("sort_order");

  if (error) {
    if (isMissingTable(error.message)) {
      return {
        types: VERIFICATION_DOCUMENT_TYPE_SEEDS.map((item) => ({
          ...item,
          id: item.slug,
        })),
        fromDatabase: false,
      };
    }
    throw new Error(error.message);
  }

  return {
    types: (data ?? []) as IdentityDocumentType[],
    fromDatabase: true,
  };
}

export async function fetchRoleDocumentRequirements(
  roleSlug?: string,
): Promise<{
  requirements: IdentityRoleDocumentRequirement[];
  fromDatabase: boolean;
}> {
  const client = getSupabase();
  let query = client
    .from("identity_role_document_requirements")
    .select("*, identity_document_types(*)")
    .order("sort_order");
  if (roleSlug) query = query.eq("role_slug", roleSlug);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error.message)) {
      return { requirements: [], fromDatabase: false };
    }
    throw new Error(error.message);
  }

  return {
    requirements: (data ?? []) as IdentityRoleDocumentRequirement[],
    fromDatabase: true,
  };
}

export async function fetchVerificationRequirementsForRole(
  roleSlug?: string | null,
): Promise<{ requirements: VerificationRequirement[]; fromDatabase: boolean }> {
  if (!roleSlug) return { requirements: [], fromDatabase: true };

  const client = getSupabase();
  const { data, error } = await client.rpc("identity_verification_requirements", {
    p_role_slug: roleSlug,
  });

  if (error) {
    if (isMissingTable(error.message)) {
      return { requirements: fallbackRequirementsForRole(roleSlug), fromDatabase: false };
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as VerificationRequirement[];
  if (rows.length === 0) {
    return { requirements: fallbackRequirementsForRole(roleSlug), fromDatabase: true };
  }

  return { requirements: rows, fromDatabase: true };
}
