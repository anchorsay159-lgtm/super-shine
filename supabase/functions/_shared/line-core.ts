export type LineLanguage = 'en' | 'th' | 'my' | 'bn' | 'dz';

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function randomUrlToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256Hex(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export async function hmacSha256Base64(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  let binary = '';
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function verifyHmacSha256Base64(secret: string, body: string, signature: string) {
  try {
    const binary = atob(signature);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body));
  } catch { return false; }
}

export function safeReturnUrl(candidate: unknown, allowlist: string[]) {
  if (typeof candidate !== 'string' || candidate.length > 500) return null;
  return allowlist.includes(candidate) ? candidate : null;
}

export function lineTemplate(type: string, language: LineLanguage, payload: Record<string, unknown>) {
  const orderNumber = String(payload.orderNumber || '');
  const amount = typeof payload.amount === 'number' ? `฿${payload.amount.toFixed(2)}` : '';
  const distanceLabel = String(payload.distanceLabel || 'nearby');
  const fulfillment = String(payload.returnMethod || payload.fulfillment || '');
  const isCollection = fulfillment === 'store_collection';
  const en: Record<string, [string, string]> = {
    order_submitted: ['Order placed', `We’ve received order ${orderNumber}.`],
    order_update: ['Order updated', `There is an update for order ${orderNumber}.`],
    order_confirmed: ['Order confirmed', `We’ve received order ${orderNumber}.`],
    pickup_started: ['Pickup started', `Our driver is on the way for order ${orderNumber}.`],
    laundry_picked_up: ['Laundry picked up', `We have picked up order ${orderNumber}.`],
    awaiting_dropoff: ['Bring your laundry to Super Shine', `We’re ready to receive order ${orderNumber} at the store.`],
    laundry_received: ['Laundry received', `Your laundry for order ${orderNumber} is now at Super Shine.`],
    cleaning_started: ['Cleaning started', `We’ve started caring for order ${orderNumber}.`],
    laundry_ready: [isCollection ? 'Ready for collection' : 'Laundry ready', isCollection ? `Order ${orderNumber} is ready to collect at Super Shine.` : `Order ${orderNumber} is clean and ready for delivery.`],
    ready_for_collection: ['Ready for collection', `Order ${orderNumber} is ready to collect at Super Shine.`],
    delivery_started: ['Out for delivery', `Clean laundry from order ${orderNumber} is on the way.`],
    driver_arriving: ['Driver arriving soon', `Your driver is about ${distanceLabel} away for order ${orderNumber}. Please get ready.`],
    order_delivered: ['Delivered', `Order ${orderNumber} has been delivered.`],
    order_collected: ['Collected', `Order ${orderNumber} has been collected. Thank you!`],
    order_cancelled: ['Order cancelled', `Order ${orderNumber} has been cancelled.`],
    payment_due: ['Payment due', `The final amount for order ${orderNumber} is ready to pay. ${amount}`],
    payment_confirmed: ['Payment confirmed', `We received payment for order ${orderNumber}. ${amount}`],
    payment_failed: ['Payment needs attention', `We could not confirm payment for order ${orderNumber}. Please try again.`],
    payment_refunded: ['Payment refunded', `Your payment for order ${orderNumber} has been refunded. ${amount}`],
    payment_update: ['Payment update', `There is a payment update for order ${orderNumber}.`],
  };
  const translations: Record<LineLanguage, Record<string, [string, string]>> = {
    en,
    th: { ...en, order_confirmed: ['ยืนยันคำสั่งซื้อแล้ว', `เราได้รับคำสั่งซื้อ ${orderNumber} แล้ว`], pickup_started: ['เริ่มรับผ้าแล้ว', `พนักงานกำลังไปรับผ้าสำหรับคำสั่งซื้อ ${orderNumber}`], laundry_ready: [isCollection ? 'พร้อมรับที่ร้าน' : 'ผ้าพร้อมจัดส่ง', isCollection ? `คำสั่งซื้อ ${orderNumber} พร้อมรับที่ Super Shine` : `คำสั่งซื้อ ${orderNumber} ซักเสร็จและพร้อมจัดส่ง`], payment_confirmed: ['ยืนยันการชำระเงินแล้ว', `ได้รับชำระเงินสำหรับคำสั่งซื้อ ${orderNumber} แล้ว ${amount}`] },
    my: { ...en, order_confirmed: ['အော်ဒါအတည်ပြုပြီး', `${orderNumber} အော်ဒါကို လက်ခံရရှိပါပြီ`], laundry_ready: ['အဝတ်များအဆင်သင့်', `${orderNumber} အော်ဒါအဝတ်များ အဆင်သင့်ဖြစ်ပါပြီ`] },
    bn: { ...en, order_confirmed: ['অর্ডার নিশ্চিত হয়েছে', `${orderNumber} অর্ডারটি আমরা পেয়েছি`], laundry_ready: ['লন্ড্রি প্রস্তুত', `${orderNumber} অর্ডারের লন্ড্রি প্রস্তুত`] },
    dz: { ...en, order_confirmed: ['མངགས་ཆ་ངེས་གཏན།', `མངགས་ཆ་ ${orderNumber} ང་བཅས་ཀྱིས་ཐོབ་ཡོད།`], laundry_ready: ['གྲ་སྒྲིག་ཡོད།', `མངགས་ཆ་ ${orderNumber} གྲ་སྒྲིག་ཡོད།`] },
  };
  const [title, body] = (translations[language] || en)[type] || ['Super Shine update', `There is an update for order ${orderNumber}.`];
  return { title, body };
}

