import type { PropsWithChildren, ReactNode } from 'react';
import { SymbolView, type SymbolViewProps } from '@/components/symbol';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontFamily, FontFamilyMedium, PageWidth, Radius, Shadow, Space } from '@/constants/design';
import { CustomerLayout } from '@/constants/customer-design';

type PageProps = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
}>;

export function Page({ children, contentStyle, scrollProps }: PageProps) {
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={{ top: 'additive', left: 'additive', right: 'additive', bottom: 'off' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        contentContainerStyle={[styles.pageContent, contentStyle, scrollProps?.contentContainerStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BrandMark({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  if (!compact && !light) {
    return (
      <Image
        accessibilityLabel="Super Shine Laundry Service"
        source={require('../../assets/images/brand/super-shine-full.png')}
        resizeMode="contain"
        style={styles.brandFullLogo}
      />
    );
  }

  return (
    <View style={styles.brandRow}>
      <View style={[styles.brandIcon, light && styles.brandIconLight, compact && styles.brandIconCompact]}>
        <Image
          accessibilityLabel="Super Shine"
          source={require('../../assets/images/brand/super-shine-symbol.png')}
          resizeMode="contain"
          style={styles.brandSymbol}
        />
      </View>
      <Text style={[styles.brandText, light && styles.brandTextLight, compact && styles.brandTextCompact]}>
        Super Shine
      </Text>
    </View>
  );
}

export function IconBadge({
  name,
  color = Colors.tealDark,
  backgroundColor = Colors.tealLight,
  size = 22,
  badgeSize = 48,
}: {
  name: SymbolViewProps['name'];
  color?: string;
  backgroundColor?: string;
  size?: number;
  badgeSize?: number;
}) {
  return (
    <View
      style={[
        styles.iconBadge,
        { backgroundColor, width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 },
      ]}>
      <SymbolView name={name} size={size} tintColor={color} />
    </View>
  );
}

type ButtonProps = PressableProps & {
  label: string;
  icon?: SymbolViewProps['name'];
  variant?: 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({ label, icon, variant = 'primary', loading, style, disabled, ...props }: ButtonProps) {
  const foreground = variant === 'secondary' || variant === 'ghost' ? Colors.navy : Colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        styles[`button_${variant}`],
        state.pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonContent}>
          <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
          {icon ? <SymbolView name={icon} size={18} tintColor={foreground} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function RowLink({
  icon,
  title,
  subtitle,
  onPress,
  danger = false,
  trailing,
  iconColor,
  iconBackground,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
  trailing?: ReactNode;
  iconColor?: string;
  iconBackground?: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.rowLink, pressed && styles.rowPressed]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBackground ?? 'transparent' }]}>
        <SymbolView name={icon} size={20} tintColor={danger ? Colors.coral : iconColor ?? Colors.tealDark} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && { color: Colors.coral }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={18}
          tintColor={Colors.textMuted}
        />
      )}
    </Pressable>
  );
}

export function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function DetailHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.detailHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.detailHeaderButton} hitSlop={8}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back_ios_new', web: 'arrow_back_ios_new' }}
          size={18}
          tintColor={Colors.navy}
        />
      </Pressable>
      <Text style={styles.detailHeaderTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.detailHeaderAction} hitSlop={8}>
          <Text style={styles.detailHeaderActionText}>{action}</Text>
        </Pressable>
      ) : (
        <View style={styles.detailHeaderSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.canvas },
  pageContent: {
    width: '100%',
    maxWidth: PageWidth,
    alignSelf: 'center',
    paddingHorizontal: CustomerLayout.pagePadding,
    paddingBottom: Space.xxxl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  brandIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  brandIconLight: { backgroundColor: 'transparent' },
  brandIconCompact: { width: 36, height: 36 },
  brandSymbol: { width: '100%', height: '100%' },
  brandFullLogo: { width: 260, height: 78, maxWidth: '100%' },
  brandText: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 23, fontWeight: '500', letterSpacing: -0.5 },
  brandTextLight: { color: Colors.surface },
  brandTextCompact: { fontSize: 20 },
  iconBadge: { justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  button: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: Space.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button_primary: { backgroundColor: Colors.teal },
  button_secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line },
  button_dark: { backgroundColor: Colors.navy },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: Colors.coral },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm },
  buttonLabel: { fontFamily: FontFamilyMedium, fontSize: 15, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  sectionTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.1 },
  sectionAction: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderWidth: 0,
    ...Shadow,
  },
  rowLink: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: Space.md },
  rowPressed: { opacity: 0.62 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1 },
  rowTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 16, fontWeight: '500' },
  rowSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12, marginTop: 3 },
  titleBlock: { paddingTop: Space.lg, paddingBottom: Space.xl },
  eyebrow: {
    color: Colors.tealDark,
    fontSize: 12,
    fontFamily: FontFamilyMedium,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  screenTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 27, lineHeight: 33, fontWeight: '500', letterSpacing: -0.45 },
  screenSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 19, marginTop: 3 },
  detailHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    paddingBottom: Space.xl,
  },
  detailHeaderButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  detailHeaderTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 17, fontWeight: '500' },
  detailHeaderAction: { minWidth: 58, alignItems: 'flex-end', paddingVertical: Space.sm },
  detailHeaderActionText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  detailHeaderSpacer: { width: 42 },
});
