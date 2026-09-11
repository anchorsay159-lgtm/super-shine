import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SymbolView, type SymbolViewProps } from '@/components/symbol';
import {
  CustomerColors as C,
  CustomerHeight,
  CustomerLayout,
  CustomerRadius,
  CustomerShadow,
  CustomerSpace as S,
  CustomerType,
} from '@/constants/customer-design';
import { FontFamily, FontFamilyMedium } from '@/constants/design';

export function CustomerCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const SurfaceCard = CustomerCard;

export function CustomerSectionHeader({ title, helper, action, onAction }: { title: string; helper?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text accessibilityRole="header" style={styles.sectionHeaderTitle}>{title}</Text>
        {helper ? <Text style={styles.sectionHeaderHelper}>{helper}</Text> : null}
      </View>
      {action ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionHeaderAction}><Text style={styles.sectionHeaderActionText}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function InformationBanner({ title, message, icon, tone = 'brand', trailing }: { title: string; message?: string; icon?: SymbolViewProps['name']; tone?: 'brand' | 'info' | 'attention'; trailing?: ReactNode }) {
  const palette = tone === 'attention'
    ? { background: C.attentionSoft, foreground: '#7B520E' }
    : tone === 'info'
      ? { background: C.infoSoft, foreground: C.info }
      : { background: C.mint, foreground: C.tealPressed };
  return (
    <View style={[styles.banner, { backgroundColor: palette.background }]}>
      {icon ? <View style={styles.bannerIcon}><SymbolView name={icon} size={21} tintColor={palette.foreground} /></View> : null}
      <View style={styles.bannerCopy}><Text style={[styles.bannerTitle, { color: palette.foreground }]}>{title}</Text>{message ? <Text style={styles.bannerMessage}>{message}</Text> : null}</View>
      {trailing}
    </View>
  );
}

export function CompactScreenHeader({
  title,
  subtitle,
  onBack,
  onClose,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? <IconControl label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} onPress={onBack} /> : <View style={styles.headerSpacer} />}
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onClose ? <IconControl label="Close" icon={{ ios: 'xmark', android: 'close', web: 'close' }} onPress={onClose} /> : <View style={styles.headerSpacer} />)}
    </View>
  );
}

export function IconControl({ label, icon, onPress, disabled }: { label: string; icon: SymbolViewProps['name']; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconControl, pressed && styles.pressed, disabled && styles.disabled]}>
      <SymbolView name={icon} size={20} tintColor={disabled ? C.disabled : C.navy} />
    </Pressable>
  );
}

export function StatusBadge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'success' | 'attention' | 'error' | 'neutral' }) {
  const toneStyle = badgeTones[tone];
  return (
    <View accessibilityLabel={label} style={[styles.badge, { backgroundColor: toneStyle.background }]}>
      <View style={[styles.badgeDot, { backgroundColor: toneStyle.foreground }]} />
      <Text style={[styles.badgeText, { color: toneStyle.foreground }]}>{label}</Text>
    </View>
  );
}

const badgeTones = {
  info: { foreground: C.info, background: C.infoSoft },
  success: { foreground: C.success, background: C.successSoft },
  attention: { foreground: '#93610F', background: C.attentionSoft },
  error: { foreground: C.error, background: C.errorSoft },
  neutral: { foreground: C.muted, background: C.disabledSoft },
};

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <SymbolView name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }} size={17} tintColor={C.error} />
      <Text style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

export function InlineSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.inlineSuccess}>
      <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={17} tintColor={C.success} />
      <Text style={styles.inlineSuccessText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: SymbolViewProps['name']; title: string; message: string; action?: ReactNode }) {
  return (
    <CustomerCard style={styles.empty}>
      <View style={styles.emptyIcon}><SymbolView name={icon} size={28} tintColor={C.tealPressed} /></View>
      <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </CustomerCard>
  );
}

export function SkeletonBlock({ height = 18, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityLabel="Loading" style={[styles.skeleton, { height, width }, style]} />;
}

export function QuantityControl({ value, onMinus, onPlus, label, maximumReached = false }: { value: number; onMinus: () => void; onPlus: () => void; label: string; maximumReached?: boolean }) {
  return (
    <View accessibilityLabel={label} style={styles.quantity}>
      <IconControl label={`Decrease ${label}`} icon={{ ios: 'minus', android: 'remove', web: 'remove' }} onPress={onMinus} disabled={value <= 0} />
      <Text accessibilityLiveRegion="polite" style={styles.quantityValue}>{value}</Text>
      <IconControl label={`Increase ${label}`} icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={onPlus} disabled={maximumReached} />
    </View>
  );
}

export function SelectableRow({
  title,
  subtitle,
  selected,
  onPress,
  leading,
  trailing,
  disabled,
  style,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.selectable, selected && styles.selectableSelected, pressed && styles.pressed, disabled && styles.disabled, style]}>
      {leading}
      <View style={styles.selectableCopy}>
        <Text style={styles.selectableTitle}>{title}</Text>
        {subtitle ? <Text style={styles.selectableSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? <SelectionCheck selected={selected} />}
    </Pressable>
  );
}

