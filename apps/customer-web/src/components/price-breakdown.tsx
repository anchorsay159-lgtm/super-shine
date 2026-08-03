import { formatMoney } from '@supershine/shared';
import type { LanguageCode } from '@supershine/shared';

export function PriceBreakdown({ preview, language }: { preview: { subtotal: number; pickupFee: number; deliveryFee: number; discount: number; total: number }; language: LanguageCode }) {
  return <div className="price-breakdown"><div className="price-row"><span>Service subtotal</span><strong>{formatMoney(preview.subtotal, language)}</strong></div><div className="price-row"><span>Pickup fee</span><strong>{formatMoney(preview.pickupFee, language)}</strong></div><div className="price-row"><span>Delivery fee</span><strong>{formatMoney(preview.deliveryFee, language)}</strong></div>{preview.discount > 0 ? <div className="price-row"><span>Offer discount</span><strong>−{formatMoney(preview.discount, language)}</strong></div> : null}<div className="price-row total-row"><span>Estimated total</span><span>{formatMoney(preview.total, language)}</span></div></div>;
}
