import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CollectionMethod, PaymentMethod, ReturnMethod } from '@/types/domain';

export const CHECKOUT_DRAFT_KEY = '@supershine/customer-checkout-draft-v4';
const LEGACY_CHECKOUT_DRAFT_KEYS = [
  '@supershine/customer-checkout-draft-v3',
  '@supershine/customer-checkout-draft-v2',
];

export type CheckoutDraft = {
  version: 4;
  savedAt: string;
  selected: Record<string, number>;
  servicePreferences: Record<string, Record<string, unknown>>;
  collectionMethod: CollectionMethod;
  returnMethod: ReturnMethod;
  addressId: string;
  newAddress: { label: string; detail: string };
  pickupSlotId: string;
  pickupInstructions: string;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  couponCode: string;
  customerComment: string;
  step: number;
  photoReferences: string[];
};

export function isCheckoutDraftEmpty(draft: CheckoutDraft) {
  return !Object.values(draft.selected).some((quantity) => quantity > 0)
    && !Object.values(draft.servicePreferences).some((options) => Object.keys(options).length > 0)
    && !draft.newAddress.label.trim()
    && !draft.newAddress.detail.trim()
    && !draft.pickupSlotId
    && !draft.pickupInstructions.trim()
    && !draft.couponCode
    && !draft.customerComment.trim()
    && !draft.photoReferences.length;
}

function isValidDraft(value: unknown): value is CheckoutDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<CheckoutDraft>;
  return draft.version === 4 && typeof draft.savedAt === 'string' && Boolean(draft.selected) && Boolean(draft.servicePreferences)
    && ['home_pickup', 'store_dropoff'].includes(String(draft.collectionMethod))
    && ['home_delivery', 'store_collection'].includes(String(draft.returnMethod));
}

export function useCheckoutDraft(current: CheckoutDraft, enabled: boolean) {
  const [savedDraft, setSavedDraft] = useState<CheckoutDraft | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([AsyncStorage.getItem(CHECKOUT_DRAFT_KEY), ...LEGACY_CHECKOUT_DRAFT_KEYS.map((key) => AsyncStorage.getItem(key))])
      .then(([raw, ...legacyValues]) => {
        const legacyRaw = legacyValues.find(Boolean) || null;
        const source = raw || legacyRaw;
        if (!mounted || !source) return;
        try {
          const parsed = JSON.parse(source) as CheckoutDraft | (Omit<CheckoutDraft, 'version'> & { version: 2 | 3 });
          const migrated: CheckoutDraft = parsed.version === 4
            ? parsed
            : {
                ...parsed,
                version: 4,
                // Previous checkouts used separate Preferences and Fulfillment screens.
                // Both service-related screens now restore to Services; Review restores to step 3.
                step: parsed.step <= 2 ? 1 : parsed.step === 3 ? 2 : 3,
              };
          if (isValidDraft(migrated) && !isCheckoutDraftEmpty(migrated)) setSavedDraft(migrated);
          if (!raw && legacyRaw && isValidDraft(migrated)) {
            void AsyncStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(migrated));
            void Promise.all(LEGACY_CHECKOUT_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key)));
          }
        } catch {
          void AsyncStorage.removeItem(CHECKOUT_DRAFT_KEY);
          void Promise.all(LEGACY_CHECKOUT_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key)));
        }
      })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || !enabled) return;
    if (timer.current) clearTimeout(timer.current);
    if (isCheckoutDraftEmpty(current)) {
      void AsyncStorage.removeItem(CHECKOUT_DRAFT_KEY);
      return;
    }
    timer.current = setTimeout(() => {
      void AsyncStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ ...current, savedAt: new Date().toISOString() }));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [current, enabled, ready]);

  const clearDraft = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setSavedDraft(null);
    await AsyncStorage.removeItem(CHECKOUT_DRAFT_KEY);
    await Promise.all(LEGACY_CHECKOUT_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key)));
  }, []);

  return { savedDraft, setSavedDraft, ready, clearDraft };
}