export function SelectionCheck({ selected }: { selected: boolean }) {
  return <View style={[styles.selectionCheck, selected && styles.selectionCheckSelected]}>{selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor={C.white} weight="bold" /> : null}</View>;
}

export const CompactServiceSelector = SelectableRow;
export const AddressSelector = SelectableRow;
export const PickupSlotSelector = SelectableRow;
export const PaymentSelector = SelectableRow;
export const CouponSelector = SelectableRow;

export function PriceBreakdown({ rows, totalLabel, total }: { rows: { label: string; value: string; tone?: 'discount' | 'muted' }[]; totalLabel: string; total: string }) {
  return (
    <CustomerCard style={styles.priceCard}>
      {rows.map((row) => <View key={row.label} style={styles.priceRow}><Text style={[styles.priceLabel, row.tone === 'muted' && styles.muted]}>{row.label}</Text><Text style={[styles.priceValue, row.tone === 'discount' && styles.discount]}>{row.value}</Text></View>)}
      <View style={styles.priceRule} />
      <View style={styles.priceRow}><Text style={styles.totalLabel}>{totalLabel}</Text><Text style={styles.totalValue}>{total}</Text></View>
    </CustomerCard>
  );
}

export function ExpandableDetailSection({ title, summary, children, defaultOpen = false, onEdit }: PropsWithChildren<{ title: string; summary?: string; defaultOpen?: boolean; onEdit?: () => void }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <CustomerCard style={styles.expandable}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.expandableHeader}>
        <View style={styles.expandableCopy}><Text style={styles.expandableTitle}>{title}</Text>{summary ? <Text numberOfLines={open ? undefined : 2} style={styles.expandableSummary}>{summary}</Text> : null}</View>
        {onEdit ? <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={10}><Text style={styles.editText}>Edit</Text></Pressable> : null}
        <SymbolView name={{ ios: open ? 'chevron.up' : 'chevron.down', android: open ? 'expand_less' : 'expand_more', web: open ? 'expand_less' : 'expand_more' }} size={20} tintColor={C.muted} />
      </Pressable>
      {open ? <View style={styles.expandableBody}>{children}</View> : null}
    </CustomerCard>
  );
}

export function StickyActionBar({ backLabel, onBack, totalLabel, total, actionLabel, onAction, loading, disabled }: { backLabel?: string; onBack?: () => void; totalLabel: string; total: string; actionLabel: string; onAction: () => void; loading?: boolean; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, CustomerLayout.safeBottom) }]}>
      <View style={styles.stickyInner}>
        {onBack ? <Pressable accessibilityRole="button" onPress={onBack} style={styles.stickyBack}><Text style={styles.stickyBackText}>{backLabel}</Text></Pressable> : null}
        <View style={styles.stickyTotal}><Text style={styles.stickyTotalLabel}>{totalLabel}</Text><Text style={styles.stickyTotalValue}>{total}</Text></View>
        <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onAction} style={({ pressed }) => [styles.stickyButton, pressed && styles.pressed, (disabled || loading) && styles.disabled]}>
          {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.stickyButtonText}>{actionLabel}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export function ConfirmationModal({ visible, title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }: { visible: boolean; title: string; message: string; confirmLabel: string; cancelLabel: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modalCard}>
        <Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text><Text style={styles.modalMessage}>{message}</Text>
        <View style={styles.modalActions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.modalSecondary}><Text style={styles.modalSecondaryText}>{cancelLabel}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.modalPrimary, destructive && styles.modalDestructive]}><Text style={styles.modalPrimaryText}>{confirmLabel}</Text></Pressable>
        </View>
      </View></View>
    </Modal>
  );
}

export function Toast({ message }: { message?: string | null }) {
  return message ? <View accessibilityRole="alert" style={styles.toast}><Text style={styles.toastText}>{message}</Text></View> : null;
}

