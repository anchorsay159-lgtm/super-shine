import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { customerErrorCode, freePickupDiscount, normalizeThaiPhone } from '../src/lib/customer-rules.ts';
import { passwordRecoveryTokens } from '../src/lib/password-recovery.ts';

const contextSource = readFileSync('src/context/app-context.tsx', 'utf8');
const authSource = readFileSync('src/app/auth.tsx', 'utf8');
const routesSource = [
  '../src/app/index.tsx', '../src/app/auth.tsx', '../src/app/order-success.tsx',
].map((path) => readFileSync(path.replace('../', ''), 'utf8')).join('\n');
const homeSource = readFileSync('src/app/(tabs)/home.tsx', 'utf8');
const checkoutSource = readFileSync('src/app/new-order.tsx', 'utf8');
const adminSettingsSource = readFileSync('src/app/admin/settings.tsx', 'utf8');
const translationsSource = readFileSync('src/i18n/index.ts', 'utf8');
const repairMigration = readFileSync('supabase/migrations/20260719_coupon_targets_service_catalog.sql', 'utf8');

test('phone is normalized locally without any OTP API calls', () => {
  assert.equal(normalizeThaiPhone('092-721-8119'), '+66927218119');
  assert.doesNotMatch(contextSource, /verifyOtp|phone_change|requestPhoneVerification|get_customer_eligibility_v14/);
});

test('unknown technical responses are reduced to a safe translated code', () => {
  assert.equal(customerErrorCode('{"headers":{"set-cookie":"secret"},"url":"internal"}'), 'UNKNOWN_ERROR');
});

test('demo uses isolated local state and never calls Supabase Auth or the real order RPC', () => {
  assert.match(contextSource, /DEMO_SESSION_KEY/);
  assert.match(contextSource, /DEMO_ORDERS_KEY/);
  assert.doesNotMatch(contextSource, /signInAnonymously/);
  const demoHandler = contextSource.slice(contextSource.indexOf('const continueDemo'), contextSource.indexOf('const requestPasswordReset'));
  assert.doesNotMatch(demoHandler, /supabase\.auth|signInWithPassword|signUp|signInWithOtp/);
  assert.match(contextSource, /p_is_demo: false/);
  assert.equal(freePickupDiscount(30, 5, true), 30);
});

test('existing customer login is not blocked by signup-only validation or stale demo state', () => {
  assert.match(routesSource, /mode === 'signup' && password\.length < 8/);
  assert.match(routesSource, /if \(!password\) next\.password = app\.t\('PASSWORD_REQUIRED'\)/);
  assert.match(contextSource, /signInWithPassword\(\{ email: email\.trim\(\)\.toLowerCase\(\), password \}\)/);
  assert.match(contextSource, /signInWithPassword[\s\S]*demoModeRef\.current = false;[\s\S]*AsyncStorage\.multiRemove\(\[DEMO_SESSION_KEY, DEMO_USAGE_KEY, DEMO_ORDERS_KEY\]\)/);
  assert.match(contextSource, /const signIn[\s\S]*setDataError\(null\);[\s\S]*signInWithPassword/);
  assert.match(routesSource, /app\.authLoading \|\| app\.passwordRecoveryActive \|\| !app\.userId \|\| app\.dataError === 'PROFILE_LOAD_FAILED'/);
  assert.doesNotMatch(authSource, /result\.needsEmailConfirmation[\s\S]*router\.replace\('\/\(tabs\)\/home'\)/);
});

test('authentication failures are customer-safe and profile errors preserve the session for retry', () => {
  assert.match(contextSource, /AUTH_TOO_MANY_ATTEMPTS/);
  assert.match(contextSource, /AUTH_CAPTCHA_FAILED/);
  assert.match(contextSource, /AUTH_NETWORK_ERROR/);
  assert.match(contextSource, /throw new Error\('PROFILE_LOAD_FAILED'\)/);
  assert.match(routesSource, /app\.refresh\(\)/);
  assert.match(translationsSource, /You signed in, but your profile could not be loaded\./);
  assert.match(contextSource, /persistSession: true|auth\.getSession\(\)/);
});

test('password recovery imports native tokens and wins routing over signed-in redirects', () => {
  const parsed = passwordRecoveryTokens('supershine://reset-password#access_token=access&refresh_token=refresh&type=recovery');
  assert.deepEqual(parsed, { accessToken: 'access', refreshToken: 'refresh', isRecovery: true });
  assert.match(contextSource, /HOSTED_PASSWORD_RESET_URL/);
  assert.match(contextSource, /event === 'PASSWORD_RECOVERY'/);
  assert.match(contextSource, /supabaseClient\.auth\.setSession/);
  assert.match(routesSource, /passwordRecoveryActive[\s\S]*Redirect href="\/reset-password"/);
});

test('real coupon eligibility is account-backed and home routes are explicit', () => {
  assert.match(contextSource, /rpc\('get_eligible_coupons_v15'\)/);
  assert.match(contextSource, /result\.error\?\.code === 'PGRST202'/);
  assert.match(contextSource, /from\('coupon_usage'\)\.select\('coupon_code'\)\.eq\('user_id', accountId\)/);
  assert.match(routesSource, /\/\(tabs\)\/home/);
  assert.doesNotMatch(routesSource, /router\.replace\('\/\(tabs\)'\)/);
});

test('legacy coupon schema remains usable until the advanced migration is deployed', () => {
  assert.match(adminSettingsSource, /couponSchemaFields\.has\('discount_target'\)/);
  assert.match(adminSettingsSource, /legacyType/);
  assert.match(adminSettingsSource, /discount_type: 'fixed'/);
  assert.match(adminSettingsSource, /Deploy the coupon database migration/);
  assert.match(adminSettingsSource, /deleteCoupon/);
  assert.match(adminSettingsSource, /delete\(\)\.eq\('code', coupon\.code\)/);
  assert.match(adminSettingsSource, /Redemption and order history was preserved/);
});

test('inactive services stay visible in the catalog and are blocked at checkout and on the server', () => {
  assert.match(homeSource, /services\.map\(/);
  assert.match(homeSource, /Temporarily unavailable/);
  assert.match(checkoutSource, /services\.filter\(\(service\) => service\.enabled\)/);
  assert.match(checkoutSource, /inactiveSelectedIds/);
  assert.match(repairMigration, /where id = item ->> 'serviceId' and enabled = true/);
  assert.match(repairMigration, /services_public_read_catalog/);
});

test('coupon redemption remains transactional and stores immutable calculation snapshots', () => {
  assert.match(repairMigration, /from public\.coupons[\s\S]*for update/);
  assert.match(repairMigration, /per_customer_limit is not null and usage_value >= coupon_row\.per_customer_limit/);
  assert.doesNotMatch(repairMigration, /first_verified_profile_only/);
  assert.match(repairMigration, /coupon_code_snapshot/);
  assert.match(repairMigration, /insert into public\.coupon_usage/);
  assert.match(repairMigration, /usage_count = usage_count \+ 1/);
});