function lineVisualStyle(type: string) {
  if (type === 'payment_failed' || type === 'order_cancelled') {
    return { accent: '#C2413B', tint: '#FDECEC', label: 'ACTION NEEDED', icon: '!' };
  }
  if (type === 'payment_due') {
    return { accent: '#B7791F', tint: '#FFF4D6', label: 'PAYMENT UPDATE', icon: '฿' };
  }
  if (type === 'driver_arriving') {
    return { accent: '#C77700', tint: '#FFF4D6', label: 'DRIVER NEARBY', icon: '⌖' };
  }
  if (['payment_confirmed', 'order_delivered', 'order_collected', 'laundry_ready', 'ready_for_collection'].includes(type)) {
    return { accent: '#07867B', tint: '#DDF5F1', label: type.startsWith('payment_') ? 'PAYMENT UPDATE' : 'ORDER UPDATE', icon: '✓' };
  }
  return { accent: '#2767C7', tint: '#E8F0FF', label: type.startsWith('payment_') ? 'PAYMENT UPDATE' : 'ORDER UPDATE', icon: '•' };
}

export function lineFlexMessage(type: string, language: LineLanguage, payload: Record<string, unknown>, link: string) {
  const template = lineTemplate(type, language, payload);
  const orderNumber = String(payload.orderNumber || '');
  const amount = typeof payload.amount === 'number' ? `฿${payload.amount.toFixed(2)}` : '';
  const visual = lineVisualStyle(type);
  const details: Array<Record<string, unknown>> = [
    {
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: 'Order', size: 'sm', color: '#64748B', flex: 0 },
        { type: 'text', text: orderNumber, size: 'sm', color: '#17324D', weight: 'bold', align: 'end' },
      ],
    },
  ];
  if (amount && type.startsWith('payment_')) {
    details.push({
      type: 'box', layout: 'horizontal', margin: 'md', contents: [
        { type: 'text', text: 'Amount', size: 'sm', color: '#64748B', flex: 0 },
        { type: 'text', text: amount, size: 'md', color: visual.accent, weight: 'bold', align: 'end' },
      ],
    });
  }

  const contents: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: visual.accent, paddingAll: '20px', contents: [
        { type: 'text', text: visual.label, color: '#DFFFFB', size: 'xs', weight: 'bold' },
        {
          type: 'box', layout: 'horizontal', margin: 'md', alignItems: 'center', contents: [
            {
              type: 'box', layout: 'vertical', width: '30px', height: '30px', cornerRadius: '15px',
              backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', contents: [
                { type: 'text', text: visual.icon, color: visual.accent, size: 'md', weight: 'bold', align: 'center' },
              ],
            },
            { type: 'text', text: template.title, color: '#FFFFFF', size: 'xl', weight: 'bold', wrap: true, margin: 'md' },
          ],
        },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', contents: [
        ...details,
        { type: 'separator', margin: 'lg', color: '#E2E8F0' },
        { type: 'text', text: template.body.trim(), wrap: true, color: '#334155', size: 'md', margin: 'lg' },
      ],
    },
  };

  if (link) {
    contents.footer = {
      type: 'box', layout: 'vertical', paddingAll: '16px', paddingTop: '0px', contents: [
        {
          type: 'button', style: 'primary', height: 'sm', color: visual.accent,
          action: { type: 'uri', label: 'View order', uri: link },
        },
      ],
    };
  }

  return {
    type: 'flex',
    altText: `${template.title} · Order ${orderNumber}`,
    contents,
  };
}

export function retryableLineStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
