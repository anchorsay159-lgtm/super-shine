# Super Shine notifications and LINE handoff

## Reading status

**CURRENTLY IMPLEMENTED** is repository code/migration evidence. **PLANNED** is not deployed behavior. **KNOWN ISSUE** identifies external prerequisites or uncertainty. **DO NOT CHANGE WITHOUT REVIEW** protects delivery/security contracts.

## CURRENTLY IMPLEMENTED — in-app and realtime notifications

The application has a `notifications` data model and customer notification UI. Customer state layers subscribe/refetch around notifications, orders, order items/history, payments, support messages, catalog/configuration changes, and eligible promotions where used. Admin and accounting code also uses realtime-oriented refresh paths.

Order lifecycle and payment/support changes have migration-backed notification behavior. Customer-facing UI must treat realtime as a refresh signal and still enforce data access through Supabase/RLS.

The local driver migration adds in-app notifications for new assignment, reassignment (old and new driver), schedule changes, cancellation, customer arrival, and customer trip-start/arrival events. Driver notification links route back into `/driver`. These source changes are not verified on the remote database. The LINE template source contains a concise customer-facing `driver_arrived` card; no external LINE channel setting was changed.

## CURRENTLY IMPLEMENTED — LINE architecture

The repository implements LINE as a server-side connected-account/outbox workflow:

1. A customer starts a LINE connection flow through `line-connect-start`.
2. `line-connect-callback` handles the external return using state/PKCE/nonce-style data represented by link attempts/connections.
3. `line-webhook` receives signed LINE events.
4. Eligible app notifications are queued in `line_notification_deliveries` rather than being sent by the customer client.
5. `line-notifications-worker` claims/retries/skips queued work and sends through LINE’s messaging interface.
6. `line-order-link` provides an opaque server-side order-link path.

`supabase/config.toml` marks `line-connect-callback`, `line-webhook`, `line-notifications-worker`, and `line-order-link` as not requiring JWT verification; their own validation is therefore security-critical. `line-connect-start` requires JWT verification.

The scheduler/realtime dispatch migrations contain source for automatic worker triggering. Remote cron/realtime configuration has not been verified.

## CURRENTLY IMPLEMENTED — required secret categories

`LINE_SETUP.md` documents the required server-side LINE configuration categories:

- LINE Login channel ID and secret;
- Messaging channel secret and channel access token;
- `LINE_WORKER_SECRET` for worker invocation;
- allowed callback/return/public web URL configuration.

Supabase runtime credentials/service-role access remain server-side. Never copy any of these values into an Expo or Next public environment variable, screenshots, docs, client code, or git history.

## KNOWN ISSUE

- Successful local code does not make LINE Login live. LINE console channel publication/review, callback URL, webhook URL/HMAC secret, connected Official Account, and customer friendship/configuration are external prerequisites.
- A LINE Login channel in developing status can return a LINE `400 Bad Request` saying the user needs a developer role. That is a LINE console/channel-state constraint, not an Expo UI defect.
- The remote Edge Function secrets, deployed function revisions, webhook configuration, worker schedule, and LINE console settings were not verified in this documentation task.
- Do not diagnose missing delivery by retrying from the client; inspect delivery rows/function logs with authorized access and retain error details safely.

## PLANNED

The local task migration retains the existing distance-based arriving notification mechanism and adds arrival/task operational events. Remote execution remains unverified. Any future change to thresholds, opt-in behavior, or channel fan-out is **PLANNED** and must preserve rate limiting/deduplication plus a fallback when GPS/route data is unavailable.

## DO NOT CHANGE WITHOUT REVIEW

- Function JWT settings, callback validation, state/PKCE/nonce handling, webhook HMAC verification, or opaque order-link authorization.
- Delivery queue claim/retry/skip logic and worker secret behavior.
- Any message content that exposes address, payment, or tracking information without validating the connected LINE customer/order.
- Realtime policies/publication membership, which can expose data independently of notification UI.
