import { PersonInlineField } from "@/components/people/person-inline-field";
import { PersonSection } from "@/components/people/person-section";
import { allRoles } from "@/lib/catalog";
import type { UserRow } from "@/lib/types";

export interface Props {
  user: UserRow;
  /** Role catalog from the identity API, with a static fallback. */
  roleOptions: { id: string; label: string }[];
  catalogReady: boolean;
  onSave: (patch: Partial<UserRow>) => Promise<boolean>;
  saving: boolean;
}

/** Names, role and location. Role changes save immediately. */
export function PersonIdentityForm({
  user,
  roleOptions,
  catalogReady,
  onSave,
  saving,
}: Props) {
  return (
    <PersonSection
      id="identity"
      title="Identity"
      description="Names and role are visible across the network."
      action={saving ? <span className="text-xs text-text-hint">Saving…</span> : null}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonInlineField
          label="Display name"
          value={user.display_name}
          onSave={(value) => onSave({ display_name: value })}
        />
        <PersonInlineField
          label="Full name"
          value={user.full_name}
          onSave={(value) => onSave({ full_name: value })}
        />
        <PersonInlineField
          label="Username"
          value={user.username ?? ""}
          onSave={(value) => onSave({ username: value || null })}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-text-secondary">Role</span>
          <select
            value={user.role}
            onChange={(event) => void onSave({ role: event.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {(catalogReady ? roleOptions : allRoles).map((item) => (
              <option key={item.id || "none"} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <PersonInlineField
          label="City"
          value={user.city}
          onSave={(value) => onSave({ city: value })}
        />
        <PersonInlineField
          label="Country"
          value={user.country}
          onSave={(value) => onSave({ country: value })}
        />
      </div>
    </PersonSection>
  );
}
