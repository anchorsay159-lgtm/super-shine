# Super Shine implementation handoff changelog

## 2026-09-11 — Driver account and Admin crash hotfix (local; deployment required)

### CURRENTLY IMPLEMENTED

- Added an additive SQL hotfix that expands the deployed `profiles.role` check constraint to permit the already-implemented `driver` role.
- Driver account creation now returns stable error codes for duplicate email, Auth creation failure, and profile-role/database failure. The Admin form displays actionable messages from non-2xx Edge Function responses.
- The Admin employee form now obtains or refreshes its current session and explicitly sends the user access token. The function distinguishes missing/invalid sessions, profile lookup failures, and accounts without the Admin role.
- Admin order and Driver operation loaders now catch malformed/network failures and render their existing retry state.
- Added an Expo Router error boundary so an unexpected screen exception displays a retry screen instead of a blank white page.
- Driver-operation Realtime subscriptions now use a unique channel per mounted screen and remove it during cleanup, preventing rapid navigation/retry remounts from reusing an already-subscribed channel.
- The dispatch queue now automatically uses the only available driver, visibly marks selected drivers, and reports assignment RPC/network failures instead of requiring an unclear chip-selection step or appearing to do nothing.

### KNOWN ISSUE

- These fixes are local until the SQL hotfix is run, `admin-create-driver` is redeployed, and the Expo web export is redeployed.

### DO NOT CHANGE WITHOUT REVIEW

- Keep Driver role provisioning server-side. Do not let public sign-up or client profile updates grant `driver` or `admin`.

## Reading status

This is an evidence-based handoff log, not release notes. **CURRENTLY IMPLEMENTED** means source was found locally. **PLANNED** is not deployed. **KNOWN ISSUE** records uncertainty. **DO NOT CHANGE WITHOUT REVIEW** records safeguards.

## CURRENTLY IMPLEMENTED — observed repository history

The migration filenames show these implementation eras:

| Date prefix | Source change present |
| --- | --- |
| 2026-07 | Customer/catalog/security, coupons, customer realtime, demo/order/payment compatibility work |
| 2026-08 | SME accounting, PromptPay, shared fulfillment workflow |
| 2026-09-07/08 | LINE notifications, worker scheduling/realtime dispatch, live GPS, distance/arrival notifications, staff-owned GPS tracking |
| 2026-09-10 | Local driver/employee workflow migration source |

The repository currently includes customer UI/design changes in `apps/customer-web/` and `packages/shared/`, plus local driver workflow files listed in `docs/WORKFLOW.md`. These are existing worktree changes; this document does not attribute them to a deployed release.

Existing project operational documents include `README.md`, `SUPABASE_SETUP.md`, `LINE_SETUP.md`, `GPS_SETUP.md`, `ACCOUNTING_SETUP.md`, `ACCOUNTING_ROLLBACK.md`, `ACCOUNTING_TEST_MATRIX.md`, `CUSTOMER_SECURITY_NAVIGATION_AUDIT.md`, and `DRIVER_WORKFLOW_REPORT.md`.

On 2026-09-11 the local driver workflow was completed across Expo, Admin, and Customer Web: task-scoped pause/resume, customer web tracking, driver operational notifications, database-side Admin transport guards, and client role-escalation protection were added. The duplicate root driver route declaration was removed. Repository validation passed `npm test` (92 tests), `npm run check`, current web/Android/iOS Expo exports, plus Customer Web tests, type checking, and production build. These results apply to local source, not to a production deployment.

This handoff added/updated `AGENTS.md` and the `docs/` documents only; it does not change application behavior, database state, secrets, or deployments.

## KNOWN ISSUE

- The repository worktree is dirty and includes generated `.tmp-*` exports/logs/screenshots as well as code changes. Do not use a destructive reset/clean to make it tidy.
- Remote Supabase migration state, RLS, Edge Function revisions/secrets, cron schedule, realtime publication, LINE console setup, and deployed builds are not verified by this source review.
- The local driver workflow needs remote migration/function deployment plus controlled multi-account/device integration review before it can be described as an end-to-end production workflow.

## PLANNED

The next planned feature is the reviewed production rollout of a Customer ↔ Driver/Employee ↔ Admin workflow: task assignment, explicit acceptance, foreground tracking while in transit, privacy-limited customer map/ETA, auditable handoff evidence, admin exception handling, and notification thresholds. Its intended architecture is documented in `docs/WORKFLOW.md`; it remains planned until remote prerequisites are confirmed and the user authorizes deployment.

## DO NOT CHANGE WITHOUT REVIEW

- Do not alter historic migration files after they may have been applied. Add a new migration for an approved schema correction.
- Do not erase temp artifacts or unrelated worktree changes while working on a feature.
- Do not claim an app/DB/function is deployed solely because source files or a local export exist.
- Keep this log and the relevant handoff file current when a future change is implemented, migrated, deployed, rolled back, or discovered to be blocked.
