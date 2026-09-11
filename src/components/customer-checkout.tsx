import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';

import { InlineError } from '@/components/customer-ui';
import { CustomerColors as C, CustomerHeight, CustomerRadius, CustomerSpace as S, CustomerType } from '@/constants/customer-design';
import { FontFamily, FontFamilyMedium } from '@/constants/design';

export function CheckoutProgress({ step, names }: { step: number; names: string[] }) {
  return (
    <View accessibilityLabel={`Step ${step} of ${names.length}: ${names[step - 1]}`} style={styles.progressWrap}>
      <View style={styles.progressSegments}>{names.map((name, index) => <View key={name} style={[styles.progressSegment, index < step && styles.progressSegmentActive]} />)}</View>
    </View>
  );
}

export function CheckoutField({ label, error, optional, ...props }: TextInputProps & { label: string; error?: string | null; optional?: string }) {
  return (
    <View>
      <View style={styles.labelRow}><Text style={styles.label}>{label}</Text>{optional ? <Text style={styles.optional}>{optional}</Text> : null}</View>
      <TextInput placeholderTextColor={C.disabled} style={[styles.input, props.multiline && styles.multiline, error && styles.inputError]} {...props} />
      <InlineError message={error} />
    </View>
  );
}

export function ChoiceChips({ label, value, choices, onChange, translate }: { label?: string; value: string; choices: string[]; onChange: (value: string) => void; translate: (key: string) => string }) {
  return (
    <View style={styles.choiceGroup}>{label ? <Text style={styles.label}>{label}</Text> : null}<View accessibilityRole="radiogroup" style={styles.chips}>
      {choices.map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: value === choice }} onPress={() => onChange(choice)} style={[styles.chip, value === choice && styles.chipSelected]}><Text style={[styles.chipText, value === choice && styles.chipTextSelected]}>{translate(choice)}</Text></Pressable>)}
    </View></View>
  );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}><Text style={styles.toggleText}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: C.disabledSoft, true: C.teal }} thumbColor={C.white} /></View>;
}

export function CheckoutSectionTitle({ title, helper }: { title: string; helper?: string }) {
  return <View style={styles.sectionTitle}><Text accessibilityRole="header" style={styles.sectionHeading}>{title}</Text>{helper ? <Text style={styles.sectionHelper}>{helper}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  progressWrap: { marginBottom: 22 }, progressSegments: { flexDirection: 'row', gap: 7 }, progressSegment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: C.disabledSoft }, progressSegmentActive: { backgroundColor: C.teal },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: S.md }, label: { ...CustomerType.label, color: C.text, marginBottom: S.sm }, optional: { ...CustomerType.caption, color: C.muted },
  input: { minHeight: CustomerHeight.field, borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: S.lg, color: C.text, fontFamily: FontFamily, fontSize: 14 }, multiline: { minHeight: 92, paddingTop: S.md, textAlignVertical: 'top' }, inputError: { borderColor: C.error },
  choiceGroup: { gap: S.xs }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }, chip: { minHeight: CustomerHeight.touch, minWidth: 104, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md, borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white }, chipSelected: { borderColor: C.teal, backgroundColor: C.mint }, chipText: { color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'center' }, chipTextSelected: { color: C.tealPressed, fontWeight: '700' },
  toggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.lg, borderBottomWidth: 1, borderBottomColor: C.border }, toggleText: { ...CustomerType.body, color: C.text, flex: 1, fontWeight: '700' },
  sectionTitle: { marginBottom: 18 }, sectionHeading: { ...CustomerType.screen, color: C.navy, fontFamily: FontFamilyMedium, fontSize: 25, lineHeight: 31 }, sectionHelper: { ...CustomerType.body, color: C.muted, fontFamily: FontFamily, fontSize: 13, lineHeight: 19, marginTop: 4 },
});
