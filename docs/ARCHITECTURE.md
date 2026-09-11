# Super Shine architecture handoff

## Reading status

**CURRENTLY IMPLEMENTED** means code or configuration was found in this repository on 2026-09-10. It does not mean that a matching remote Supabase project or deployed web build was verified.

**PLANNED** means a design direction or local work that must not be represented as production behavior.

**KNOWN ISSUE** describes an observed limitation or uncertainty.

**DO NOT CHANGE WITHOUT REVIEW** identifies contracts shared across screens, RPCs, database logic, or external services.

## CURRENTLY IMPLEMENTED — repository structure

```text
SuperShine/
  src/                         Expo Router application and shared Expo code
    app/                       customer, admin, and local driver routes
    admin/                     admin operations UI/hooks/config
    accounting/                accounting UI
    components/ hooks/ lib/    reusable UI, realtime/location hooks, integrations
    context/                   customer state and Supabase client usage
    types/                     domain types
  apps/customer-web/           separate Next.js customer web app
  packages/shared/             shared business/types helpers used by customer web
  supabase/migrations/         ordered SQL migrations
  supabase/functions/          Edge Functions, principally LINE-related
  assets/, public/             application assets
  tests/                       root tests; customer web has its own tests
  README.md, *_SETUP.md        earlier setup and operational notes
```

The root application is Expo SDK 54 with Expo Router, React 19, React Native, Supabase JS, Leaflet, and (in the current local worktree) `expo-location`. Root scripts include `start`, `start:lan`, `start:tunnel`, `start:remote`, `android`, `ios`, `web`, `lint`, `typecheck`, `test`, and `check`.

The Expo configuration uses slug `super-shine`, URI scheme `supershine`, iOS bundle identifier `com.supershine.studentapp`, static web export, and an EAS project ID. `supabase/config.toml` configures Edge Function JWT behavior. No `eas.json` was found during this handoff review.

## CURRENTLY IMPLEMENTED — applications

### Customer Expo application

`src/context/app-context.tsx` is the primary customer data/auth state layer. It hydrates the Supabase session, profile, catalog, addresses, slots, business settings, coupons, orders, and notifications. It calls protected database RPCs for placing/withdrawing orders, customer price responses, and PromptPay actions. Native demo mode is local `AsyncStorage` data, not a customer production order path.

Customer routes include:

- `/`, `/auth`, `/forgot-password`, `/reset-password`, `/line-callback`
- `/(tabs)/home`, `/(tabs)/orders`, `/(tabs)/offers`, `/(tabs)/profile`
- `/new-order`, `/services`, `/order-tracking`, `/order-success`
- `/notifications`, `/account`

### Customer Web

`apps/customer-web/` is a Next.js 16 customer-facing app. It uses `@supershine/shared`, its own Web App context, Supabase browser session handling, customer catalog/order/payment/support flows, and security headers in `next.config.ts`.

Customer web routes include `/`, `/auth/callback`, `/cart`, `/checkout`, `/forgot-password`, `/reset-password`, `/notifications`, `/orders`, `/orders/[id]`, `/profile`, and `/services/[id]`. The `apps/customer-web/src/app/admin/[[...path]]/page.tsx` route intentionally prevents this app from being used as the operations dashboard.

### Admin operations UI

The operations UI is implemented in the Expo application under `/admin`, rather than in `apps/customer-web`:

- `/admin` — operations overview
- `/admin/orders`, `/admin/order/[id]` — queues, order detail, status/payment/price/support handling
- `/admin/reports` — reporting UI
- `/admin/settings` — business/catalog/promotion/slot/PromptPay settings
- `/admin/accounting` — accounting UI

Important admin implementation files include `src/admin/admin-ui.tsx`, `src/admin/use-admin-orders.ts`, `src/admin/order-config.ts`, `src/admin/pickup-slots.ts`, and `src/accounting/accounting-ui.tsx`.

### Local driver application work

The local worktree contains `/driver`, `/driver/task/[id]`, `/admin/drivers`, driver task components, task hooks, customer task cards, a `driver` role type, `expo-location` configuration, an `admin-create-driver` Edge Function, and migration `20260910_driver_employee_workflow.sql`.

This is source present locally. Its migration/deployment state was not verified against Supabase, so it is not evidence of a live driver product.

## CURRENTLY IMPLEMENTED — important components, hooks, and services

