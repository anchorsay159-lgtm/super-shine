import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Button, DetailHeader, IconBadge, Page } from '@/components/super-ui';
import { Colors, Radius, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht } from '@/lib/domain';
import { servicePalette, serviceSymbol } from '@/lib/icons';

export default function ServicesScreen() {
  const { width } = useWindowDimensions();
  const { services, t } = useApp();
  const [query, setQuery] = useState('');
  const filteredServices = useMemo(
    () => services.filter((service) => `${t(service.nameKey)} ${t(service.descriptionKey)}`.toLowerCase().includes(query.toLowerCase())),
    [query, services, t],
  );

  return (
    <Page>
      <DetailHeader title={t('All services')} />
      <View style={styles.search}>
        <SymbolView
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          size={19}
          tintColor={Colors.textMuted}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('Search laundry services')}
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
              size={19}
              tintColor={Colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.intro}>{t('Choose the care your items need. Final pricing is confirmed after pickup.')}</Text>

      <View style={[styles.list, width >= 900 && styles.listWide]}>
        {filteredServices.map((service) => {
          const palette = servicePalette(service.icon);
          return <View key={service.id} style={[styles.serviceCard, width >= 900 && styles.serviceCardWide, !service.enabled && styles.unavailableCard]}>
            <IconBadge
              name={serviceSymbol(service.icon)}
              color={palette.color}
              backgroundColor={palette.background}
              badgeSize={58}
              size={27}
            />
            <View style={styles.serviceCopy}>
              <Text style={styles.serviceName}>{t(service.nameKey)}</Text>
              {!service.enabled ? <Text style={styles.unavailable}>{t('Temporarily unavailable')}</Text> : null}
              <Text style={styles.serviceDescription}>{t(service.descriptionKey)}</Text>
              <Text style={styles.servicePrice}>{t('From {{price}} / {{unit}}', { price: formatBaht(service.price), unit: t(service.priceUnit) })}</Text>
            </View>
            <Button
              label={t(service.enabled ? 'Select' : 'Unavailable')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/new-order', params: { service: service.id } })}
              disabled={!service.enabled}
              style={styles.selectButton}
            />
          </View>;
        })}
      </View>

      {!filteredServices.length ? (
        <View style={styles.empty}>
          <IconBadge
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            color={Colors.textMuted}
            backgroundColor={Colors.line}
          />
          <Text style={styles.emptyTitle}>{t(query ? 'No matching service' : 'Services are temporarily unavailable')}</Text>
          <Text style={styles.emptyText}>{t(query ? 'Try another search word.' : 'Super Shine is not accepting service selections right now. Please check back later or contact support.')}</Text>
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 54, borderRadius: Radius.medium, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 14 },
  intro: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: Space.lg, marginBottom: Space.xl },
  list: { gap: Space.md },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  serviceCard: { backgroundColor: Colors.surface, borderRadius: Radius.large, borderWidth: 1, borderColor: Colors.line, padding: Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.md, flexWrap: 'wrap' },
  serviceCardWide: { width: '48%', flexGrow: 1, flexBasis: 420 },
  unavailableCard: { backgroundColor: Colors.canvas, opacity: 0.72 },
  serviceCopy: { flex: 1, minWidth: 190 },
  serviceName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  serviceDescription: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  servicePrice: { color: Colors.tealDark, fontSize: 12, fontWeight: '700', marginTop: 7 },
  unavailable: { color: Colors.coral, fontSize: 11, fontWeight: '700', marginTop: 4 },
  selectButton: { minHeight: 42, paddingHorizontal: Space.lg },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', marginTop: Space.md },
  emptyText: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
});
