import { PersonInlineField } from "@/components/people/person-inline-field";
import { PersonSection } from "@/components/people/person-section";
import type { UserRow } from "@/lib/types";

/** `users.role` mirror — account roles only (profession/sport live on assignments). */
const ACCOUNT_ROLE_OPTIONS = [
  { id: "", label: "No role" },
  { id: "fan", label: "Fan" },
  { id: "athlete", label: "Athlete" },
  { id: "professional", label: "Professional" },
];

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
  const options = catalogReady && roleOptions.length > 1 ? roleOptions : ACCOUNT_ROLE_OPTIONS;
  return (
    <PersonSection
      id="identity"
      title="Identity"
      description="Names and account role are visible across the network. Sport/profession categories live on role assignments."
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
          <span className="mb-1 block text-text-secondary">Account role</span>
          <select
            value={["fan", "athlete", "professional"].includes(user.role) ? user.role : ""}
            onChange={(event) => void onSave({ role: event.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {options.map((item) => (
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
