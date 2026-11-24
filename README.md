# SpoJex Admin

Internal console for the SpoJex football identity and services marketplace.

## Setup

1. Copy env from `.env.example`:

```
SPOJEX_API_BASE_URL=https://spojex-backend-prod-576757759417.europe-west3.run.app
NEXT_PUBLIC_SPOJEX_API_BASE_URL=https://spojex-backend-prod-576757759417.europe-west3.run.app
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

2. Install and run:

```
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The **first** successful sign-in becomes Super Admin. Later staff are added under Administration → Admins.

## Tables

| Area | Tables |
| --- | --- |
| Staff login | `admin`, `admin_role` |
| Identity | `users`, `user_role_assignments`, catalog `profile_*` (legacy `*_profiles` retired M6) |
| Organizations | `organizations` |
| Marketplace | `service_categories`, `services`, `service_requests`, `service_reviews` |
| Network | `connections`, `follows`, `reports`, `messages`, `notifications` |