const focusOutline = Platform.OS === 'web' ? ({ outlineStyle: 'solid', outlineColor: C.focus, outlineWidth: 2 } as ViewStyle) : {};
const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: CustomerRadius.card, padding: 18, ...CustomerShadow },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: S.md, marginBottom: S.md },
  sectionHeaderCopy: { flex: 1 }, sectionHeaderTitle: { ...CustomerType.section, color: C.navy }, sectionHeaderHelper: { ...CustomerType.caption, color: C.muted, marginTop: 2 },
  sectionHeaderAction: { minHeight: CustomerHeight.touch, justifyContent: 'center', paddingHorizontal: S.xs }, sectionHeaderActionText: { color: C.tealPressed, fontSize: 13, fontWeight: '700' },
  banner: { minHeight: 76, borderRadius: CustomerRadius.card, padding: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md, marginBottom: S.section },
  bannerIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, bannerCopy: { flex: 1 }, bannerTitle: { ...CustomerType.label }, bannerMessage: { ...CustomerType.caption, color: C.muted, marginTop: 2 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  headerSpacer: { width: CustomerHeight.touch }, headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { color: C.navy, fontFamily: FontFamilyMedium, fontSize: 17, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  headerSubtitle: { color: C.muted, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 1 },
  iconControl: { width: CustomerHeight.touch, height: CustomerHeight.touch, borderRadius: CustomerRadius.control, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 }, focused: focusOutline, disabled: { opacity: 0.45 },
  badge: { alignSelf: 'flex-start', minHeight: 28, borderRadius: CustomerRadius.pill, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 }, badgeText: { fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  inlineError: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', marginTop: S.sm }, inlineErrorText: { ...CustomerType.caption, color: C.error, flex: 1, fontWeight: '600' },
  inlineSuccess: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', backgroundColor: C.successSoft, padding: S.md, borderRadius: CustomerRadius.control }, inlineSuccessText: { ...CustomerType.caption, color: C.success, flex: 1, fontWeight: '700' },
  empty: { alignItems: 'center', padding: S.section }, emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { ...CustomerType.section, color: C.navy, textAlign: 'center', marginTop: S.lg }, emptyMessage: { ...CustomerType.body, color: C.muted, textAlign: 'center', marginTop: S.sm, marginBottom: S.lg },
  skeleton: { backgroundColor: C.disabledSoft, borderRadius: 8 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: CustomerRadius.control, backgroundColor: C.white }, quantityValue: { minWidth: 32, textAlign: 'center', color: C.navy, fontFamily: FontFamilyMedium, fontSize: 16, fontWeight: '500' },
  selectable: { minHeight: 64, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.white }, selectableSelected: { borderColor: C.teal, backgroundColor: C.mint }, selectableCopy: { flex: 1 }, selectableTitle: { ...CustomerType.label, color: C.text, fontFamily: FontFamilyMedium }, selectableSubtitle: { ...CustomerType.caption, color: C.muted, fontFamily: FontFamily, marginTop: 2 },
  selectionCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.disabled, alignItems: 'center', justifyContent: 'center' }, selectionCheckSelected: { borderColor: C.teal, backgroundColor: C.teal },
  priceCard: { gap: S.sm }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: S.lg }, priceLabel: { ...CustomerType.body, color: C.text }, priceValue: { ...CustomerType.body, color: C.navy, fontWeight: '600' }, muted: { color: C.muted }, discount: { color: C.success }, priceRule: { height: 1, backgroundColor: C.border, marginVertical: S.xs }, totalLabel: { ...CustomerType.label, color: C.navy }, totalValue: { fontSize: 19, lineHeight: 24, color: C.navy, fontWeight: '700' },
  expandable: { padding: 0, overflow: 'hidden' }, expandableHeader: { minHeight: 64, padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.sm }, expandableCopy: { flex: 1 }, expandableTitle: { ...CustomerType.label, color: C.navy }, expandableSummary: { ...CustomerType.caption, color: C.muted, marginTop: 3 }, editText: { color: C.tealPressed, fontSize: 13, fontWeight: '700' }, expandableBody: { borderTopWidth: 1, borderTopColor: C.border, padding: S.lg },
  sticky: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, paddingTop: S.sm, paddingHorizontal: CustomerLayout.pagePadding }, stickyInner: { width: '100%', maxWidth: CustomerLayout.checkoutMaxWidth, alignSelf: 'center', minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: S.md }, stickyBack: { minWidth: CustomerHeight.touch, minHeight: CustomerHeight.touch, justifyContent: 'center' }, stickyBackText: { color: C.navy, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' }, stickyTotal: { flex: 1 }, stickyTotalLabel: { color: C.muted, fontFamily: FontFamily, fontSize: 10 }, stickyTotalValue: { color: C.navy, fontFamily: FontFamilyMedium, fontSize: 17, fontWeight: '500' }, stickyButton: { minHeight: 55, minWidth: 136, maxWidth: 240, paddingHorizontal: S.xl, borderRadius: 18, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }, stickyButtonText: { color: C.white, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(9,29,43,0.46)', justifyContent: 'center', padding: S.xl }, modalCard: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: C.white, borderRadius: CustomerRadius.modal, padding: S.xl }, modalTitle: { ...CustomerType.section, color: C.navy }, modalMessage: { ...CustomerType.body, color: C.muted, marginTop: S.sm }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: S.sm, marginTop: S.section }, modalSecondary: { minHeight: CustomerHeight.touch, paddingHorizontal: S.lg, justifyContent: 'center' }, modalSecondaryText: { color: C.navy, fontWeight: '800' }, modalPrimary: { minHeight: CustomerHeight.touch, paddingHorizontal: S.lg, borderRadius: CustomerRadius.control, justifyContent: 'center', backgroundColor: C.teal }, modalDestructive: { backgroundColor: C.error }, modalPrimaryText: { color: C.white, fontWeight: '800' },
  toast: { position: 'absolute', left: S.lg, right: S.lg, bottom: 90, backgroundColor: C.navy, borderRadius: CustomerRadius.control, padding: S.md }, toastText: { color: C.white, textAlign: 'center', fontWeight: '700' },
});
