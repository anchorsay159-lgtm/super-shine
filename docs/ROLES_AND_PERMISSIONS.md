# Super Shine roles and permissions handoff

## Reading status

**CURRENTLY IMPLEMENTED** is based on repository types, routes, migrations, and code. **PLANNED** is not live behavior. **KNOWN ISSUE** records verification limits. **DO NOT CHANGE WITHOUT REVIEW** identifies authorization boundaries.

## CURRENTLY IMPLEMENTED — application roles

`src/types/domain.ts` defines application roles as `customer`, `admin`, and `driver`.

| Role | Current code responsibility |
| --- | --- |
| Customer | Uses the customer Expo app or Next customer web app; owns profile/address/order/payment/support/notification data. |
| Admin | Uses `/admin` operations UI to manage orders, price/payment/support/settings/reporting/accounting access according to backend authorization. |
| Driver | Local worktree code redirects this role to `/driver` and includes task/location UI. Its production DB/deployment status is unverified. |

Expo router role redirects exist in `src/app/index.tsx`, auth flow code, and tab layouts. They provide navigation, not data authorization.

## CURRENTLY IMPLEMENTED — auth and account permissions

Supabase Auth email/password is used for sign-in/up and recovery. Customer web uses a browser PKCE flow; the Expo app has native reset URI behavior. Registration supplies profile metadata, while protected database logic/policies control what a user can read/update.

The native Expo app has a local demo state using `AsyncStorage`. Treat demo records as local UI data; do not grant them real access or depend on them for production authorization.

Migration source contains customer ownership policies for customer records, administrative checks for operations, and separate accounting staff permissions. The `accounting_staff_roles` model includes roles such as owner/admin/accountant/cashier in accounting-specific controls; this is separate from the app’s `profiles.role` concept.

## CURRENTLY IMPLEMENTED — permission principles

- A customer should only access their own orders and dependent records.
- Admin UI may be visible only after an app-role redirect, but each database operation must still be authorized by RLS/RPC.
- Payment verification, receipt/cash handling, and accounting changes are not customer or driver actions.
- Sensitive LINE tokens and server secrets are Edge Function/Supabase secret material, never client role capabilities.
- Tracking location reads/writes are permissioned separately from merely viewing an order.

## KNOWN ISSUE

- Remote role assignments and actual RLS deployment state were not inspected directly. Do not infer that an account has a role from its email address or visible UI.
- The locally added `driver` role, routes, task policies, and Edge Function are not proof that the remote database recognizes the role.
- Client-side navigation cannot prevent direct API attempts; a role bug must be diagnosed at the database/function boundary.

## PLANNED

For the Customer ↔ Driver/Employee ↔ Admin workflow, the intended permission model is:

- Admin assigns/reassigns and handles exceptional, auditable overrides.
- Driver sees/accepts only assigned tasks, reports task-specific foreground location, and cannot verify customer payment as paid.
- Customer sees only their own task/tracking state while it is active, plus their own order/support/payment information.
- Routine driver progress is recorded from the assigned driver’s task action; administrative override needs a stated reason and audit record.

This is a rollout plan, not a current verified deployment.

## DO NOT CHANGE WITHOUT REVIEW

- Do not add service-role credentials to a browser/mobile client or replace RLS with UI checks.
- Do not broaden customer/driver select policies to troubleshoot empty screens.
- Do not allow drivers to update payments, final prices, refunds, journal entries, other drivers’ tasks, or unrelated orders.
- Keep role checks, task assignment, order ownership, and tracking permissions synchronized across RLS, RPCs, Edge Functions, and UI.
