/** Role-based verification document catalog. */

export type VerificationDocStep = "identity" | "role_evidence";

export type IdentityDocumentType = {
  id: string;
  slug: string;
  label: string;
  description: string;
  step: VerificationDocStep;
  is_active: boolean;
  sort_order: number;
};

export type IdentityRoleDocumentRequirement = {
  id: string;
  role_slug: string;
  document_type_id: string;
  is_required: boolean;
  description: string;
  sort_order: number;
  identity_document_types?: Pick<
    IdentityDocumentType,
    "id" | "slug" | "label" | "description" | "step" | "is_active" | "sort_order"
  > | null;
};

export type VerificationRequirement = {
  document_type_id?: string;
  slug: string;
  label: string;
  description: string;
  step: VerificationDocStep;
  is_required: boolean;
  requirement_description: string;
  sort_order: number;
};

/** Static fallback when DB migration is not applied yet. */
export const VERIFICATION_DOCUMENT_TYPE_SEEDS: Omit<IdentityDocumentType, "id">[] = [
  {
    slug: "national_id_front",
    label: "National ID (front)",
    description: "Front side of National ID / Fayda.",
    step: "identity",
    is_active: true,
    sort_order: 10,
  },
  {
    slug: "national_id_back",
    label: "National ID (back)",
    description: "Back side of National ID / Fayda.",
    step: "identity",
    is_active: true,
    sort_order: 20,
  },
  {
    slug: "professional_license",
    label: "Professional license",
    description: "Coaching, medical, scouting, or other professional license.",
    step: "role_evidence",
    is_active: true,
    sort_order: 30,
  },
  {
    slug: "professional_certificate",
    label: "Certificate",
    description: "Training certificate or accreditation.",
    step: "role_evidence",
    is_active: true,
    sort_order: 40,
  },
  {
    slug: "press_credential",
    label: "Press / media credential",
    description: "Press card or media accreditation.",
    step: "role_evidence",
    is_active: true,
    sort_order: 50,
  },
  {
    slug: "media_portfolio",
    label: "Media portfolio sample",
    description: "Sample of published or match-day work.",
    step: "role_evidence",
    is_active: true,
    sort_order: 60,
  },
  {
    slug: "federation_card",
    label: "Federation / association card",
    description: "Federation, association, or referee ID card.",
    step: "role_evidence",
    is_active: true,
    sort_order: 70,
  },
  {
    slug: "club_letter",
    label: "Club affiliation letter",
    description: "Letter from club, academy, or school confirming affiliation.",
    step: "role_evidence",
    is_active: true,
    sort_order: 80,
  },
  {
    slug: "other",
    label: "Other supporting document",
    description: "Any additional supporting photo or PDF.",
    step: "role_evidence",
    is_active: true,
    sort_order: 90,
  },
];

type RoleReqSeed = {
  role_slug: string;
  slug: string;
  is_required: boolean;
  description: string;
  sort_order: number;
};

function identityPair(role: string): RoleReqSeed[] {
  return [
    {
      role_slug: role,
      slug: "national_id_front",
      is_required: true,
      description: "Clear photo of the front of your National ID.",
      sort_order: 10,
    },
    {
      role_slug: role,
      slug: "national_id_back",
      is_required: true,
      description: "Clear photo of the back of your National ID.",
      sort_order: 20,
    },
  ];
}

const VERIFIABLE_ROLES = [
  "player",
  "coach",
  "scout",
  "agent",
  "referee",
  "analyst",
  "fitness_coach",
  "physiotherapist",
  "nutritionist",
  "consultant",
  "administrator",
  "medical",
  "other_professional",
  "photographer",
  "sports_journalist",
] as const;

