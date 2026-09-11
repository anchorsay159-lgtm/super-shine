import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button, Card, DetailHeader, IconBadge, Page } from '@/components/super-ui';
import { LineConnectButton } from '@/components/line-connect-button';
import { SymbolView, type SymbolName } from '@/components/symbol';
import { Colors, Radius, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { useRouteReady } from '@/hooks/use-route-ready';
import { getLanguageOption, languageOptions, translate, type LanguageCode } from '@/i18n';
import { normalizeThaiPhone } from '@/lib/customer-rules';
import { customerAlert } from '@/lib/customer-alert';
import { supabase } from '@/lib/supabase';
import { disconnectLine, EMPTY_LINE_CONNECTION, finishLineConnection, getLineConnection, getLineReturnUrl, startLineConnection, updateLinePreferences, type LineConnection, type LineLinkStart } from '@/lib/line';

type AccountSection =
  | 'personal'
  | 'addresses'
  | 'payments'
  | 'laundry-preferences'
  | 'notifications'
  | 'language'
  | 'help'
  | 'support';

const sectionTitleKeys: Record<AccountSection, string> = {
  personal: 'Personal information',
  addresses: 'Saved addresses',
  payments: 'Payment methods',
  'laundry-preferences': 'Default laundry preferences',
  notifications: 'Notifications',
  language: 'Language',
  help: 'Help centre',
  support: 'Contact support',
};

export default function AccountScreen() {
  const params = useLocalSearchParams<{ section?: string; orderId?: string }>();
  const routeReady = useRouteReady();
  const section = routeReady && isAccountSection(params.section) ? params.section : 'personal';
  const { t } = useApp();

  return (
    <Page scrollProps={{ keyboardShouldPersistTaps: 'handled' }}>
      <DetailHeader title={t(sectionTitleKeys[section])} />
      {section === 'personal' ? <PersonalInformation /> : null}
      {section === 'addresses' ? <Addresses /> : null}
      {section === 'payments' ? <PaymentMethods /> : null}
      {section === 'laundry-preferences' ? <LaundryPreferences /> : null}
      {section === 'notifications' ? <NotificationSettings /> : null}
      {section === 'language' ? <LanguageSettings /> : null}
      {section === 'help' ? <HelpCentre /> : null}
      {section === 'support' ? <SupportForm orderId={routeReady ? params.orderId : undefined} /> : null}
    </Page>
  );
}

function isAccountSection(section?: string): section is AccountSection {
  return Boolean(section && section in sectionTitleKeys);
}

function PersonalInformation() {
  const { profile, updateProfile, t } = useApp();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !email.trim()) {
      customerAlert(t('Complete all fields'), t('Name and email are required.'));
      return;
    }
    if (phone.trim() && !normalizeThaiPhone(phone)) {
      customerAlert(t('Something went wrong'), t('PHONE_INVALID'));
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      customerAlert(t('Profile updated'), t('Your personal information was saved.'), [
        { text: t('Done'), onPress: () => router.back() },
      ]);
    } catch (error) {
      customerAlert(t('Something went wrong'), t(error instanceof Error ? error.message : 'UNKNOWN_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.avatarLarge}>
        <Text style={styles.avatarText}>{initials(name)}</Text>
      </View>
      <Text style={styles.lead}>{t('Keep your contact details current for pickup and delivery updates.')}</Text>
      <Field label={t('Full name')} value={name} onChangeText={setName} autoCapitalize="words" />
      <Field
        label={t('Email address')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field label={t('Phone number')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Button label={t('Save changes')} onPress={() => void save()} loading={saving} disabled={saving} style={styles.primaryAction} />
    </View>
  );
}

function Addresses() {
  const { addresses, primaryAddressId, setPrimaryAddressId, addAddress, t } = useApp();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Apartment');
  const [detail, setDetail] = useState('');

  const saveAddress = () => {
    if (!label.trim() || !detail.trim()) {
      customerAlert(t('Address required'), t('Enter a label and full address.'));
      return;
    }
    addAddress({ label: label.trim(), detail: detail.trim() });
    setAdding(false);
    setDetail('');
    customerAlert(t('Address saved'), t('The new address is now your pickup address.'));
  };

  return (
    <View>
      <Text style={styles.lead}>{t('Tap an address to set the default pickup and delivery location.')}</Text>
      <View style={styles.stack}>
        {addresses.map((address) => {
          const selected = address.id === primaryAddressId;
          return (
            <Pressable
              key={address.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPrimaryAddressId(address.id)}
              style={({ pressed }) => [styles.choiceCard, selected && styles.choiceCardSelected, pressed && styles.pressed]}>
              <IconBadge
                name={address.id === 'home'
                  ? { ios: 'house.fill', android: 'home', web: 'home' }
                  : { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
                color={selected ? Colors.tealDark : Colors.navy}
                backgroundColor={selected ? Colors.tealLight : Colors.canvas}
              />
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{address.label}</Text>
                <Text style={styles.choiceDetail}>{address.detail}</Text>
              </View>
              <SelectionMark selected={selected} />
            </Pressable>
          );
        })}
      </View>

      {adding ? (
        <Card style={styles.formCard}>
          <Text style={styles.cardTitle}>{t('Add a new address')}</Text>
          <Field label={t('Address label')} value={label} onChangeText={setLabel} />
          <Field
            label={t('Full address')}
            value={detail}
            onChangeText={setDetail}
            placeholder={t('Building, street, district, province, postcode')}
            multiline
          />
          <Button label={t('Save address')} onPress={saveAddress} />
          <Button label={t('Cancel')} variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button
          label={t('Add another address')}
          variant="secondary"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          onPress={() => setAdding(true)}
          style={styles.primaryAction}
        />
      )}
    </View>
  );
}

function PaymentMethods() {
  const { paymentMethod, setPaymentMethod, t } = useApp();
  const methods: {
    id: 'cash_pickup' | 'cash_delivery' | 'promptpay';
    title: string;
    detail: string;
    icon: SymbolName;
  }[] = [
    {
      id: 'cash_pickup',
      title: t('Cash on collection'),
      detail: t('Pay when you collect your clean laundry from Super Shine'),
      icon: { ios: 'banknote.fill', android: 'payments', web: 'payments' },
    },
    {
      id: 'cash_delivery',
      title: t('Cash on delivery'),
      detail: t('Pay when your clean laundry is delivered'),
      icon: { ios: 'banknote.fill', android: 'payments', web: 'payments' },
    },
    {
      id: 'promptpay',
      title: t('PromptPay QR'),
      detail: t('Scan the business QR and wait for secure confirmation; a slip is available only as fallback'),
      icon: { ios: 'qrcode', android: 'qr_code', web: 'qr_code' },
    },
  ];

  return (
    <View>
      <Text style={styles.lead}>{t('Select the default payment method for new orders.')}</Text>
      <View style={styles.stack}>
        {methods.map((method) => {
          const selected = method.id === paymentMethod;
          return (
            <Pressable
              key={method.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPaymentMethod(method.id)}
              style={({ pressed }) => [styles.choiceCard, selected && styles.choiceCardSelected, pressed && styles.pressed]}>
              <IconBadge
                name={method.icon}
                color={selected ? Colors.tealDark : Colors.navy}
                backgroundColor={selected ? Colors.tealLight : Colors.canvas}
              />
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{method.title}</Text>
                <Text style={styles.choiceDetail}>{method.detail}</Text>
              </View>
              <SelectionMark selected={selected} />
            </Pressable>
          );
        })}
      </View>
      <Button
        label={t('Save payment preference')}
        onPress={() => customerAlert(t('Payment saved'), t('Your default payment method was updated.'), [
          { text: t('Done'), onPress: () => router.back() },
        ])}
        style={styles.primaryAction}
      />
    </View>
  );
}

function LaundryPreferences() {
  const { t } = useApp();
  return (
    <Card style={styles.formCard}>
      <Text style={styles.cardTitle}>{t('Default laundry preferences')}</Text>
      <Text style={styles.lead}>{t('Choose detailed preferences during checkout. Your latest selections can be reused for future orders.')}</Text>
      <Button label={t('Start a new order')} onPress={() => router.push('/new-order')} />
    </Card>
  );
}

function NotificationSettings() {
  const { notificationPreferences, setNotificationPreference, t } = useApp();
  return (
    <View>
      <Text style={styles.lead}>{t('Choose which Super Shine updates appear on your phone.')}</Text>
      <Card style={styles.settingsCard}>
        <ToggleRow
          title={t('Order updates')}
          detail={t('Cleaning, ready, and delivery progress')}
          value={notificationPreferences.orderUpdates}
          onValueChange={(value) => setNotificationPreference('orderUpdates', value)}
        />
        <View style={styles.divider} />
        <ToggleRow
          title={t('Pickup reminders')}
          detail={t('Reminder before your scheduled pickup')}
          value={notificationPreferences.pickupReminders}
          onValueChange={(value) => setNotificationPreference('pickupReminders', value)}
        />
        <View style={styles.divider} />
        <ToggleRow
          title={t('Offers and coupons')}
          detail={t('Active offers and coupons')}
          value={notificationPreferences.promotions}
          onValueChange={(value) => setNotificationPreference('promotions', value)}
        />
      </Card>
      <LineNotificationSettings />
      <Button
        label={t('Save notification settings')}
        onPress={() => customerAlert(t('Preferences saved'), t('Your notification choices were updated.'), [
          { text: t('Done'), onPress: () => router.back() },
        ])}
        style={styles.primaryAction}
      />
    </View>
  );
}

const LINE_ATTEMPT_KEY = '@supershine/line-attempt';
const LINE_SECRET_KEY = '@supershine/line-finalize-secret';

function LineNotificationSettings() {
  const { authLoading, isDemo, t, userId } = useApp();
  const [connection, setConnection] = useState<LineConnection>(EMPTY_LINE_CONNECTION);
  const [loading, setLoading] = useState(!isDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<LineLinkStart | null>(null);
  const preparing = useRef<Promise<LineLinkStart | null> | null>(null);

  const prepare = useCallback(async () => {
    if (isDemo || authLoading || !userId) return null;
    if (prepared && new Date(prepared.expiresAt).getTime() - Date.now() > 30_000) return prepared;
    if (preparing.current) return preparing.current;
    setBusy(true); setError(null);
    preparing.current = (async () => {
      try {
        const started = await startLineConnection();
        await AsyncStorage.multiSet([[LINE_ATTEMPT_KEY, started.attemptId], [LINE_SECRET_KEY, started.finalizeSecret]]);
        setPrepared(started);
        return started;
      } catch {
        setError(t('LINE connection is temporarily unavailable. Please try again.'));
        return null;
      } finally {
        setBusy(false);
        preparing.current = null;
      }
    })();
    return preparing.current;
  }, [authLoading, isDemo, prepared, t, userId]);

  const refresh = useCallback(async () => {
    if (isDemo || authLoading || !userId) { if (!authLoading) setLoading(false); return; }
    try { setConnection(await getLineConnection()); setError(null); }
    catch { setError(t('LINE status is temporarily unavailable.')); }
    finally { setLoading(false); }
  }, [authLoading, isDemo, t, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!loading && !connection.connected && !isDemo && !prepared && !error) void prepare();
  }, [connection.connected, error, isDemo, loading, prepare, prepared]);

  const connect = async () => {
    setBusy(true); setError(null);
    try {
      const started = await prepare();
      if (!started) return;
      if (typeof window !== 'undefined' && window.location) {
        window.location.assign(started.authorizeUrl);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(started.authorizeUrl, getLineReturnUrl());
      if (result.type === 'success') {
        const query = new URL(result.url).searchParams;
        if (query.get('line') === 'success') {
          await finishLineConnection(started.attemptId, started.finalizeSecret);
          await refresh();
        } else if (query.get('line') === 'cancelled') setError(t('LINE connection was cancelled.'));
        else setError(t('LINE connection could not be completed.'));
      }
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : t('LINE connection failed.')); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setError(null);
    try { await disconnectLine(); setConnection(EMPTY_LINE_CONNECTION); }
    catch { setError(t('LINE could not be disconnected.')); }
    finally { setBusy(false); }
  };

  const savePreference = async (key: keyof Pick<LineConnection, 'notificationsEnabled' | 'orderUpdatesEnabled' | 'paymentUpdatesEnabled'>, value: boolean) => {
    const next = { ...connection, [key]: value };
    setConnection(next);
    try { await updateLinePreferences(next); }
    catch { setConnection(connection); setError(t('LINE notification setting could not be saved.')); }
  };

  return (
    <Card style={styles.lineCard}>
      <View style={styles.lineHeading}>
        <IconBadge name={{ ios: 'message.fill', android: 'chat', web: 'chat_bubble' }} color={Colors.tealDark} backgroundColor={Colors.tealLight} />
        <View style={styles.toggleCopy}>
          <Text style={styles.cardTitle}>{t('LINE')}</Text>
          <Text style={styles.choiceDetail}>{loading ? t('Loading…') : connection.connected ? connection.friendStatus === 'blocked' ? t('Connected · add Super Shine as a LINE friend') : t('Connected ✓') : t('Not connected')}</Text>
        </View>
      </View>
      {isDemo ? <Text style={styles.infoText}>{t('Connect LINE from a real customer account.')}</Text> : null}
      {!isDemo && !connection.connected ? <LineConnectButton href={prepared?.authorizeUrl} label={busy || loading ? t('Preparing secure LINE connection…') : t('Connect LINE')} loading={busy || loading} onPress={() => void connect()} /> : null}
      {!isDemo && connection.connected ? <View>
        <ToggleRow title={t('LINE notifications')} detail={t('Send Super Shine updates in LINE')} value={connection.notificationsEnabled} onValueChange={(value) => void savePreference('notificationsEnabled', value)} />
        <View style={styles.divider} />
        <ToggleRow title={t('Order updates')} detail={t('Pickup, cleaning, and delivery milestones')} value={connection.orderUpdatesEnabled} onValueChange={(value) => void savePreference('orderUpdatesEnabled', value)} />
        <View style={styles.divider} />
        <ToggleRow title={t('Payment updates')} detail={t('Payment due, confirmed, failed, and refunded')} value={connection.paymentUpdatesEnabled} onValueChange={(value) => void savePreference('paymentUpdatesEnabled', value)} />
        <Button label={busy ? t('Please wait…') : t('Disconnect LINE')} onPress={() => void disconnect()} disabled={busy} variant="secondary" style={styles.lineButton} />
      </View> : null}
      {error ? <Text style={styles.lineError}>{error}</Text> : null}
    </Card>
  );
}

function LanguageSettings() {
  const { language, setLanguage, t } = useApp();
  const [selection, setSelection] = useState<LanguageCode>(language);
  return (
    <View>
      <Text style={styles.lead}>{t('Choose the language used throughout Super Shine.')}</Text>
      <View style={styles.stack}>
        {languageOptions.map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selection === item.code }}
            onPress={() => setSelection(item.code)}
            style={({ pressed }) => [styles.choiceCard, selection === item.code && styles.choiceCardSelected, pressed && styles.pressed]}>
            <View style={styles.languageBadge}>
              <Text style={styles.languageBadgeText}>{item.badge}</Text>
            </View>
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitle}>{item.name}</Text>
              <Text style={styles.choiceDetail}>{item.nativeName}</Text>
            </View>
            <SelectionMark selected={selection === item.code} />
          </Pressable>
        ))}
      </View>
      <Button
        label={t('Apply language')}
        onPress={() => {
          setLanguage(selection);
          const selectedLanguage = getLanguageOption(selection);
          customerAlert(
            translate(selection, 'Language saved'),
            translate(selection, '{{language}} is now your selected language.', { language: selectedLanguage.nativeName }),
            [
            { text: translate(selection, 'Done'), onPress: () => router.back() },
          ]);
        }}
        style={styles.primaryAction}
      />
    </View>
  );
}

const faqs = [
  {
    id: 'pricing',
    question: 'How is the final price calculated?',
    answer: 'The app shows an estimate. Super Shine confirms the final amount after weighing and checking your items.',
  },
  {
    id: 'pickup',
    question: 'How should I prepare my laundry?',
    answer: 'Place regular clothes in a secure bag. Keep delicate items separate and add instructions during checkout.',
  },
  {
    id: 'timing',
    question: 'How long does an order take?',
    answer: 'Standard orders are usually returned within 24 hours. Express orders receive priority completion.',
  },
  {
    id: 'problem',
    question: 'What if an item has a problem?',
    answer: 'Open Contact support, select an issue category, and send the order details to the Super Shine team.',
  },
];

function HelpCentre() {
  const { t } = useApp();
  const [openId, setOpenId] = useState<string | null>('pricing');
  return (
    <View>
      <Text style={styles.lead}>{t('Find quick answers or contact Super Shine for order help.')}</Text>
      <View style={styles.stack}>
        {faqs.map((faq) => {
          const open = faq.id === openId;
          return (
            <Pressable
              key={faq.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenId(open ? null : faq.id)}
              style={({ pressed }) => [styles.faq, pressed && styles.pressed]}>
              <View style={styles.faqTitleRow}>
                <Text style={styles.faqQuestion}>{t(faq.question)}</Text>
                <SymbolView
                  name={{ ios: open ? 'chevron.up' : 'chevron.down', android: open ? 'expand_less' : 'expand_more', web: open ? 'expand_less' : 'expand_more' }}
                  size={17}
                  tintColor={Colors.tealDark}
                />
              </View>
              {open ? <Text style={styles.faqAnswer}>{t(faq.answer)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Button
        label={t('Contact support')}
        icon={{ ios: 'message.fill', android: 'chat_bubble', web: 'chat_bubble' }}
        onPress={() => router.push({ pathname: '/account', params: { section: 'support' } })}
        style={styles.primaryAction}
      />
    </View>
  );
}

function SupportForm({ orderId }: { orderId?: string }) {
  const { isDemo, language, orders, sendOrderMessage, t, userId } = useApp();
  const order = orders.find((item) => item.databaseId === orderId);
  const categories = ['Order status', 'Pickup issue', 'Payment', 'Item care'];
  const [category, setCategory] = useState(categories[0]);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const nextMessage = message.trim();
    if (!userId || nextMessage.length < 2 || nextMessage.length > 1000 || sending) return;
    if (orderId) {
      setSending(true);
      try { await sendOrderMessage(orderId, nextMessage); setMessage(''); setSent(true); }
      catch { customerAlert(t('Message could not be sent'), t('We could not update this information.')); }
      finally { setSending(false); }
      return;
    }
    if (isDemo) return customerAlert(t('Message could not be sent'), t('Open a demo order to start a demo conversation.'));
    if (!supabase) return;
    setSending(true);
    const { error } = await supabase.from('support_messages').insert({
      order_id: orderId || null,
      user_id: userId,
      sender_id: userId,
      sender_role: 'customer',
      reason: category,
      message: nextMessage,
    });
    setSending(false);
    if (error) return customerAlert(t('Message could not be sent'), t('UNKNOWN_ERROR'));
    setSent(true);
  };

  if (sent && !orderId) {
    return (
      <View style={styles.successPanel}>
        <IconBadge
          name={{ ios: 'checkmark.message.fill', android: 'mark_chat_read', web: 'mark_chat_read' }}
          color={Colors.success}
          backgroundColor={Colors.successLight}
          badgeSize={82}
          size={36}
        />
        <Text style={styles.successTitle}>{t('Message sent')}</Text>
        <Text style={styles.successText}>{t('The Super Shine team will reply through notifications.')}</Text>
        <Button label={t('Return to profile')} onPress={() => router.replace('/(tabs)/profile')} style={styles.fullWidth} />
      </View>
    );
  }

  return (
    <View>
      {orderId ? <Card style={styles.formCard}><Text style={styles.cardTitle}>{t('Order conversation')}</Text>{order?.messages.length ? order.messages.map((entry) => <View key={entry.id} style={[styles.conversationBubble, entry.senderRole === 'admin' && styles.adminConversation]}><Text style={styles.conversationMeta}>{t(entry.senderRole === 'admin' ? 'Super Shine' : 'You')} · {new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</Text><Text style={styles.conversationText}>{entry.message}</Text></View>) : <Text style={styles.lead}>{t('No messages yet.')}</Text>}</Card> : null}
      {sent && orderId ? <Text style={styles.successText}>{t('Message sent')}</Text> : null}
      <Text style={styles.lead}>{t('Tell us what happened. The related order number is attached automatically.')}</Text>
      <Text style={styles.inputLabel}>{t('Support reason')}</Text>
      <View style={styles.chips}>
        {categories.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === item }}
            onPress={() => setCategory(item)}
            style={[styles.chip, category === item && styles.chipSelected]}>
            <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{t(item)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.inputLabel}>{t('Message')}</Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={t('Describe your question or problem')}
        placeholderTextColor={Colors.textMuted}
        style={styles.messageInput}
        multiline
        textAlignVertical="top"
        maxLength={1000}
      />
      <Button label={t('Send message')} onPress={() => void send()} loading={sending} disabled={sending || message.trim().length < 2} style={styles.primaryAction} />
    </View>
  );
}

function ToggleRow({
  title,
  detail,
  value,
  onValueChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.line, true: '#9BDCD4' }}
        thumbColor={value ? Colors.tealDark : Colors.surface}
      />
    </View>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.selectionMark, selected && styles.selectionMarkSelected]}>
      {selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor={Colors.surface} weight="bold" /> : null}
    </View>
  );
}

function Field({ label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={Colors.textMuted}
        style={[styles.input, multiline && styles.inputMultiline, props.style]}
      />
    </View>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SS';
}

const styles = StyleSheet.create({
  lead: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: Space.xxl },
  avatarLarge: { width: 92, height: 92, borderRadius: 34, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Space.xl },
  avatarText: { color: Colors.surface, fontSize: 28, fontWeight: '700' },
  field: { marginBottom: Space.lg },
  inputLabel: { color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: Space.sm },
  input: { minHeight: 55, borderRadius: Radius.medium, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: Space.lg, color: Colors.text, fontSize: 15 },
  inputMultiline: { minHeight: 104, paddingTop: Space.md, lineHeight: 20 },
  primaryAction: { marginTop: Space.xl },
  stack: { gap: Space.md },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: Space.md, backgroundColor: Colors.surface, borderRadius: Radius.large, borderWidth: 1, borderColor: Colors.line, padding: Space.lg },
  choiceCardSelected: { borderColor: Colors.teal, backgroundColor: Colors.mint },
  pressed: { opacity: 0.68 },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  choiceDetail: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  selectionMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  selectionMarkSelected: { borderColor: Colors.teal, backgroundColor: Colors.teal },
  formCard: { padding: Space.xl, marginTop: Space.xl },
  cardTitle: { color: Colors.navy, fontSize: 18, fontWeight: '700', marginBottom: Space.lg },
  infoBox: { flexDirection: 'row', gap: Space.sm, backgroundColor: Colors.blueLight, borderRadius: Radius.medium, padding: Space.md, marginTop: Space.lg },
  infoText: { flex: 1, color: Colors.navySoft, fontSize: 12, lineHeight: 17 },
  settingsCard: { paddingHorizontal: Space.lg },
  lineCard: { padding: Space.lg, marginTop: Space.lg, borderColor: '#B6E7DF', backgroundColor: '#F5FCFA' },
  lineHeading: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginBottom: Space.sm },
  lineButton: { marginTop: Space.md },
  lineError: { color: Colors.coral, fontSize: 12, lineHeight: 18, marginTop: Space.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, paddingVertical: Space.lg },
  toggleCopy: { flex: 1 },
  divider: { height: 1, backgroundColor: Colors.line },
  languageBadge: { width: 50, height: 50, borderRadius: 18, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' },
  languageBadgeText: { color: Colors.surface, fontSize: 14, fontWeight: '900' },
  faq: { backgroundColor: Colors.surface, borderRadius: Radius.medium, borderWidth: 1, borderColor: Colors.line, padding: Space.lg },
  faqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  faqQuestion: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' },
  faqAnswer: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: Space.md, paddingTop: Space.md, borderTopWidth: 1, borderTopColor: Colors.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginBottom: Space.xl },
  chip: { borderRadius: Radius.pill, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { backgroundColor: Colors.mint, borderColor: Colors.teal },
  chipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: Colors.tealDark, fontWeight: '700' },
  messageInput: { minHeight: 150, borderRadius: Radius.medium, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, padding: Space.lg, color: Colors.text, fontSize: 15, lineHeight: 21 },
  conversationBubble: { backgroundColor: Colors.canvas, borderRadius: Radius.medium, padding: Space.md, marginBottom: Space.sm, marginRight: Space.xxxl },
  adminConversation: { backgroundColor: Colors.tealLight, marginRight: 0, marginLeft: Space.xxxl },
  conversationMeta: { color: Colors.tealDark, fontSize: 10, fontWeight: '700' },
  conversationText: { color: Colors.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  responseTime: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: Space.md },
  successPanel: { alignItems: 'center', paddingTop: 44 },
  successTitle: { color: Colors.navy, fontSize: 27, lineHeight: 33, fontWeight: '700', textAlign: 'center', marginTop: Space.xl },
  successText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 380, marginTop: Space.sm, marginBottom: Space.xxxl },
  fullWidth: { width: '100%' },
  planHero: { backgroundColor: Colors.navy, borderRadius: Radius.large, padding: Space.xxl },
  planEyebrow: { color: '#93DDD4', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  planPrice: { color: Colors.surface, fontSize: 34, fontWeight: '700', marginTop: Space.md },
  planPeriod: { color: '#C5D3DB', fontSize: 13, fontWeight: '600' },
  planDescription: { color: '#C5D3DB', fontSize: 13, lineHeight: 19, marginTop: Space.sm },
  planBenefits: { padding: Space.xl, gap: Space.lg, marginTop: Space.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  benefitText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  terms: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: Space.md },
  referralPage: { alignItems: 'center', paddingTop: 34 },
  codeBox: { width: '100%', backgroundColor: Colors.yellowLight, borderRadius: Radius.large, alignItems: 'center', padding: Space.xl, marginBottom: Space.xl },
  codeLabel: { color: '#8B5D12', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  codeValue: { color: Colors.navy, fontSize: 28, fontWeight: '700', letterSpacing: 1.5, marginTop: Space.sm },
});
