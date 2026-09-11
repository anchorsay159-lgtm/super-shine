# Super Shine LINE integration

LINE is implemented as a downstream notification channel. The existing Supabase notification row is written first; an `after insert` trigger creates one idempotent LINE delivery row. A worker claims those rows, checks the customer’s current connection/preferences, and calls the LINE Messaging API with a stable `X-Line-Retry-Key`. Order, payment, pricing, accounting, and customer realtime logic do not call LINE directly.

## Supabase objects

Apply `supabase/migrations/20260907_line_notifications.sql` after the existing migrations. It creates `line_connections`, short-lived `line_link_attempts`, `line_webhook_events`, and the retryable `line_notification_deliveries` outbox. It also adds a nullable `notifications.source_event_key` for payment-due idempotency, plus security-definer status/claim/finish RPCs. RLS denies direct customer access to LINE IDs, OAuth attempts, webhook rows, and delivery payloads.

Deploy these Edge Functions:

- `line-connect-start` — authenticated account link status/start/finish/preferences/disconnect.
- `line-connect-callback` — public LINE Login OAuth callback; validates state, PKCE, nonce, ID token, and friendship status.
- `line-webhook` — public Messaging API webhook; verifies the raw-body HMAC signature and handles idempotent follow/unfollow events only.
- `line-notifications-worker` — private worker protected by `LINE_WORKER_SECRET`; sends text messages and records accepted, skipped, or retryable failure states.
- `line-order-link` — public opaque-link redirect that resolves a signed customer-facing order number to the existing authenticated web order route.

## Secrets

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add the values privately. Do not add any of them to Expo `EXPO_PUBLIC_*`, Next `NEXT_PUBLIC_*`, Git, or browser code:

```
LINE_LOGIN_CHANNEL_ID
LINE_LOGIN_CHANNEL_SECRET
LINE_MESSAGING_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_WORKER_SECRET                 # generate a long random value
LINE_LOGIN_CALLBACK_URL            # optional; use the exact URL below if omitted
LINE_ALLOWED_RETURN_URLS           # comma-separated exact app/web return URLs
LINE_PUBLIC_WEB_URL                # customer web origin used by View order links
```

The function receives the normal Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically.

## LINE Developers values

Project ref: `tozgpzdvddjtcdzhgbqa`

**LINE LOGIN CALLBACK URL**

`https://tozgpzdvddjtcdzhgbqa.supabase.co/functions/v1/line-connect-callback`

Paste it in the LINE Login channel → LINE Login → Callback URL. The same URL must be in `LINE_LOGIN_CALLBACK_URL` if that secret is set.

Before inviting real customers, open the LINE Login channel and click the
**Developing** status at the top, then publish the channel. A developing
channel accepts only Admin and Tester accounts; every normal customer receives
the LINE 400 “User need to have developer role” page. Publishing is a LINE
Console setting and cannot be changed by an app deployment.

In the LINE Login tab, link the **Super Shine Laundry** Official Account under
**Linked OA**. The authorization request uses `bot_prompt=aggressive`, so a
customer who has not followed the Official Account sees the add-friend step as
part of connecting.

**LINE MESSAGING WEBHOOK URL**

`https://tozgpzdvddjtcdzhgbqa.supabase.co/functions/v1/line-webhook`

Paste it in the Messaging API channel → Messaging API → Webhook URL. Deploy the function first, then click **Verify**. Enable **Use webhook** after Verify succeeds. Do not enable webhook chatbot behavior; this endpoint handles follow/unfollow state only.

Recommended `LINE_PUBLIC_WEB_URL` is `https://super-shine.expo.app` if that is the deployed customer web origin. View-order links contain an opaque signature, not a database UUID; the server redirects to the existing authenticated customer order route.

Recommended `LINE_ALLOWED_RETURN_URLS` values for this project are the deployed customer web callback and the existing Expo scheme. Keep only URLs that are actually deployed:

```
https://super-shine.expo.app/line-callback
https://super-shine.expo.app/profile
supershine://line-callback
```

