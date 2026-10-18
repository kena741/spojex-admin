/** Resolve the Spojex platform org owner user id (default campaign beneficiary). */

type ClientLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: boolean,
      ) => {
        maybeSingle: () => Promise<{
          data: { user_id?: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export async function resolvePlatformBeneficiaryUserId(
  client: ClientLike,
): Promise<string | null> {
  const { data, error } = await client
    .from("organizations")
    .select("user_id")
    .eq("is_platform", true)
    .maybeSingle();
  if (error) return null;
  const id = data?.user_id ? String(data.user_id).trim() : "";
  return id || null;
}
