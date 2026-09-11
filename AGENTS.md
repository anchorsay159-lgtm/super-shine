# Super Shine — continuation guide

This repository powers Super Shine Laundry. It contains more than one front end and a Supabase backend. Read the handoff documents in `docs/` before changing code:

- `docs/ARCHITECTURE.md`
- `docs/WORKFLOW.md`
- `docs/DATABASE.md`
- `docs/ROLES_AND_PERMISSIONS.md`
- `docs/NOTIFICATIONS.md`
- `docs/CHANGELOG.md`

## First actions in every new session

1. Work from this directory: `C:\Users\acer\Documents\IT SuperShine Project\SuperShine`.
2. Run `git status --short` before editing. The worktree has existing local changes and generated artifacts. Preserve them; do not reset, clean, overwrite, or assume they are disposable.
3. Read the relevant handoff document and the source it cites. The migration files describe repository intent; they do **not** prove the same schema or policies are deployed remotely.
4. Before modifying Expo code, read the exact Expo SDK 54 documentation: <https://docs.expo.dev/versions/v54.0.0/>.
5. Do not print, commit, or add secrets. `.env` is local configuration only. Client code may use public Supabase values; service-role and LINE secrets belong only in Supabase Edge Function secrets.

## Safety boundaries

- Do not deploy the Expo app, publish to EAS, run a Supabase migration, change Supabase secrets, or alter LINE console settings unless the user explicitly asks for that specific external change.
- Do not weaken RLS, add a service-role key to a client, bypass order/payment RPCs, or make journal entries mutable without a separate review.
- Admin UI route guards are not authorization. Preserve backend/RLS/RPC authorization.
- Customer, admin, and driver work must be tested with their real roles. Never “fix” an authorization issue by broadening a policy without understanding its data exposure.

## Repository map

- `src/app/` — Expo Router customer app, admin operations UI, and local driver routes.
- `src/context/app-context.tsx` — native/web Expo customer state and Supabase integration.
- `src/admin/`, `src/accounting/`, `src/components/`, `src/hooks/`, `src/lib/`, `src/types/` — shared Expo UI and domain logic.
- `apps/customer-web/` — separate Next.js customer web app. Its `/admin/**` route is deliberately blocked; it is not the operations dashboard.
- `packages/shared/` — business/domain helpers shared with customer web.
- `supabase/migrations/` — ordered database changes. Review their predecessors before changing an RPC, trigger, policy, or enum-like value.
- `supabase/functions/` — LINE and protected backend functions.

## Current-state warning

The repository includes a **local, unapplied/unverified** driver-employee workflow migration and related Expo, Customer Web, Admin, notification, and tracking code. Do not describe it as deployed or production-ready until the project’s remote database, Edge Function configuration, and app deployment have been explicitly verified. See `docs/WORKFLOW.md` and `docs/CHANGELOG.md`.

## CURRENTLY IMPLEMENTED

The repository has an Expo customer/admin application, a separate Next.js customer web app, a Supabase backend, LINE Edge Functions, accounting migrations, and source-backed GPS/tracking work. The full maps and current route lists are in `docs/ARCHITECTURE.md`.

## PLANNED

The next intended feature is the Customer ↔ Driver/Employee ↔ Admin workflow rollout. Local source exists, but it is not a verified deployment. Follow the staged plan in `docs/WORKFLOW.md`; do not make a migration or deployment part of an unrelated UI task.

## KNOWN ISSUE

The worktree contains many pre-existing code changes and generated artifacts. Remote deployment/schema/LINE setup cannot be inferred from the files here. The driver workflow has source-level automated coverage but has not been exercised against the target database with separate real customer, driver, and admin accounts.

## DO NOT CHANGE WITHOUT REVIEW

Order state routing, payments/accounting, RLS/RPC privileges, LINE callback/webhook/worker security, GPS privacy/retention, and any deployment configuration are review-required areas. Refer to the document for that domain before editing.

## Development checks

Use the root scripts unless a package-specific task is required:

```powershell
npm test
npm run check
npx expo export --platform web --output-dir .tmp-manual-export
```

For the Next customer web app, run commands from `apps/customer-web/` as applicable. Build outputs in `.tmp-*`, `dist/`, and screenshots may be useful evidence from prior work; do not remove them merely to make the worktree look clean.

## High-risk areas requiring review

- order status transitions, fulfillment methods, payment state, coupons, and price approval;
- accounting events/journals, cash handoff, refunds, and payment verification;
- Supabase RLS, storage access, RPC privileges, and realtime publication;
- LINE OAuth callback URLs, webhook signing, access tokens, worker secret, and delivery retries;
- GPS consent, location accuracy, task assignment, and background-location assumptions.

When adding a feature, update the relevant handoff document in the same change and clearly label what is deployed, locally implemented, planned, or a known issue.
