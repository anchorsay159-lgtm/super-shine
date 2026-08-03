# Super Shine customer web

This is the standalone Next.js customer browser application. The existing Expo mobile app and Expo-based admin dashboard remain at the repository root.

## Local development

From this directory:

```powershell
npm install
npm run dev
```

The app reuses the repository root Expo public Supabase variables during local workspace development. For an independent deployment, configure:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Only the public Supabase URL and publishable/anon key belong in the browser bundle. Never add a service-role key.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Deploy

For Vercel, import the repository and set the project root directory to `apps/customer-web`. Add the two `NEXT_PUBLIC_` variables for each deployment environment, then deploy with the standard Next.js build command.

Add both the production customer-web callback URL and any preview callback URLs to Supabase Authentication URL Configuration. The required paths are:

- `/auth/callback`
- `/reset-password`

The customer browser host should be distinct from the existing admin host. Customer requests to `/admin/*` are intentionally blocked by this application.

## Data alignment

`@supershine/shared` supplies browser-safe domain types, established order/payment labels and progress, formatting, localization keys, and pure total/coupon helpers. Authoritative records and mutations continue to use the same Supabase project, RLS policies, storage, and RPC functions as Expo.
