import type { LanguageCode } from './types';

const en = {
  home: 'Home', services: 'Services', cart: 'Cart', orders: 'Orders', profile: 'Profile', notifications: 'Notifications',
  signIn: 'Sign in', createAccount: 'Create account', demo: 'Explore demo', logout: 'Log out',
  welcomeTitle: 'Laundry day, handled.', welcomeBody: 'Schedule a pickup, follow every step, and get fresh laundry back at your door.',
  browseServices: 'Browse services', availableServices: 'Available services', addToCart: 'Add to cart', unavailable: 'Temporarily unavailable',
  checkout: 'Checkout', address: 'Address', pickupTime: 'Pickup time', payment: 'Payment', review: 'Review', placeOrder: 'Place order',
  emptyCart: 'Your cart is empty.', noOrders: 'No orders yet.', noNotifications: 'No notifications yet.',
  loading: 'Loading…', retry: 'Try again', save: 'Save changes', back: 'Back', total: 'Total', subtotal: 'Subtotal',
};

const translations: Record<LanguageCode, Record<keyof typeof en, string>> = {
  en,
  th: { ...en, home: 'หน้าหลัก', services: 'บริการ', cart: 'ตะกร้า', orders: 'คำสั่งซื้อ', profile: 'โปรไฟล์', notifications: 'การแจ้งเตือน', signIn: 'เข้าสู่ระบบ', createAccount: 'สร้างบัญชี', demo: 'ทดลองใช้งาน', logout: 'ออกจากระบบ', welcomeTitle: 'วันซักผ้า จัดการให้แล้ว', browseServices: 'ดูบริการ', availableServices: 'บริการที่มี', addToCart: 'เพิ่มลงตะกร้า', unavailable: 'ไม่พร้อมให้บริการชั่วคราว', checkout: 'ชำระเงิน', placeOrder: 'ยืนยันคำสั่งซื้อ', loading: 'กำลังโหลด…', retry: 'ลองอีกครั้ง', save: 'บันทึก', back: 'กลับ', total: 'ยอดรวม', subtotal: 'ยอดย่อย' },
  my: { ...en, home: 'ပင်မ', services: 'ဝန်ဆောင်မှုများ', cart: 'ခြင်းတောင်း', orders: 'အော်ဒါများ', profile: 'ပရိုဖိုင်', notifications: 'အသိပေးချက်များ', signIn: 'ဝင်ရန်', createAccount: 'အကောင့်ဖွင့်ရန်', demo: 'သရုပ်ပြကြည့်ရန်', logout: 'ထွက်ရန်', browseServices: 'ဝန်ဆောင်မှုများကြည့်ရန်', addToCart: 'ခြင်းတောင်းထဲထည့်ရန်', checkout: 'ငွေရှင်းရန်', placeOrder: 'အော်ဒါတင်ရန်', loading: 'တင်နေသည်…', retry: 'ထပ်ကြိုးစားရန်', save: 'သိမ်းရန်', back: 'နောက်သို့', total: 'စုစုပေါင်း', subtotal: 'အကြမ်းစုစုပေါင်း' },
  bn: { ...en, home: 'হোম', services: 'সেবা', cart: 'কার্ট', orders: 'অর্ডার', profile: 'প্রোফাইল', notifications: 'বিজ্ঞপ্তি', signIn: 'সাইন ইন', createAccount: 'অ্যাকাউন্ট তৈরি করুন', demo: 'ডেমো দেখুন', logout: 'লগ আউট', browseServices: 'সেবা দেখুন', addToCart: 'কার্টে যোগ করুন', checkout: 'চেকআউট', placeOrder: 'অর্ডার করুন', loading: 'লোড হচ্ছে…', retry: 'আবার চেষ্টা করুন', save: 'সংরক্ষণ করুন', back: 'ফিরে যান', total: 'মোট', subtotal: 'উপমোট' },
  dz: { ...en, home: 'ཁྱིམ།', services: 'ཞབས་ཏོག', cart: 'ཉོ་སྣོད།', orders: 'མངགས་ཐོ།', profile: 'གསལ་སྡུད།', notifications: 'བརྡ་བསྐུལ།', signIn: 'ནང་འཛུལ།', createAccount: 'རྩིས་ཐོ་བཟོ།', demo: 'དཔེ་སྟོན།', logout: 'ཕྱིར་ཐོན།', browseServices: 'ཞབས་ཏོག་བལྟ།', addToCart: 'ཉོ་སྣོད་ནང་བཙུགས།', checkout: 'རྩིས་རྐྱབ།', placeOrder: 'མངགས་ཐོ་བཙུགས།', loading: 'བླུག་བཞིན་པ།', retry: 'ལོག་སྟེ་འབད།', save: 'ཉར་ཚགས།', back: 'རྒྱབ།', total: 'བསྡོམས།', subtotal: 'བར་བསྡོམས།' },
};

export function translate(language: LanguageCode, key: keyof typeof en) { return translations[language]?.[key] ?? en[key]; }
export type TranslationKey = keyof typeof en;
