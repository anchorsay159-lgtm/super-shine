# Customer security and navigation audit

Audit date: 2026-07-18. Scope: customer routes, shared data access, authentication, checkout RPCs, storage, and the new migration. Admin UI files and Supabase realtime subscriptions were not changed.

## Navigation audit

| Source | Destination and parameters | Guard and failure behavior | Result |
|---|---|---|---|
| Welcome | `/auth?mode=signup|signin`, `/(tabs)` for demo | Auth errors stay inline; authenticated users redirect to tabs | Pass |
| Sign in / registration | `/(tabs)` | Central tabs gate sends real unverified profiles to `/verify-phone`; demo bypass is explicit | Pass |
| Phone verification | `/(tabs)`, `/auth`, back for phone changes | Submit lock, six-digit validation, 60-second resend UI cooldown, Supabase server rate limits, readable errors | Pass; SMS delivery is manual |
| Home notifications | `/notifications` | Existing empty/loading/error states retained | Pass |
| Home active order | `/order-tracking?orderId=<uuid>` | Tracking resolves only an order already loaded under owner RLS; missing order shows recovery action | Pass |
| Home “View all” services | `/services` | Destination exists; inactive services are removed and an all-unavailable state is shown | Pass |
| Home service / pickup | `/new-order?service=<id>` | Only currently enabled IDs are accepted; stale IDs are discarded | Pass |
| Home / offers coupon | `/new-order?coupon=<code>` | Only server-returned eligible coupon codes are accepted; used, expired, exhausted, inactive, or unverified-profile offers are absent | Pass |
| Home repeat order | `/new-order?repeatOrderId=<uuid>` | Order must belong to loaded customer; inactive items are removed during restore | Pass |
| Orders | Tracking, repeat, withdrawal, support | Existing order ownership, withdrawal RPC rules, confirmation UI, and order ID propagation retained | Pass |
| Notifications | Tracking or offers | Unknown links are not followed; order IDs remain attached to their order | Pass |
| Profile | `/account?section=<known section>` | Unknown section falls back to personal information | Pass |
| Checkout success | `/order-success` then tracking/home | Result parameters come from successful RPC response; duplicate submission lock prevents a second request | Pass |
| Password reset | `/forgot-password`, `/reset-password` | Existing Supabase recovery flow and back behavior retained | Pass |

Touch targets and accessibility roles/labels were retained on existing navigation controls. The verification form uses labelled inputs, alert text, one-time-code hints, disabled/loading states, and keyboard-safe layout. Native back, modal close, web routes, and narrow layouts still use Expo Router’s existing stack behavior.

## RLS and data access audit

| Resource | Customer access | Admin/system access | Enforcement |
|---|---|---|---|
| `profiles` | Read/update own profile | Admin reads/updates; auth trigger creates profile | RLS plus role-protection and verification-field trigger |
| `addresses` | CRUD own rows | Admin access | `user_id = auth.uid()` or admin |
| `services`, `service_options` | Read enabled/active catalogue | Admin manages all | Public active-read policies; admin write policies |
| `business_settings` | Read customer-facing settings | Admin writes | Public read, admin write |
| `pickup_slots` | Read enabled future slots | Admin writes | Public availability policy; capacity rechecked under row lock in checkout |
| `coupons` | Read active campaign metadata | Admin writes | Active-date RLS; profile eligibility comes from security-definer RPC |
| `coupon_usage` | Read own usage | Admin reads | No customer insert/update policy; checkout RPC writes atomically |
| `profile_pickup_benefit_usage` | Read own ledger | Admin reads | No customer write policy; checkout/withdraw RPCs write atomically |
| `orders` | Read own orders | Admin operational update/delete | Direct customer insert/update removed; safe RPCs only |
| `order_items`, history | Read through owned order | Admin writes/reads | Ownership subquery or admin |
| `payments` | Read own | Admin verifies | No customer update policy; upload RPC performs allowed transition |
| `notifications` | Read/update own read state | Admin access | Ownership RLS |
| `support_messages` | Read own; insert only as own customer sender and owned order | Admin replies | RLS validates user, sender role, and order ownership |
| `uploaded_files` | Read/insert/delete own metadata | Admin access | Ownership RLS; registration RPC validates order, type, path, MIME, and size |
| `order-uploads` bucket | Private own-order JPG/PNG/WebP, max 10 MB | Admin reads | Private bucket; folder ownership, owned-order, extension, MIME, and size policy |
| `business-public` bucket | Public read for PromptPay QR | Admin manages | Intentionally public business asset; no customer write |

