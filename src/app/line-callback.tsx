import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Page } from '@/components/super-ui';
import { Colors } from '@/constants/design';

export default function LineCallbackScreen() {
  const params = useLocalSearchParams<{ line?: string; attemptId?: string }>();
  const [message, setMessage] = useState('Finishing LINE connection…');
  useEffect(() => {
    let active = true;
    let returnTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      if (params.line !== 'success' || !params.attemptId) { if (active) setMessage(params.line === 'cancelled' ? 'LINE connection was cancelled.' : 'LINE connection failed.'); return; }
      if (Platform.OS === 'web') {
        if (active) {
          setMessage('LINE connected. Returning to your notification settings…');
          returnTimer = setTimeout(() => router.replace({ pathname: '/account', params: { section: 'notifications' } }), 900);
        }
      } else {
        router.replace({ pathname: '/account', params: { section: 'notifications' } });
      }
    })();
    return () => { active = false; if (returnTimer) clearTimeout(returnTimer); };
  }, [params.attemptId, params.line]);
  return <Page contentStyle={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}><View style={{ alignItems: 'center', gap: 16 }}><ActivityIndicator color={Colors.teal} /><Text style={{ color: Colors.text, fontSize: 16, textAlign: 'center' }}>{message}</Text></View></Page>;
}
