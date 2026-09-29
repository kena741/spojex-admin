# SpoJex Admin

Internal console for the SpoJex football identity and services marketplace. Layout and workflow follow the Zemen admin (`Desktop/zulu/lolelink-admin`). Data and env come from `spojext_superapp`.

## Setup

1. Env is copied from `spojext_superapp/apps/host/.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xfwgeoqlsutzelhccwyx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

2. Run `supabase/migrations/016_admins.sql` in the SpoJex Supabase SQL editor. This creates `admin` and `admin_role` (Super Admin, Operations, Identity, Marketplace, Support, Viewer).

3. Optional: add `SUPABASE_SERVICE_ROLE_KEY` so admins can read/update rows that RLS otherwise limits to the owner (requests, reports, messages, unpublished services, verifying other users).

4. Install and run:

```
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The **first** successful sign-in becomes Super Admin. Later staff are added under Administration → Admins.

## Tables

The admin maps the current superapp schema:

| Area | Tables |
| --- | --- |
| Staff login | `admin`, `admin_role` |
| Identity | `users`, `athlete_profiles`, `professional_profiles`, `media_profiles` |
| Organizations | `organizations` |
| Marketplace | `service_categories`, `services`, `service_requests`, `service_reviews` |
| Network | `connections`, `follows`, `reports`, `messages`, `notifications` |
# spojex-admin
