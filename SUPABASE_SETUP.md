# Super Shine V1.1 — Supabase setup

Customer and admin routes use the same Supabase project. Perform these steps once. The V1.1 migration is non-destructive and preserves existing users and orders.

## 1. Apply the database upgrade

If this is a brand-new Supabase project, run `supabase/schema.sql` first. For the existing Super Shine project, do not rerun the old schema.

In **Supabase Dashboard → SQL Editor**:

1. Open `supabase/migrations/20260714_super_shine_v1_1.sql`.
2. Copy the complete file into a new query.
3. Select **Run** once.
4. Confirm the result says success. “No rows returned” is normal.

Then apply `supabase/migrations/20260718_customer_verification_benefits_security.sql` in a second SQL Editor query. Do not edit or rerun the historical migration. This adds verified-phone state, customer eligibility RPCs, free-pickup ledger records, atomic checkout enforcement, and upload hardening without changing realtime.

The migration adds V1.1 columns/tables, constraints, indexes, RLS, private storage, realtime publication entries, seeded service metadata, coupons, and pickup slots. It does not drop customer/order tables.

## 2. Create and approve the admin

1. Open **Authentication → Users → Add user**.
2. Create the owner's email and a strong password. Turn on **Auto Confirm User** for this manually-created account.
3. Run this SQL with the exact email:

```sql
update public.profiles
set role = 'admin'
where email = 'owner@supershine.app';
```

Verify it worked:

```sql
select email, role from public.profiles where email = 'owner@supershine.app';
```

Only a profile whose role is `admin` can read operational customer records or update admin-controlled data. A hidden URL alone never grants access.

## 3. Authentication settings

In **Authentication → Providers**:

- Keep Email enabled.
- Enable **Allow anonymous sign-ins** for “Continue in demo mode.” Demo profiles and orders are labelled and excluded from real revenue.
- Enable **Phone** and configure a supported SMS provider. Keep provider-side OTP expiry, retry limits, and rate limits enabled. Test delivery to `+66` Thai mobile numbers before accepting real orders.

In **Authentication → URL Configuration**:

- Set **Site URL** to the final hosted customer URL.
- Add these redirect URLs while developing and after deployment:
  - `supershine://reset-password`
  - `http://localhost:8081/reset-password`
  - `https://YOUR-PERMANENT-SITE/reset-password`

For easiest school testing, you may disable email confirmation during the supervised demo. If confirmation stays enabled, configure the email template and tell testers to open the confirmation email before signing in.

## 4. Frontend connection

Copy `.env.example` to `.env` and enter **Project Settings → API → Project URL** and the **publishable key**:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Restart Expo after changing `.env`. Never place a service-role or secret key in the app.

## 5. Business configuration

Sign in at `/admin`, then open **Settings** to configure:

- store name/status/opening hours
- pickup and delivery fees
- business phone and LINE link
- service availability/prices/units/turnaround
- pickup-slot capacity and availability
- PromptPay QR image
- coupon activation, title, value, minimum order, expiry, and usage limits

Advanced slot creation can also be performed in **Table Editor**. Initial coupon rules are:

- `FRESH20`: 20% off, minimum ฿200, one use per customer
- `FREEPICKUP`: free pickup fee, with expiry
- `BEDDING50`: ฿50 off Bedding Care, one use per customer

Per-customer coupons require a verified phone after the V1.4 security migration. `FRESH20` is consumed once per verified profile. Verified real profiles receive five automatically applied free pickups; an allowed withdrawal before pickup confirmation restores that pickup use.

## 6. Storage and realtime

The migration creates:

- private `order-uploads` for laundry photos and payment slips
- public `business-public` for the business PromptPay QR

Do not make `order-uploads` public. Private files are opened by admins through short-lived signed URLs.

The migration adds orders, history, payments, notifications, support, and pickup slots to Supabase Realtime. No manual refresh is required, but every screen also retains a retry/refresh fallback.

## 7. Permanent free web/QR deployment

Build the static web app:

```bash
npx expo export --platform web --output-dir dist-web
```

Deploy the `dist-web` folder to a free static host such as Cloudflare Pages, Netlify, or Vercel. Configure the same two `EXPO_PUBLIC_*` environment variables on the host and rebuild there, or upload the locally built folder.

After deployment:

1. Add the final URL to Supabase Auth URL Configuration.
2. Test `/`, `/reset-password`, and `/admin`.
3. Generate one QR code that contains the final HTTPS customer URL.
4. Print/share that QR. Testers will no longer need your terminal or computer.

The admin can use `https://YOUR-PERMANENT-SITE/admin`; professors use the main URL and may choose demo mode.

## Security verification

Before demonstration, test with two separate customer accounts:

- Customer A cannot read Customer B's profile, address, order, notification, support, payment, or uploads.
- A normal customer opening `/admin` is denied.
- Private upload URLs expire.
- Demo orders do not appear in real revenue totals.