## Server business rules

- Phone verification is sourced from `auth.users.phone_confirmed_at`, normalized to Thai E.164, copied through `sync_verified_phone_v14`, and protected by a unique partial index for real verified profiles. The frontend cannot mark a number verified.
- Real profiles without a verified phone are rejected by `place_order_v11`. Anonymous demo profiles remain isolated and do not consume real pickup benefits.
- Profile rows are locked before coupon and pickup-benefit checks. Coupon campaign rows and pickup-slot rows are also locked, preventing concurrent limit/capacity races.
- `FRESH20` (and `FRESH` if present) is set to one use per verified profile. Per-customer coupons automatically require a verified phone.
- Each verified real profile starts with five free pickup uses. A ledger row is created with the order. An allowed early customer withdrawal restores the pickup use; after pickup confirmation it cannot be customer-withdrawn and is not restored.
- Coupon use is consumed when the order is successfully created and is not restored on withdrawal. This keeps campaign and first-profile limits deterministic and auditable.
- Services, prices, fees, coupon math, slot capacity, and totals are still resolved inside `place_order_v11`. The client estimate mirrors the rule, but the server remains authoritative.
- Historical order item names, prices, and totals stay stored on each order even when a service later becomes inactive.

## Privacy and security findings

| Area | Finding | Status |
|---|---|---|
| Secrets | Frontend uses only `EXPO_PUBLIC_SUPABASE_URL` and the publishable key; no service-role key or private credential was found | Pass |
| Logs | No customer/auth/payment data logging exists in application source | Pass |
| Sessions | Supabase sessions use the existing AsyncStorage adapter | Accepted limitation; device storage security depends on the platform |
| Checkout drafts | AsyncStorage contains service selections, address/contact draft, notes, and local photo references; never OTPs, passwords, service keys, or payment-slip bytes | Documented limitation; cleared after successful order |
| OTP | OTP generation, expiry, attempt limits, and server rate limiting are delegated to Supabase Auth and the configured SMS provider | Manual configuration/test required |
| Uploads | Client and RPC enforce image allowlist and 10 MB maximum; storage remains private | Pass after migration |
| Demo boundary | Server reads `profiles.is_demo`; client `p_is_demo` cannot turn a real profile into demo or vice versa | Pass |
| Admin boundary | Admin routes still require an admin role and RLS remains the data boundary | Unchanged; manual two-account test required |
| Realtime | No subscription, publication, polling, or realtime migration was added or changed | Preserved |

## Manual verification still required

1. Apply `20260718_customer_verification_benefits_security.sql` to a staging Supabase project.
2. Configure a Supabase Phone Auth SMS provider and allowed Thailand delivery; verify OTP expiry, resend rate limits, and wrong-code limits in the provider settings.
3. Test with two real customers, one demo customer, and one admin. Confirm cross-account reads/writes fail and customer routes cannot access admin data.
4. Race two order submissions for the same profile, the last pickup slot, and the last campaign use; confirm one atomic result where the limit is one.
5. Verify the first five eligible real orders waive pickup, the sixth charges it, an early withdrawal restores one, and coupon use does not restore.
6. Turn every service off in admin and verify home/services/checkout states, then re-enable one and verify it returns without restarting.
7. Upload valid and invalid/oversize images and confirm private signed access for staff.

