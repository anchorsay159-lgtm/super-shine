# Super Shine V1.4.0

Super Shine is a mobile-first laundry pickup and delivery system. One Expo Router project now contains:

- the customer app at `/`
- the protected owner dashboard at `/admin`
- Supabase authentication, database, storage, Row Level Security, and realtime updates
- English, Thai, Burmese, Bengali, and Dzongkha language selection

## New in V1.4.0

- Redesigned the customer welcome, sign-in, registration, password-reset, home, checkout, orders, tracking, offers, profile, account, and notification experiences without changing admin visuals
- Added a customer-only design system with accessible 44-point controls, compact cards, inline feedback, status badges, skeleton/empty states, sticky actions, confirmation sheets, and responsive desktop widths
- Added resumable five-step checkout drafts with restore/discard, safe revalidation of services, addresses, coupons, and Asia/Bangkok pickup slots, plus duplicate-submission protection
- Added service-specific options, compact quantity controls, grouped pickup slots, coupon eligibility explanations, editable review sections, and clear estimated-price approval copy
- Preserved `place_order_v11`, authoritative server pricing, private uploads, Supabase RLS, demo separation, realtime order/notification updates, Expo Go, and remote tunnel QR testing
- Expanded customer translations and wrapping behavior for English, Thai, Burmese, Bengali, and Dzongkha
- Added server-derived Thai phone verification, profile-unique verified phones, atomic one-use welcome coupons, and a five-free-pickup ledger
- Added server-filtered promotion visibility, inactive-service recovery states, upload validation, and focused customer-rule tests

Apply `supabase/migrations/20260718_customer_verification_benefits_security.sql` after the V1.1 migration. Checkout drafts are stored locally with AsyncStorage and are cleared only after confirmed order creation. See [CUSTOMER_SECURITY_NAVIGATION_AUDIT.md](./CUSTOMER_SECURITY_NAVIGATION_AUDIT.md) for the verified policy, navigation, privacy, and manual-test matrix.

## New in V1.3.3

- Added Expo tunnel mode so a tester can open the customer app from a different Wi-Fi or mobile network
- Added `start-remote-test.cmd` for one-click remote testing on Windows

## New in V1.3.2

- Fixed tab navigation crashes caused by Supabase realtime channel names being reused across mounted screens
- Realtime subscriptions now get unique instance names while preserving all existing database listeners

## New in V1.3.1

- Restored the public Supabase environment configuration required by the admin and customer sign-in flows
- Added a clear setup message when the Supabase environment variables are missing

## New in V1.3

- Fixed desktop operations shell with a responsive sidebar, global search, branch state, notifications, and admin profile menu
- Task-focused Overview with five operational metrics, action queues, a nine-stage pipeline, schedules, recent activity, and deadline alerts
- Compact Orders workspace with saved views, advanced filters, sorting, pagination, multi-select, safe bulk transitions, responsive cards, and an order preview drawer
- Two-column order detail with centralized status transitions, payment verification, pickup rescheduling, readable preferences, pricing, files, messages, timeline, and private notes
- Date-aware Reports dashboard with previous-period comparisons, revenue and service analysis, timing rates, payment breakdowns, coupon impact, and real-order CSV export
- Categorized Settings workspace that preserves business, slot, service, payment, PromptPay, promotion, and demo-data controls
- Loading, empty, error, success, disabled, confirmation, focus, and responsive states throughout the admin experience
- Customer app screens and Supabase data flow remain unchanged

The existing navy, teal, white, pastel blue, yellow, and red identity is preserved. Service prices, coupons, pickup slots, store availability, profiles, orders, payments, notifications, uploads, support, and reports use real Supabase records. No service-role key is used in this frontend.

## Implemented in V1.1

- Customer registration, login, persistent sessions, password reset, and anonymous demo mode
- Approved-role admin login and protected admin routes
- Five-step multi-service order flow with preferences, addresses, live pickup capacity, payment, coupons, review, and confirmation
- Server-side price/coupon/slot calculation through `place_order_v11`
- Current/past orders, withdrawal before confirmation, receipts, repeat order, full status timeline, and price approval
- Cash on pickup, cash on delivery, PromptPay QR, private payment-slip upload, and admin verification
- Supabase realtime customer/admin order, payment, notification, and support updates
- Active Supabase offers only; subscriptions, points, savings, and referrals are hidden
- Real profile data, saved addresses, language persistence, notification settings, and support messages
- Admin metrics, real-only revenue reports, search/filtering, demo separation, order processing, price approval, payment verification, private comments, support replies, private uploads, services/prices, business hours, fees, PromptPay QR, pickup-slot capacity, and coupon controls

## Start locally

1. Install Node.js LTS and open this folder in VS Code.
2. Run `npm.cmd install` on Windows (`npm install` on macOS/Linux).
3. Complete [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).
4. Run `npm.cmd run start:lan` on Windows.
5. Open the web link or scan the QR with Expo Go.

## Test with a friend on another network

Your friend does not need to use the same Wi-Fi when Expo tunnel mode is running.

1. Ask your friend to install the latest Expo Go app.
2. Confirm this project has its working `.env` file with the existing Supabase settings.
3. Double-click `start-remote-test.cmd`, or run `npm.cmd run start:remote` in VS Code.
4. Send your friend a screenshot of the QR code, or copy and send the `exp://` link printed in the terminal.
5. Keep your computer and the terminal running while your friend tests.

If the tunnel times out, temporarily turn off any VPN or proxy, allow Node.js, Expo, and ngrok through Windows Firewall, and run `npm.cmd run start:remote:clear`. Trying a mobile hotspot can also help on a restricted network.

If the QR image is displayed on your friend's phone, send the link instead so they can tap it. This development QR is temporary and can change after the Expo server restarts. For a permanent installable test version, use an EAS preview build, TestFlight, or Google Play internal testing later.

## Routes

- Customer: `/`
- Admin: `/admin`

## Environment variables

Copy `.env.example` to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

These are Supabase public frontend values. Never add a `service_role` or secret key.

## Checks

```bash
npm run check
npx expo install --check
npx expo export --platform ios
npx expo export --platform web
```

## Main folders

- `src/app`: customer and admin routes
- `src/context`: authenticated Supabase data/session layer
- `src/i18n/locales`: structured language dictionaries
- `src/lib`: Supabase client and domain mapping/calculation helpers
- `supabase/migrations`: non-destructive database upgrades

Super Shine V1.4.0 uses Asia/Bangkok for operational times and Thai baht (`฿`) for prices.
