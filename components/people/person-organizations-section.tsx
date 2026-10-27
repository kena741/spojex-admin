import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { PersonEmptyState, PersonSection } from "@/components/people/person-section";
import type { OrganizationRow } from "@/lib/types";

export interface Props {
  orgs: OrganizationRow[];
}

export function PersonOrganizationsSection({ orgs }: Props) {
  return (
    <PersonSection id="organizations" title="Organizations" count={orgs.length}>
      {orgs.length === 0 ? (
        <PersonEmptyState
          icon={Building2}
          title="Not part of any organization."
          hint="Organization membership appears here once this person joins or creates one."
        />
      ) : (
        <ul className="divide-y divide-border">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/organizations/${org.id}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-text-hint" aria-hidden />
                  <span className="truncate font-medium">{org.name || org.public_id}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-hint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PersonSection>
  );
}