If the customer web is deployed at a different origin, replace the `super-shine.expo.app` entries with that exact HTTPS origin. Never allow `*`, arbitrary query strings, or an untrusted hostname.

## Worker scheduling

The worker is deliberately not called by an order/payment transaction. Schedule it once per minute with Supabase Cron/`pg_cron` + `pg_net`, using the worker URL and `LINE_WORKER_SECRET` from Vault or another server-side secret store. The request must include:

```
x-line-worker-secret: <LINE_WORKER_SECRET>
```

Do not put that header in either customer app. If Cron is unavailable, call the worker from a private server-side scheduler. A row is retried at most eight times with bounded backoff; disabled/unconnected/blocked customers are marked skipped.

For this Supabase project, store the same value used by the Edge Function's
`LINE_WORKER_SECRET` as a Vault secret named `line_worker_secret`, then apply
`supabase/migrations/20260908_line_notifications_worker_schedule.sql` and
`supabase/migrations/20260908120000_line_notifications_realtime_dispatch.sql`.
The realtime trigger wakes the worker immediately after each new delivery is
committed. The `super-shine-line-notifications-worker` Cron job also invokes it
once per minute as a retry and recovery sweep. Neither path exposes the secret
to either customer application.

## Account-linking flow

The signed-in customer requests a short-lived state, nonce, PKCE verifier, and one-use finalization secret. The server stores only hashes of state/finalization secret and the temporary verifier. LINE redirects to the public callback. The authorization request uses the existing `openid profile` scopes; the profile scope is sufficient for LINE’s friendship-status endpoint. The callback exchanges the code server-side, validates the ID token’s `sub`, audience, expiry, and nonce, checks friendship status, and stores the verified LINE ID only on the pending attempt. The original authenticated customer then finalizes the attempt. A LINE ID already linked to another customer is rejected. The finalization secret is removed after success, cancellation, or expiry.

Disconnecting clears the stored LINE ID and disables LINE delivery; app notifications, orders, payments, receipts, and accounting remain unchanged. Reconnecting is supported.

## Message behavior

Order messages are generated only from the existing meaningful notification events and use fulfillment-aware wording. Payment due/confirmed/failed/refunded messages are downstream from payment/pricing transitions. Messages use a branded, color-coded LINE Flex card with a concise notification preview and a View order button; the Official Account name is not repeated inside the message. They use the customer’s existing five-language profile setting (`en`, `th`, `my`, `bn`, `dz`) and include only the customer-facing order number, amount where applicable, short status text, and the existing customer tracking URL. No address, note, UUID, token, accounting data, or payment credential is sent.

LINE API acceptance is recorded as `sent`; it is not treated as proof that a customer read the message. The LINE retry key and immutable delivery row protect retries from duplicate sends. HTTP 429/5xx/timeouts retry; permanent 4xx/block cases are skipped and retained for audit.

## Test procedure

1. Apply the migration and deploy all five functions.
2. Set the secrets, exact callback URL, and allowlisted return URLs.
3. Configure the webhook URL, click Verify, then enable Use webhook.
4. Add **Super Shine Laundry** as a friend in a personal LINE account.
5. Sign in to the same Super Shine customer account, open Profile → Notifications, and select Connect LINE.
6. Confirm the screen returns as Connected, then toggle order/payment preferences and refresh.
7. From Admin, move a non-demo order through accepted, pickup/receipt/ready/delivery milestones. Confirm one LINE message per meaningful status transition and an app notification for the same event.
8. Confirm final-price/payment-due, PromptPay confirmed/failed, and refund events. Verify accounting rows are unchanged by LINE delivery.
9. Repeat an admin save without changing status; confirm no new delivery row. Re-run the worker or deliver a duplicate webhook event; confirm no duplicate send/state update.
10. Disconnect and verify new deliveries are skipped while app notifications continue.

Without the project’s private LINE credentials and a deployed Supabase project, local checks can validate source, SQL shape, OAuth/signature helpers, and mocked API behavior only; they cannot prove that a real LINE account receives a message.