export const VERIFICATION_ROLE_REQUIREMENT_SEEDS: RoleReqSeed[] = [
  ...VERIFIABLE_ROLES.flatMap((role) => identityPair(role)),
  {
    role_slug: "player",
    slug: "federation_card",
    is_required: false,
    description: "Optional federation or association player card.",
    sort_order: 30,
  },
  {
    role_slug: "player",
    slug: "club_letter",
    is_required: false,
    description: "Optional club or academy affiliation letter.",
    sort_order: 40,
  },
  ...(["coach", "fitness_coach", "scout", "agent"] as const).flatMap((role) => [
    {
      role_slug: role,
      slug: "professional_license",
      is_required: true,
      description: "Upload your professional license or accreditation.",
      sort_order: 30,
    },
    {
      role_slug: role,
      slug: "professional_certificate",
      is_required: false,
      description: "Optional certificate or supporting credential.",
      sort_order: 40,
    },
  ]),
  {
    role_slug: "referee",
    slug: "federation_card",
    is_required: true,
    description: "Referee federation / association card.",
    sort_order: 30,
  },
  {
    role_slug: "referee",
    slug: "professional_license",
    is_required: false,
    description: "Optional officiating license.",
    sort_order: 40,
  },
  ...(["physiotherapist", "medical", "nutritionist"] as const).flatMap((role) => [
    {
      role_slug: role,
      slug: "professional_license",
      is_required: true,
      description: "Professional or clinical license.",
      sort_order: 30,
    },
    {
      role_slug: role,
      slug: "professional_certificate",
      is_required: false,
      description: "Optional certificate.",
      sort_order: 40,
    },
  ]),
  ...(["analyst", "consultant", "administrator", "other_professional"] as const).flatMap(
    (role) => [
      {
        role_slug: role,
        slug: "professional_license",
        is_required: false,
        description: "Optional professional license.",
        sort_order: 30,
      },
      {
        role_slug: role,
        slug: "professional_certificate",
        is_required: false,
        description: "Optional certificate.",
        sort_order: 40,
      },
      {
        role_slug: role,
        slug: "other",
        is_required: false,
        description: "Optional supporting document.",
        sort_order: 50,
      },
    ],
  ),
  ...(["photographer", "sports_journalist"] as const).flatMap((role) => [
    {
      role_slug: role,
      slug: "press_credential",
      is_required: true,
      description: "Press card or media accreditation.",
      sort_order: 30,
    },
    {
      role_slug: role,
      slug: "media_portfolio",
      is_required: false,
      description: "Optional sample of your work.",
      sort_order: 40,
    },
    {
      role_slug: role,
      slug: "other",
      is_required: false,
      description: "Optional supporting document.",
      sort_order: 50,
    },
  ]),
];

export const VERIFICATION_STEPS = [
  { id: "identity" as const, label: "Identity", blurb: "National ID front and back." },
  {
    id: "role_evidence" as const,
    label: "Role evidence",
    blurb: "License, credential, or affiliation documents for this role.",
  },
];

export function fallbackRequirementsForRole(roleSlug?: string | null): VerificationRequirement[] {
  if (!roleSlug) return [];
  const typesBySlug = new Map(VERIFICATION_DOCUMENT_TYPE_SEEDS.map((item) => [item.slug, item]));
  return VERIFICATION_ROLE_REQUIREMENT_SEEDS.filter((item) => item.role_slug === roleSlug)
    .map((item) => {
      const type = typesBySlug.get(item.slug);
      if (!type || !type.is_active) return null;
      return {
        slug: item.slug,
        label: type.label,
        description: type.description,
        step: type.step,
        is_required: item.is_required,
        requirement_description: item.description || type.description,
        sort_order: item.sort_order,
      } satisfies VerificationRequirement;
    })
    .filter((item): item is VerificationRequirement => item != null)
    .sort((a, b) => {
      const stepRank = (step: VerificationDocStep) => (step === "identity" ? 0 : 1);
      return stepRank(a.step) - stepRank(b.step) || a.sort_order - b.sort_order;
    });
}

export function verificationStepLabel(step?: string | null) {
  return VERIFICATION_STEPS.find((item) => item.id === step)?.label ?? step ?? "-";
}
