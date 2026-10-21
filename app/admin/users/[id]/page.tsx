import { redirect } from "next/navigation";

type Ctx = { params: Promise<{ id: string }> };

/** Legacy route — full profiles live under People. */
export default async function UserDetailRedirectPage({ params }: Ctx) {
  const { id } = await params;
  redirect(`/admin/people/${id}`);
}
