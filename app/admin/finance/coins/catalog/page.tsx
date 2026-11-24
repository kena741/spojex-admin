import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function tabFromFocus(focus: string | undefined): string {
  if (focus === "gifts") return "gifts";
  if (focus === "settings" || focus === "rates") return "rates";
  if (focus === "packages" || focus === "packs") return "packs";
  return "packs";
}

/** Legacy catalog URL — editor lives on Finance → Coins & Gifts. */
export default async function CoinCatalogRedirectPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams ?? {});
  const tab = first(params.tab) || tabFromFocus(first(params.focus));
  redirect(`/admin/finance/coins?tab=${tab}`);
}