| Area | Source locations found | Responsibility |
| --- | --- | --- |
| App shell and customer UI | `src/components/app-frame*`, `customer-ui.tsx`, `super-ui.tsx`, `customer-checkout.tsx` | layout and customer-facing UI composition |
| Checkout persistence | `src/hooks/use-checkout-draft.ts` | client-side checkout-draft handling |
| GPS/map UI | `customer-order-gps-card.tsx`, `admin-order-gps-card*`, `live-location-map*`, `use-order-live-location.ts`, `use-driving-route.ts` | order tracking map, current-location and route presentation |
| LINE UI | `line-connect-button*` and `src/app/line-callback.tsx` | customer connection entry/return UI; message delivery remains server-side |
| Admin operations | `src/admin/admin-ui.tsx`, `use-admin-orders.ts`, `order-config.ts`, `pickup-slots.ts` | dashboard/order queue/detail configuration |
| Local driver work | `src/driver/use-driver-tasks.ts`, `use-driver-task-tracking*`, `use-customer-driver-tasks.ts`, task card components | local task assignment/tracking source, not remotely verified |
| Supabase services | `src/lib/`, `src/context/app-context.tsx`, `apps/customer-web/src/context/web-app.tsx`, `supabase/functions/` | client queries/RPC calls and protected LINE/driver Edge Functions |

Platform-suffixed `.web.tsx` / `.web.ts` files provide web-specific implementations where present. The existence of a component does not establish a corresponding remote table, policy, or deployed feature.

## CURRENTLY IMPLEMENTED — shared/backend architecture

- Supabase provides Auth, Postgres, RLS, Realtime, Storage, RPCs, and Edge Functions.
- The app uses only public Supabase URL/key configuration. Privileged work is designed for database functions/triggers or Edge Functions using server-only secrets.
- `src/lib/order-workflow.ts` and `src/types/domain.ts` centralize customer-facing order terminology and status routing. `src/admin/order-config.ts` groups those statuses for operations UI.
- `packages/shared/src/` supplies shared business helpers/types to customer web. It currently has local modifications; preserve them unless the requested change includes them.

## CURRENTLY IMPLEMENTED — authentication and routing

Supabase Auth uses email/password and password recovery. Native reset redirects use `supershine://reset-password`; hosted reset behavior is configurable. Customer web uses a browser PKCE flow. Expo router redirects by profile role (`customer`, `admin`, and locally introduced `driver`), but UI routing is not the authorization boundary.

Customer web segregates the admin browser session key from its normal customer key. No service-role key should be introduced to any customer, driver, or admin browser/mobile client.

## CURRENTLY IMPLEMENTED — environment/deployment inputs

Do not record actual secret values. Repository and setup files reference:

| Scope | Variable or configuration |
| --- | --- |
| Expo/client | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional routing/public URL settings |
| Customer web | Next public Supabase variables, with fallback to Expo public variables in `next.config.ts` |
| Supabase Functions | Supabase runtime URL/keys plus LINE secrets documented in `LINE_SETUP.md` |
| LINE worker | `LINE_WORKER_SECRET` is a server secret; it must never be a public variable |
| Hosted reset / web return | deployment-specific URLs configured in app/function settings |

The repository identifies Supabase project reference `tozgpzdvddjtcdzhgbqa`. This is an identifier, not authorization to change that project. Expo’s configured project ID is in `app.json`; deployment state was not checked.

## KNOWN ISSUE

- The worktree is not clean. It contains customer-web/shared changes, local driver workflow work, temp exports/screenshots, and other artifacts. A future session must inspect `git status` before modifying or removing anything.
- `src/app/_layout.tsx` currently declares the `driver` stack screen twice. This was observed in local source; do not silently fix it during an unrelated task.
- Migration files are the best repository schema record, but the original complete baseline schema and the remote migration history were not verified in this handoff. Treat remote database state as unknown until checked with an authorized, read-only inspection.
- Existing GPS and LINE setup documents include external configuration prerequisites. Code alone cannot make an unpublished LINE Login channel or misconfigured webhook work.

## PLANNED

The next intended product area is a Customer ↔ Driver/Employee ↔ Admin workflow. See the dedicated `NEXT WORK` section in `docs/WORKFLOW.md`. It is not a statement that the workflow is deployed.

## DO NOT CHANGE WITHOUT REVIEW

- Keep customer web and the admin operations UI as separate products unless a deliberate consolidation is approved.
- Preserve URI/reset callback behavior, Supabase public-key-only client architecture, and customer-web security headers.
- Do not treat local driver code as production truth or run its migration/deploy commands as part of ordinary UI work.
- Changes to workflow state names must be reviewed together in `src/types/domain.ts`, `src/lib/order-workflow.ts`, admin UI, DB RPCs/triggers, notifications, and any customer-web mappings.
