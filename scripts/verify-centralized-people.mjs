/**
 * Static + live backend checks for Admin People vs centralized identity.
 * Run: node scripts/verify-centralized-people.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const base =
  process.env.SPOJEX_API_BASE_URL ||
  "https://spojex-backend-prod-576757759417.europe-west3.run.app";

const checks = [];
function ok(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

// --- Source contracts (Admin M7) ---
const people = read("app/api/admin/people/route.ts");
ok(
  "People filter uses paginated assignment SoT",
  people.includes("listAssignmentUserIds") && people.includes("assignIds"),
);
ok(
  "People badges prefer active_roles over users.role",
  people.includes("collectProfileBadges") && people.includes("active_roles"),
);
ok(
  "listAssignmentUserIds hits /data/user_role_assignments",
  read("lib/people/assignment-badges.ts").includes("/api/v1/data/user_role_assignments"),
);
ok(
  "categoryFor maps account roles",
  read("lib/catalog.ts").includes('if (id === "athlete") return "athlete"') &&
    read("lib/catalog.ts").includes('if (id === "professional") return "professional"'),
);
ok(
  "People unions assignments with users.role mirror",
  people.includes("ATHLETE_ROLE_SLUGS") &&
    people.includes("assignIds") &&
    people.includes("mirrorRows"),
);

const usersRoute = read("app/api/admin/users/route.ts");
ok(
  "Create soft-fails with assignment_pending",
  usersRoute.includes("assignment_pending: Boolean") &&
    usersRoute.includes("ensureRoleAssignment"),
);
ok(
  "ensureRoleAssignment PATCHes /data/users",
  usersRoute.includes("/api/v1/data/users/") && usersRoute.includes('JSON.stringify({ role })'),
);

const ensure = read("app/api/admin/users/[id]/ensure-role/route.ts");
ok(
  "ensure-role retry route exists",
  ensure.includes("assignment_pending") && ensure.includes("PATCH"),
);

const ensureClient = read("lib/users/ensure-role.ts");
ok(
  "Client helper posts ensure-role",
  ensureClient.includes("/ensure-role"),
);

const patch = read("app/api/admin/users/[id]/route.ts");
ok(
  "People PATCH role goes through backend data/users",
  patch.includes("/api/v1/data/users/") && patch.includes("apply_role_resolution"),
);

const preview = read("app/api/admin/people/[id]/preview/route.ts");
ok(
  "Preview badges from assignments",
  preview.includes("user_role_assignments") && preview.includes("profile_types"),
);

const orgCreate = read("app/admin/organizations/page.tsx");
ok(
  "Org create retries ensure-role on assignment_pending",
  orgCreate.includes("ensureUserRoleAssignment") &&
    orgCreate.includes("assignment_pending"),
);

// --- Live backend contracts Admin relies on ---
async function live() {
  const fan = await fetch(`${base}/api/v1/data/users?role=in.(fan)&limit=5`).then((r) =>
    r.json(),
  );
  const fanRows = Array.isArray(fan) ? fan : [];
  ok("Live users?role=in.(fan) returns rows", fanRows.length >= 1, `n=${fanRows.length}`);
  if (fanRows[0]) {
    ok(
      "Fan row embeds active_roles",
      Array.isArray(fanRows[0].active_roles) && fanRows[0].active_roles.length >= 1,
      JSON.stringify(fanRows[0].active_roles),
    );
  }

  const playerId = "c86478f0-0b7c-443d-bc13-462752a77a73";
  const player = await fetch(`${base}/api/v1/data/users/${playerId}`).then((r) => r.json());
  ok(
    "Athlete get-by-id has active_roles",
    player?.role === "athlete" &&
      Array.isArray(player?.active_roles) &&
      player.active_roles.some((a) => a.account_role === "athlete"),
    `role=${player?.role}`,
  );

  const pub = await fetch(`${base}/api/v1/profiles/${playerId}`).then((r) => r.json());
  ok(
    "Public catalog profile has assignment_id",
    Boolean(pub?.assignment_id) && pub?.role === "athlete",
    `assignment_id=${pub?.assignment_id}`,
  );

  for (const t of ["athlete_profiles", "professional_profiles", "media_profiles"]) {
    const res = await fetch(`${base}/api/v1/data/${t}`);
    const body = await res.json();
    ok(`Retired ${t} list is empty 200`, res.status === 200 && Array.isArray(body) && body.length === 0);
  }

  // Assignments SoT must be listed on /data (Admin People filters). Auth may be required.
  const uraAnon = await fetch(`${base}/api/v1/data/user_role_assignments?limit=1`);
  ok(
    "Live user_role_assignments is not 404",
    uraAnon.status !== 404,
    `status=${uraAnon.status}`,
  );
}

await live();
const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
