import type { SymbolViewProps } from '@/components/symbol';

export function serviceSymbol(icon?: string): SymbolViewProps['name'] {
  switch (icon) {
    case 'dry_cleaning':
      return { ios: 'sparkles', android: 'dry_cleaning', web: 'auto_awesome' };
    case 'iron':
      return { ios: 'wind', android: 'iron', web: 'iron' };
    case 'bed':
      return { ios: 'bed.double.fill', android: 'bed', web: 'bed' };
    default:
      return { ios: 'washer.fill', android: 'local_laundry_service', web: 'local_laundry_service' };
  }
}

export function servicePalette(icon?: string) {
  switch (icon) {
    case 'dry_cleaning': return { color: '#4F86E8', background: '#EAF1FD' };
    case 'iron': return { color: '#D78B13', background: '#FFF4D8' };
    case 'bed': return { color: '#CF5D54', background: '#FDEAE8' };
    default: return { color: '#0B7D72', background: '#DDF5F1' };
  }
}
