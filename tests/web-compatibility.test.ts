import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const symbolSource = readFileSync('src/components/symbol.tsx', 'utf8');
const webSymbolSource = readFileSync('src/components/symbol.web.tsx', 'utf8');
const tabsSource = readFileSync('src/app/(tabs)/_layout.tsx', 'utf8');
const adminUiSource = readFileSync('src/admin/admin-ui.tsx', 'utf8');
const adminOrderSource = readFileSync('src/app/admin/order/[id].tsx', 'utf8');
const rootHtmlSource = readFileSync('src/app/+html.tsx', 'utf8');
const customerWebCss = readFileSync('src/styles/customer-web.css', 'utf8');
const notFoundSource = readFileSync('src/app/+not-found.tsx', 'utf8');
const appContextSource = readFileSync('src/context/app-context.tsx', 'utf8');
const supabaseSource = readFileSync('src/lib/supabase.ts', 'utf8');
const brandSource = readFileSync('src/components/super-ui.tsx', 'utf8');
const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
const webManifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

test('native symbols retain the Expo-supported fallback while web uses vector icons', () => {
  assert.match(symbolSource, /fallback=\{browserFallback\}/);
  assert.match(symbolSource, /Platform\.OS === 'android'/);
  assert.match(webSymbolSource, /MaterialCommunityIcons/);
  assert.match(webSymbolSource, /'dry-cleaning': 'creation'/);
  assert.match(webSymbolSource, /'iron': 'weather-windy'/);
  assert.match(webSymbolSource, /'event': 'calendar-plus-outline'/);
});

test('customer tabs use the presentation icon family across native and web', () => {
  assert.match(tabsSource, /from 'lucide-react-native\/icons\/house'/);
  assert.match(tabsSource, /home: House/);
  assert.match(tabsSource, /orders: ReceiptText/);
  assert.match(tabsSource, /offers: TicketPercent/);
  assert.match(tabsSource, /profile: UserRound/);
  assert.match(tabsSource, /strokeWidth=\{focused \? 2\.2 : 1\.8\}/);
});

test('admin login translates safe authentication codes instead of displaying them raw', () => {
  assert.match(adminUiSource, /t\(result\.error\)/);
  assert.doesNotMatch(adminUiSource, /:\s*result\.error\);/);
});

test('unknown routes render a branded responsive recovery screen', () => {
  assert.match(notFoundSource, /Page not found/);
  assert.match(notFoundSource, /router\.replace\('\/'\)/);
  assert.match(notFoundSource, /Return to Super Shine/);
});

test('admin and customer browser tabs persist independent Supabase sessions', () => {
  assert.match(supabaseSource, /\^\\\/admin\(\?:\\\/\|\$\)\//);
  assert.match(supabaseSource, /isAdminWebRoute \? `\$\{defaultWebAuthStorageKey\}-admin` : defaultWebAuthStorageKey/);
  assert.match(supabaseSource, /storageKey: webAuthStorageKey/);
  assert.match(supabaseSource, /isAdminWebRoute \? 'admin_web' : 'customer_web'/);
  assert.match(appContextSource, /const savedDemo = isAdminWebRoute \? null : await AsyncStorage\.getItem\(DEMO_SESSION_KEY\)/);
  assert.equal((supabaseSource.match(/createClient\(/g) || []).length, 1);
});

test('admin order mutations reconcile quietly and realtime events are batched', () => {
  assert.match(adminOrderSource, /const load = useCallback\(async \(quiet = false\)/);
  assert.match(adminOrderSource, /if \(!quiet\) setLoading\(true\)/);
  assert.match(adminOrderSource, /setTimeout\(\(\) => \{[\s\S]*?void load\(true\);[\s\S]*?\}, 80\)/);
  assert.match(adminOrderSource, /setFeedback\(success\); await load\(true\)/);
});

test('the static admin index canonicalizes before hydration', () => {
  assert.match(rootHtmlSource, /location\?\.pathname==='\/admin'/);
  assert.match(rootHtmlSource, /location\.replace\('\/admin\/'/);
  assert.match(rootHtmlSource, /<script dangerouslySetInnerHTML=/);
});

test('official branding is configured for native icons and installable web metadata', () => {
  assert.equal(appConfig.expo.name, 'Super Shine');
  assert.equal(appConfig.expo.ios.icon, './assets/images/icon.png');
  assert.equal(appConfig.expo.android.adaptiveIcon.foregroundImage, './assets/images/android-icon-foreground.png');
  assert.equal(appConfig.expo.web.favicon, './assets/images/favicon.png');
  assert.match(brandSource, /super-shine-full\.png/);
  assert.match(brandSource, /super-shine-symbol\.png/);
  assert.match(rootHtmlSource, /rel="manifest" href="\/manifest\.webmanifest\?v=3"/);
  assert.match(rootHtmlSource, /rel="apple-touch-icon"/);
  assert.equal(webManifest.display, 'standalone');
  assert.equal(webManifest.icons.length, 3);
  for (const icon of ['public/icons/apple-touch-icon.png', 'public/icons/favicon-32.png', 'public/icons/pwa-192.png', 'public/icons/pwa-512.png', 'public/icons/pwa-maskable-512.png']) {
    assert.equal(existsSync(icon), true, `${icon} must exist`);
  }
});

test('installed iPhone web layout respects dynamic viewport and safe-area insets', () => {
  assert.match(rootHtmlSource, /viewport-fit=cover/);
  assert.match(rootHtmlSource, /name="theme-color" content="#F8FAF9"/);
  assert.equal(webManifest.theme_color, '#F8FAF9');
  assert.match(tabsSource, /paddingBottom: Math\.max\(insets\.bottom, 14\)/);
  assert.match(tabsSource, /height:\s*72/);
  assert.match(brandSource, /paddingBottom:\s*Space\.xxxl/);
  assert.doesNotMatch(brandSource, /default:\s*124/);
  assert.match(brandSource, /bottom: 'off'/);
  assert.match(customerWebCss, /height:\s*100dvh/);
  assert.match(customerWebCss, /display-mode:\s*standalone/);
  assert.doesNotMatch(customerWebCss, /div:has\(> \[role='tablist'\]\)/);
});
