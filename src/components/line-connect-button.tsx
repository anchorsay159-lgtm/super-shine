import { Button } from '@/components/super-ui';

export function LineConnectButton({ loading, label, onPress }: { href?: string; loading: boolean; label: string; onPress: () => void }) {
  return <Button label={label} onPress={onPress} loading={loading} disabled={loading} style={{ marginTop: 12 }} />;
}
