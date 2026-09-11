import enV11 from './locales/en';
import thV11 from './locales/th';
import myV11 from './locales/my';
import bnV11 from './locales/bn';
import dzV11 from './locales/dz';
import securityV14 from './locales/security-v14';

export type LanguageCode = 'en' | 'th' | 'my' | 'bn' | 'dz';

export type LanguageOption = {
  code: LanguageCode;
  name: string;
  nativeName: string;
  badge: string;
};

export const languageOptions: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', badge: 'EN' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', badge: 'TH' },
  { code: 'my', name: 'Burmese (Myanmar)', nativeName: 'မြန်မာဘာသာ', badge: 'MY' },
  { code: 'bn', name: 'Bengali (Bangladesh)', nativeName: 'বাংলা', badge: 'BN' },
  { code: 'dz', name: 'Dzongkha (Bhutan)', nativeName: 'རྫོང་ཁ', badge: 'DZ' },
];

export const LANGUAGE_STORAGE_KEY = '@supershine/language';

type Variables = Record<string, string | number>;
type Dictionary = Record<string, string>;

const th: Dictionary = {
  Home: 'หน้าหลัก', Orders: 'คำสั่งซื้อ', Offers: 'โปรโมชั่น', Profile: 'โปรไฟล์',
  'Good morning,': 'สวัสดีตอนเช้า', 'Open until 9 PM': 'เปิดถึง 21:00 น.',
  'ACTIVE ORDER': 'คำสั่งซื้อที่กำลังดำเนินการ', 'Step 4 of 7': 'ขั้นตอนที่ 4 จาก 7',
  'Track order': 'ติดตามคำสั่งซื้อ', 'Schedule a pickup': 'นัดหมายรับผ้า',
  'Our services': 'บริการของเรา', 'View all': 'ดูทั้งหมด', 'For you': 'สำหรับคุณ',
  'WELCOME OFFER': 'ข้อเสนอต้อนรับ', '20% off your next order': 'ลด 20% สำหรับคำสั่งซื้อถัดไป',
  'Use code FRESH20 at checkout': 'ใช้โค้ด FRESH20 ตอนชำระเงิน', OFF: 'ลด',
  'Next available pickup': 'รอบรับผ้าถัดไป', 'Today, 2:00 PM to 4:00 PM': 'วันนี้ 14:00–16:00 น.',
  'Wash & Fold': 'ซักและพับ', 'Dry Cleaning': 'ซักแห้ง', Ironing: 'รีดผ้า', 'Bedding & Bulky': 'เครื่องนอนและของชิ้นใหญ่',
  'YOUR LAUNDRY': 'รายการซักของคุณ', 'Follow active orders and quickly repeat past services.': 'ติดตามคำสั่งซื้อปัจจุบันและสั่งบริการเดิมได้อย่างรวดเร็ว',
  Current: 'ปัจจุบัน', 'Past orders': 'คำสั่งซื้อที่ผ่านมา', ORDER: 'คำสั่งซื้อ', LIVE: 'สด',
  'Current status': 'สถานะปัจจุบัน', Laundry: 'รายการซัก', Total: 'ยอดรวม',
  'View live tracking': 'ดูการติดตามแบบสด', 'Need help with this order?': 'ต้องการความช่วยเหลือเกี่ยวกับคำสั่งซื้อนี้?',
  'Message Super Shine support': 'ส่งข้อความถึงฝ่ายช่วยเหลือ Super Shine', Delivered: 'จัดส่งแล้ว',
  'Order again': 'สั่งอีกครั้ง', 'No active orders': 'ไม่มีคำสั่งซื้อที่กำลังดำเนินการ',
  'Schedule your first pickup and it will appear here.': 'นัดหมายรับผ้าครั้งแรก แล้วคำสั่งซื้อจะแสดงที่นี่',
  'Start a new order': 'เริ่มคำสั่งซื้อใหม่', New: 'ใหม่', Accepted: 'รับคำสั่งซื้อแล้ว', Pickup: 'กำลังรับผ้า', Washing: 'กำลังซัก', Ready: 'พร้อมจัดส่ง', Cancelled: 'ยกเลิกแล้ว',
  'YOUR ACCOUNT': 'บัญชีของคุณ', Account: 'บัญชี', Preferences: 'การตั้งค่า', Support: 'ช่วยเหลือ',
  'Personal information': 'ข้อมูลส่วนตัว', 'Name, email, and phone': 'ชื่อ อีเมล และโทรศัพท์',
  'Saved addresses': 'ที่อยู่ที่บันทึกไว้', 'Payment methods': 'วิธีชำระเงิน', selected: 'ที่เลือก',
  Notifications: 'การแจ้งเตือน', 'Order and promotion updates': 'อัปเดตคำสั่งซื้อและโปรโมชั่น',
  Language: 'ภาษา', 'Help centre': 'ศูนย์ช่วยเหลือ', 'Contact Super Shine': 'ติดต่อ Super Shine',
  'Sign out': 'ออกจากระบบ', 'Sign out?': 'ออกจากระบบ?', 'You will return to the welcome screen.': 'คุณจะกลับไปยังหน้าต้อนรับ',
  Cancel: 'ยกเลิก', 'Member since July 2026': 'สมาชิกตั้งแต่กรกฎาคม 2026',
  'Super Shine Plus member': 'สมาชิก Super Shine Plus', Saved: 'ประหยัดแล้ว', Points: 'คะแนน',
  'Contact support': 'ติดต่อฝ่ายช่วยเหลือ', 'Invite friends': 'เชิญเพื่อน',
  'Choose the language used throughout Super Shine.': 'เลือกภาษาที่ใช้ทั่วทั้งแอป Super Shine',
  'Apply language': 'ใช้ภาษานี้', 'Language saved': 'บันทึกภาษาแล้ว',
  '{{language}} is now your selected language.': 'เลือกภาษา{{language}}แล้ว', Done: 'เสร็จสิ้น',
  'Personal details': 'ข้อมูลส่วนตัว', 'Full name': 'ชื่อ-นามสกุล', 'Email address': 'อีเมล', 'Phone number': 'หมายเลขโทรศัพท์',
  'Save changes': 'บันทึกการเปลี่ยนแปลง', 'Add another address': 'เพิ่มที่อยู่อื่น',
  'Save address': 'บันทึกที่อยู่', Cash: 'เงินสด', 'PromptPay QR': 'พร้อมเพย์ QR', Card: 'บัตร',
  'Save payment preference': 'บันทึกวิธีชำระเงิน', 'Order updates': 'อัปเดตคำสั่งซื้อ',
  'Pickup reminders': 'แจ้งเตือนรับผ้า', 'Offers and coupons': 'ข้อเสนอและคูปอง',
  'Save notification settings': 'บันทึกการแจ้งเตือน',
};

const dz: Dictionary = {
  Home: 'གདོང་ཤོག', Orders: 'མངགས་ཆ', Offers: 'ཁེ་ཕན', Profile: 'རང་སྐོར',
  'Good morning,': 'སྔ་དྲོ་བདེ་ལེགས།', 'Open until 9 PM': 'ཕྱི་རུ་ཆུ་ཚོད་ ༩ ཚུན་ཚོད་ཁ་ཕྱེ།',
  'ACTIVE ORDER': 'ལཱ་འབད་བའི་མངགས་ཆ', 'Track order': 'མངགས་ཆ་རྗེས་འདེད',
  'Schedule a pickup': 'ལེན་པའི་དུས་ཚོད་བཟོ།', 'Our services': 'ང་བཅས་ཀྱི་ཞབས་ཏོག',
  'View all': 'ཆ་མཉམ་བལྟ།', 'For you': 'ཁྱོད་ཀྱི་དོན་ལུ།', 'WELCOME OFFER': 'བྱོན་པ་ལེགས་ཀྱི་ཁེ་ཕན',
  '20% off your next order': 'ཤུལ་མའི་མངགས་ཆ་ལུ་ 20% མར་ཕབ།', OFF: 'མར་ཕབ',
  'Next available pickup': 'ཤུལ་མའི་ལེན་ཐེངས།',
  'Wash & Fold': 'འཁྱུ་ནི་དང་བལྟབ་ནི།', 'Dry Cleaning': 'སྐམ་འཁྱུ།', Ironing: 'ལྕགས་ཀྱིས་བསྲང་ནི།',
  'YOUR LAUNDRY': 'ཁྱོད་ཀྱི་གྱོན་ཆས།', Current: 'ད་ལྟོ།', 'Past orders': 'ཧེ་མའི་མངགས་ཆ།', ORDER: 'མངགས་ཆ', LIVE: 'ཐད་ཀར',
  'Current status': 'ད་ལྟོའི་གནས་སྟངས།', Laundry: 'འཁྱུ་ཆས།', Total: 'བསྡོམས།',
  'View live tracking': 'ཐད་ཀར་རྗེས་འདེད་བལྟ།', Delivered: 'སྐྱེལ་ཚར།', 'Order again': 'ལོག་མངགས།',
  'No active orders': 'ལཱ་འབད་བའི་མངགས་ཆ་མེད།', 'Start a new order': 'མངགས་ཆ་གསརཔ་འགོ་བཙུགས།',
  New: 'གསརཔ།', Accepted: 'ངོས་ལེན་འབད་ཡོད།', Pickup: 'ལེན་པར་འགྱོ་དོ།', Washing: 'འཁྱུ་དོ།', Ready: 'གྲ་སྒྲིག', Cancelled: 'ཆ་མེད།',
  'YOUR ACCOUNT': 'ཁྱོད་ཀྱི་རྩིས་ཐོ།', Account: 'རྩིས་ཐོ།', Preferences: 'དགའ་གདམ།', Support: 'རྒྱབ་སྐྱོར།',
  'Personal information': 'རང་དོན་བརྡ་དོན།', 'Saved addresses': 'སྲུང་བཞག་ཁ་བྱང་།',
  'Payment methods': 'དངུལ་སྤྲོད་ཐབས།', Notifications: 'བརྡ་བསྐུལ།', Language: 'སྐད་ཡིག',
  'Help centre': 'གྲོགས་རམ་ལྟེ་བ།', 'Contact Super Shine': 'Super Shine ལུ་འབྲེལ་བ།', 'Sign out': 'ཕྱིར་ཐོན།',
  'Sign out?': 'ཕྱིར་ཐོན་ནི་ཨིན་ན?', Cancel: 'ཆ་མེད།', Saved: 'བསྲུངས་ཡོད།', Points: 'སྐར་མ།',
  'Choose the language used throughout Super Shine.': 'Super Shine ནང་ལག་ལེན་འཐབ་ནིའི་སྐད་ཡིག་གདམ་ཁ་རྐྱབ།',
  'Apply language': 'སྐད་ཡིག་ལག་ལེན།', 'Language saved': 'སྐད་ཡིག་སྲུང་ཡོད།', Done: 'འགྲུབ།',
  'Full name': 'མིང་ཆ་ཚང་།', 'Email address': 'གློག་འཕྲིན་ཁ་བྱང་།', 'Phone number': 'ཁ་པར་ཨང་།',
  'Save changes': 'བསྒྱུར་བཅོས་སྲུང་།', Cash: 'དངུལ་རྐྱང་།', 'Order updates': 'མངགས་ཆའི་གསར་བསྒྱུར།',
};

const bn: Dictionary = {
  Home: 'হোম', Orders: 'অর্ডার', Offers: 'অফার', Profile: 'প্রোফাইল',
  'Good morning,': 'সুপ্রভাত,', 'Open until 9 PM': 'রাত ৯টা পর্যন্ত খোলা',
  'ACTIVE ORDER': 'চলমান অর্ডার', 'Step 4 of 7': '৭টির মধ্যে ধাপ ৪', 'Track order': 'অর্ডার ট্র্যাক করুন',
  'Schedule a pickup': 'পিকআপ নির্ধারণ করুন', 'Our services': 'আমাদের সেবা', 'View all': 'সব দেখুন', 'For you': 'আপনার জন্য',
  'WELCOME OFFER': 'স্বাগত অফার', '20% off your next order': 'পরবর্তী অর্ডারে ২০% ছাড়',
  'Use code FRESH20 at checkout': 'চেকআউটে FRESH20 কোড ব্যবহার করুন', OFF: 'ছাড়',
  'Next available pickup': 'পরবর্তী পিকআপ', 'Today, 2:00 PM to 4:00 PM': 'আজ, দুপুর ২টা থেকে ৪টা',
  'Wash & Fold': 'ধোয়া ও ভাঁজ', 'Dry Cleaning': 'ড্রাই ক্লিনিং', Ironing: 'ইস্ত্রি', 'Bedding & Bulky': 'বিছানার জিনিস ও বড় কাপড়',
  'YOUR LAUNDRY': 'আপনার লন্ড্রি', 'Follow active orders and quickly repeat past services.': 'চলমান অর্ডার দেখুন এবং আগের সেবা সহজে আবার নিন।',
  Current: 'চলমান', 'Past orders': 'আগের অর্ডার', ORDER: 'অর্ডার', LIVE: 'লাইভ',
  'Current status': 'বর্তমান অবস্থা', Laundry: 'লন্ড্রি', Total: 'মোট', 'View live tracking': 'লাইভ ট্র্যাকিং দেখুন',
  'Need help with this order?': 'এই অর্ডারে সাহায্য দরকার?', 'Message Super Shine support': 'Super Shine সহায়তায় বার্তা দিন',
  Delivered: 'ডেলিভারি হয়েছে', 'Order again': 'আবার অর্ডার করুন', 'No active orders': 'কোনো চলমান অর্ডার নেই',
  'Schedule your first pickup and it will appear here.': 'প্রথম পিকআপ নির্ধারণ করলে তা এখানে দেখা যাবে।',
  'Start a new order': 'নতুন অর্ডার শুরু করুন', New: 'নতুন', Accepted: 'গ্রহণ করা হয়েছে', Pickup: 'পিকআপ চলছে', Washing: 'ধোয়া হচ্ছে', Ready: 'প্রস্তুত', Cancelled: 'বাতিল',
  'YOUR ACCOUNT': 'আপনার অ্যাকাউন্ট', Account: 'অ্যাকাউন্ট', Preferences: 'পছন্দসমূহ', Support: 'সহায়তা',
  'Personal information': 'ব্যক্তিগত তথ্য', 'Name, email, and phone': 'নাম, ইমেইল ও ফোন', 'Saved addresses': 'সংরক্ষিত ঠিকানা',
  'Payment methods': 'পেমেন্ট পদ্ধতি', selected: 'নির্বাচিত', Notifications: 'বিজ্ঞপ্তি',
  'Order and promotion updates': 'অর্ডার ও অফারের আপডেট', Language: 'ভাষা', 'Help centre': 'সহায়তা কেন্দ্র',
  'Contact Super Shine': 'Super Shine-এর সাথে যোগাযোগ', 'Sign out': 'সাইন আউট', 'Sign out?': 'সাইন আউট করবেন?',
  'You will return to the welcome screen.': 'আপনি স্বাগত স্ক্রিনে ফিরে যাবেন।', Cancel: 'বাতিল',
  'Member since July 2026': 'জুলাই ২০২৬ থেকে সদস্য', 'Super Shine Plus member': 'Super Shine Plus সদস্য', Saved: 'সাশ্রয়', Points: 'পয়েন্ট',
  'Choose the language used throughout Super Shine.': 'Super Shine অ্যাপে ব্যবহারের ভাষা বেছে নিন।',
  'Apply language': 'ভাষা প্রয়োগ করুন', 'Language saved': 'ভাষা সংরক্ষিত হয়েছে',
  '{{language}} is now your selected language.': 'এখন {{language}} আপনার নির্বাচিত ভাষা।', Done: 'সম্পন্ন',
  'Full name': 'পুরো নাম', 'Email address': 'ইমেইল ঠিকানা', 'Phone number': 'ফোন নম্বর', 'Save changes': 'পরিবর্তন সংরক্ষণ করুন',
  'Add another address': 'আরেকটি ঠিকানা যোগ করুন', 'Save address': 'ঠিকানা সংরক্ষণ করুন', Cash: 'নগদ',
  'PromptPay QR': 'PromptPay QR', Card: 'কার্ড', 'Save payment preference': 'পেমেন্ট পছন্দ সংরক্ষণ করুন',
  'Order updates': 'অর্ডার আপডেট', 'Pickup reminders': 'পিকআপ রিমাইন্ডার', 'Offers and coupons': 'অফার ও কুপন',
  'Save notification settings': 'বিজ্ঞপ্তি সেটিংস সংরক্ষণ করুন',
};

const my: Dictionary = {
  Home: 'ပင်မ', Orders: 'အော်ဒါများ', Offers: 'အထူးကမ်းလှမ်းချက်', Profile: 'ကိုယ်ရေးအချက်အလက်',
  'Good morning,': 'မင်္ဂလာနံနက်ခင်းပါ၊', 'Open until 9 PM': 'ည ၉ နာရီအထိ ဖွင့်သည်',
  'ACTIVE ORDER': 'လုပ်ဆောင်နေသော အော်ဒါ', 'Step 4 of 7': 'အဆင့် ၄ / ၇', 'Track order': 'အော်ဒါကို ခြေရာခံရန်',
  'Schedule a pickup': 'အဝတ်လာယူချိန် သတ်မှတ်ရန်', 'Our services': 'ဝန်ဆောင်မှုများ', 'View all': 'အားလုံးကြည့်ရန်', 'For you': 'သင့်အတွက်',
  'WELCOME OFFER': 'ကြိုဆိုအထူးကမ်းလှမ်းချက်', '20% off your next order': 'နောက်အော်ဒါအတွက် ၂၀% လျှော့စျေး',
  'Use code FRESH20 at checkout': 'ငွေရှင်းချိန် FRESH20 ကုဒ်သုံးပါ', OFF: 'လျှော့',
  'Next available pickup': 'နောက်လာယူနိုင်မည့်အချိန်', 'Today, 2:00 PM to 4:00 PM': 'ယနေ့ မွန်းလွဲ ၂:၀၀ မှ ၄:၀၀',
  'Wash & Fold': 'လျှော်ပြီးခေါက်', 'Dry Cleaning': 'အခြောက်လျှော်', Ironing: 'မီးပူတိုက်', 'Bedding & Bulky': 'အိပ်ရာခင်းနှင့် အထည်ကြီး',
  'YOUR LAUNDRY': 'သင့်အဝတ်လျှော်', 'Follow active orders and quickly repeat past services.': 'လက်ရှိအော်ဒါကိုကြည့်ပြီး ယခင်ဝန်ဆောင်မှုကို လွယ်ကူစွာ ထပ်မှာနိုင်သည်။',
  Current: 'လက်ရှိ', 'Past orders': 'ယခင်အော်ဒါများ', ORDER: 'အော်ဒါ', LIVE: 'တိုက်ရိုက်',
  'Current status': 'လက်ရှိအခြေအနေ', Laundry: 'အဝတ်အစား', Total: 'စုစုပေါင်း', 'View live tracking': 'တိုက်ရိုက်ခြေရာခံမှု ကြည့်ရန်',
  'Need help with this order?': 'ဒီအော်ဒါအတွက် အကူအညီလိုပါသလား?', 'Message Super Shine support': 'Super Shine အကူအညီသို့ စာပို့ရန်',
  Delivered: 'ပို့ဆောင်ပြီး', 'Order again': 'ထပ်မှာရန်', 'No active orders': 'လုပ်ဆောင်နေသော အော်ဒါမရှိပါ',
  'Schedule your first pickup and it will appear here.': 'ပထမဆုံးလာယူချိန် သတ်မှတ်ပါ။ အော်ဒါကို ဒီနေရာတွင် တွေ့ရမည်။',
  'Start a new order': 'အော်ဒါအသစ် စတင်ရန်', New: 'အသစ်', Accepted: 'လက်ခံပြီး', Pickup: 'လာယူနေသည်', Washing: 'လျှော်နေသည်', Ready: 'အဆင်သင့်', Cancelled: 'ပယ်ဖျက်ပြီး',
  'YOUR ACCOUNT': 'သင့်အကောင့်', Account: 'အကောင့်', Preferences: 'နှစ်သက်ရာများ', Support: 'အကူအညီ',
  'Personal information': 'ကိုယ်ရေးအချက်အလက်', 'Name, email, and phone': 'အမည်၊ အီးမေးလ်နှင့် ဖုန်း', 'Saved addresses': 'သိမ်းထားသော လိပ်စာများ',
  'Payment methods': 'ငွေပေးချေနည်း', selected: 'ရွေးထားသည်', Notifications: 'အသိပေးချက်များ',
  'Order and promotion updates': 'အော်ဒါနှင့် ပရိုမိုးရှင်း အပ်ဒိတ်', Language: 'ဘာသာစကား', 'Help centre': 'အကူအညီစင်တာ',
  'Contact Super Shine': 'Super Shine ကို ဆက်သွယ်ရန်', 'Sign out': 'ထွက်ရန်', 'Sign out?': 'ထွက်မည်လား?',
  'You will return to the welcome screen.': 'ကြိုဆိုသည့်စာမျက်နှာသို့ ပြန်သွားမည်။', Cancel: 'ပယ်ဖျက်ရန်',
  'Member since July 2026': '၂၀၂၆ ဇူလိုင်မှ စတင်အဖွဲ့ဝင်', 'Super Shine Plus member': 'Super Shine Plus အဖွဲ့ဝင်', Saved: 'ချွေတာငွေ', Points: 'ပွိုင့်',
  'Choose the language used throughout Super Shine.': 'Super Shine အက်ပ်တွင် အသုံးပြုမည့် ဘာသာစကားကို ရွေးပါ။',
  'Apply language': 'ဘာသာစကား အသုံးပြုရန်', 'Language saved': 'ဘာသာစကား သိမ်းပြီး',
  '{{language}} is now your selected language.': '{{language}} ကို ရွေးထားသော ဘာသာစကားအဖြစ် သတ်မှတ်ပြီးပါပြီ။', Done: 'ပြီးပြီ',
  'Full name': 'အမည်အပြည့်အစုံ', 'Email address': 'အီးမေးလ်လိပ်စာ', 'Phone number': 'ဖုန်းနံပါတ်', 'Save changes': 'အပြောင်းအလဲများ သိမ်းရန်',
  'Add another address': 'နောက်ထပ်လိပ်စာ ထည့်ရန်', 'Save address': 'လိပ်စာ သိမ်းရန်', Cash: 'ငွေသား', Card: 'ကတ်',
  'Save payment preference': 'ငွေပေးချေမှုကို သိမ်းရန်', 'Order updates': 'အော်ဒါအပ်ဒိတ်', 'Pickup reminders': 'လာယူချိန် သတိပေးချက်',
  'Offers and coupons': 'အထူးကမ်းလှမ်းချက်နှင့် ကူပွန်', 'Save notification settings': 'အသိပေးချက် ဆက်တင်များ သိမ်းရန်',
};

Object.assign(th, {
  'SAVE MORE': 'ประหยัดมากขึ้น', 'Offers & plans': 'ข้อเสนอและแพ็กเกจ',
  'Apply a coupon or choose a monthly plan for regular laundry.': 'ใช้คูปองหรือเลือกแพ็กเกจรายเดือนสำหรับการซักผ้าเป็นประจำ',
  'Laundry care on repeat': 'ดูแลผ้าของคุณเป็นประจำ', 'Four pickups every month with free delivery.': 'รับผ้าสี่ครั้งต่อเดือนพร้อมจัดส่งฟรี',
  '/ month': '/ เดือน', '4 standard laundry bags': 'ถุงซักผ้ามาตรฐาน 4 ถุง', 'Free pickup and delivery': 'รับและจัดส่งฟรี',
  '10% off extra services': 'ลด 10% สำหรับบริการเพิ่มเติม', 'Plan active': 'แพ็กเกจใช้งานอยู่', 'Choose this plan': 'เลือกแพ็กเกจนี้',
  'Available coupons': 'คูปองที่ใช้ได้', Use: 'ใช้', 'Give ฿100, receive ฿100': 'ให้ ฿100 รับ ฿100',
  'Invite a friend to try Super Shine.': 'ชวนเพื่อนมาลอง Super Shine', 'Read all': 'อ่านทั้งหมด',
  '{{count}} new updates': 'อัปเดตใหม่ {{count}} รายการ', 'You are all caught up': 'คุณอ่านครบแล้ว',
  'Order progress, pickup reminders, and offers appear here.': 'ความคืบหน้าคำสั่งซื้อ การแจ้งเตือนรับผ้า และข้อเสนอจะแสดงที่นี่',
  'Your laundry is washing': 'กำลังซักผ้าของคุณ', 'Pickup confirmed': 'ยืนยันการรับผ้าแล้ว',
  'Fresh laundry, lower price': 'ผ้าสะอาดในราคาที่คุ้มกว่า', '10 min ago': '10 นาทีที่แล้ว', '1 hr ago': '1 ชั่วโมงที่แล้ว', Yesterday: 'เมื่อวาน',
  'All services': 'บริการทั้งหมด', 'Search laundry services': 'ค้นหาบริการซักผ้า', Select: 'เลือก',
  'Choose the care your items need. Final pricing is confirmed after pickup.': 'เลือกการดูแลที่เหมาะกับผ้าของคุณ ราคาสุดท้ายจะยืนยันหลังรับผ้า',
  'No matching service': 'ไม่พบบริการที่ตรงกัน', 'Try another search word.': 'ลองค้นหาด้วยคำอื่น',
  'Fresh, clean, delivered': 'สะอาด สดชื่น ส่งถึงที่', 'Laundry day, handled.': 'วันซักผ้า เราจัดการให้',
  'Schedule a pickup, follow every step, and receive fresh laundry at your door.': 'นัดรับผ้า ติดตามทุกขั้นตอน และรับผ้าสะอาดถึงหน้าประตู',
  'Get started': 'เริ่มต้น', 'I already have an account': 'ฉันมีบัญชีแล้ว',
  'WELCOME BACK': 'ยินดีต้อนรับกลับ', 'JOIN SUPER SHINE': 'เข้าร่วม SUPER SHINE', 'Sign in to continue': 'เข้าสู่ระบบเพื่อดำเนินการต่อ',
  'Create your account': 'สร้างบัญชีของคุณ', 'Track orders, schedule pickups, and manage your laundry.': 'ติดตามคำสั่งซื้อ นัดรับผ้า และจัดการรายการซักของคุณ',
  'Start your first order in less than two minutes.': 'เริ่มคำสั่งซื้อแรกได้ภายในสองนาที', Password: 'รหัสผ่าน',
  'At least 8 characters': 'อย่างน้อย 8 ตัวอักษร', 'Forgot password?': 'ลืมรหัสผ่าน?', 'Sign in': 'เข้าสู่ระบบ', 'Create account': 'สร้างบัญชี',
  'NEW ORDER': 'คำสั่งซื้อใหม่', Service: 'บริการ', Review: 'ตรวจสอบ', 'Choose a service': 'เลือกบริการ',
  'Laundry amount': 'ปริมาณผ้า', 'Standard laundry bag': 'ถุงซักผ้ามาตรฐาน', 'Up to 5 kg per bag': 'ไม่เกิน 5 กก. ต่อถุง',
  'Pickup time': 'เวลารับผ้า', 'Pickup address': 'ที่อยู่รับผ้า', Change: 'เปลี่ยน', Speed: 'ความเร็ว',
  'Express service': 'บริการด่วน', 'Priority completion within 6 hours': 'ดำเนินการแบบเร่งด่วนภายใน 6 ชั่วโมง', Payment: 'การชำระเงิน',
  'Order summary': 'สรุปคำสั่งซื้อ', 'Pickup and delivery': 'รับและจัดส่ง', Free: 'ฟรี', 'Estimated total': 'ยอดรวมโดยประมาณ',
  'Final price is confirmed after Super Shine checks your laundry.': 'Super Shine จะยืนยันราคาสุดท้ายหลังตรวจสอบผ้า', 'Place order': 'ยืนยันคำสั่งซื้อ',
  'ORDER CONFIRMED': 'ยืนยันคำสั่งซื้อแล้ว', 'Pickup scheduled!': 'นัดรับผ้าแล้ว!', 'Order number': 'หมายเลขคำสั่งซื้อ',
  'Pickup window': 'ช่วงเวลารับผ้า', 'Track this order': 'ติดตามคำสั่งซื้อนี้', 'Back to home': 'กลับหน้าหลัก',
  'Order tracking': 'ติดตามคำสั่งซื้อ', 'Order progress': 'ความคืบหน้าคำสั่งซื้อ', 'No active order yet': 'ยังไม่มีคำสั่งซื้อที่กำลังดำเนินการ',
  'Order received': 'ได้รับคำสั่งซื้อแล้ว', 'Order is {{status}}': 'คำสั่งซื้อ: {{status}}', 'Contact support': 'ติดต่อฝ่ายช่วยเหลือ',
  'Reset password': 'รีเซ็ตรหัสผ่าน', 'Check your email': 'ตรวจสอบอีเมล', 'Send again': 'ส่งอีกครั้ง',
  'Forgot your password?': 'ลืมรหัสผ่าน?', 'Enter your account email to receive reset instructions.': 'ป้อนอีเมลบัญชีเพื่อรับคำแนะนำการรีเซ็ต', 'Send reset link': 'ส่งลิงก์รีเซ็ต',
});

Object.assign(dz, {
  'SAVE MORE': 'མངམ་སྲུང་།', 'Offers & plans': 'ཁེ་ཕན་དང་འཆར་གཞི།', 'Laundry care on repeat': 'དུས་རྒྱུན་གྱོན་ཆས་བདག་འཛིན།',
  '/ month': '/ ཟླཝ', 'Free pickup and delivery': 'རིན་མེད་ལེན་ནི་དང་སྐྱེལ་ནི།', 'Choose this plan': 'འཆར་གཞི་འདི་གདམ།',
  'Available coupons': 'ལག་ལེན་འཐབ་ཚུགས་པའི་ཀུ་པོན།', Use: 'ལག་ལེན།', 'Read all': 'ཆ་མཉམ་ལྷག',
  '{{count}} new updates': 'གསར་བསྒྱུར་ {{count}}', 'You are all caught up': 'ཆ་མཉམ་ལྷག་ཚར།',
  'All services': 'ཞབས་ཏོག་ཆ་མཉམ།', 'Search laundry services': 'འཁྱུ་ཞབས་ཏོག་འཚོལ།', Select: 'གདམ།',
  'Fresh, clean, delivered': 'གསརཔ། གཙང་ཏོག་ཏོ། སྐྱེལ་ཡོད།', 'Laundry day, handled.': 'འཁྱུ་ཉིནམ་ང་བཅས་ཀྱིས་འབད།',
  'Get started': 'འགོ་བཙུགས།', 'I already have an account': 'ང་ལུ་རྩིས་ཐོ་ཡོད།',
  'WELCOME BACK': 'ལོག་བྱོན་པ་ལེགས།', 'JOIN SUPER SHINE': 'SUPER SHINE ལུ་མཉམ་འབྲེལ།',
  'Sign in to continue': 'འཕྲོ་མཐུད་ནི་ལུ་ནང་འཛུལ།', 'Create your account': 'ཁྱོད་ཀྱི་རྩིས་ཐོ་བཟོ།', Password: 'གསང་ཡིག',
  'Forgot password?': 'གསང་ཡིག་བརྗེད་སོང་ག?', 'Sign in': 'ནང་འཛུལ།', 'Create account': 'རྩིས་ཐོ་བཟོ།',
  'NEW ORDER': 'མངགས་ཆ་གསརཔ།', Service: 'ཞབས་ཏོག', Review: 'བསྐྱར་ཞིབ།', 'Choose a service': 'ཞབས་ཏོག་གདམ།',
  'Laundry amount': 'འཁྱུ་ཆས་ཀྱི་ཚད།', 'Standard laundry bag': 'འཁྱུ་ཆས་ཕད་ཚད་ལྡན།', 'Pickup time': 'ལེན་དུས།',
  'Pickup address': 'ལེན་སའི་ཁ་བྱང་།', Change: 'བསྒྱུར།', Speed: 'མགྱོགས་ཚད།', 'Express service': 'མགྱོགས་ཞབས་ཏོག',
  Payment: 'དངུལ་སྤྲོད།', 'Order summary': 'མངགས་ཆའི་བསྡུས་དོན།', Free: 'རིན་མེད།', 'Estimated total': 'ཚོད་རྩིས་བསྡོམས།',
  'Place order': 'མངགས་ཆ་བཙུགས།', 'ORDER CONFIRMED': 'མངགས་ཆ་ངེས་གཏན།', 'Pickup scheduled!': 'ལེན་དུས་བཟོ་ཡོད།',
  'Order number': 'མངགས་ཆའི་ཨང་།', 'Pickup window': 'ལེན་དུས་ཚོད།', 'Track this order': 'མངགས་ཆ་འདི་རྗེས་འདེད།',
  'Back to home': 'གདོང་ཤོག་ལུ་ལོག', 'Order tracking': 'མངགས་ཆ་རྗེས་འདེད།', 'Order progress': 'མངགས་ཆའི་ཡར་རྒྱས།',
  'Order received': 'མངགས་ཆ་ཐོབ་ཡོད།', 'Contact support': 'རྒྱབ་སྐྱོར་ལུ་འབྲེལ་བ།', 'Reset password': 'གསང་ཡིག་ལོག་བཟོ།',
});

Object.assign(bn, {
  'SAVE MORE': 'আরও সাশ্রয় করুন', 'Offers & plans': 'অফার ও প্ল্যান', 'Laundry care on repeat': 'নিয়মিত লন্ড্রি যত্ন',
  '/ month': '/ মাস', '4 standard laundry bags': '৪টি সাধারণ লন্ড্রি ব্যাগ', 'Free pickup and delivery': 'বিনামূল্যে পিকআপ ও ডেলিভারি',
  '10% off extra services': 'অতিরিক্ত সেবায় ১০% ছাড়', 'Plan active': 'প্ল্যান সক্রিয়', 'Choose this plan': 'এই প্ল্যান বেছে নিন',
  'Available coupons': 'উপলভ্য কুপন', Use: 'ব্যবহার করুন', 'Give ฿100, receive ฿100': '฿১০০ দিন, ฿১০০ পান',
  'Invite a friend to try Super Shine.': 'বন্ধুকে Super Shine ব্যবহার করতে আমন্ত্রণ জানান।', 'Read all': 'সব পড়ুন',
  '{{count}} new updates': '{{count}}টি নতুন আপডেট', 'You are all caught up': 'সব আপডেট দেখা হয়েছে',
  'Your laundry is washing': 'আপনার কাপড় ধোয়া হচ্ছে', 'Pickup confirmed': 'পিকআপ নিশ্চিত',
  'All services': 'সব সেবা', 'Search laundry services': 'লন্ড্রি সেবা খুঁজুন', Select: 'নির্বাচন করুন',
  'No matching service': 'মিলে এমন সেবা নেই', 'Try another search word.': 'অন্য শব্দ দিয়ে খুঁজুন।',
  'Fresh, clean, delivered': 'সতেজ, পরিষ্কার, ডেলিভারি', 'Laundry day, handled.': 'লন্ড্রির কাজ, আমাদের দায়িত্ব।',
  'Get started': 'শুরু করুন', 'I already have an account': 'আমার ইতিমধ্যে অ্যাকাউন্ট আছে',
  'WELCOME BACK': 'আবার স্বাগতম', 'JOIN SUPER SHINE': 'SUPER SHINE-এ যোগ দিন', 'Sign in to continue': 'চালিয়ে যেতে সাইন ইন করুন',
  'Create your account': 'আপনার অ্যাকাউন্ট তৈরি করুন', Password: 'পাসওয়ার্ড', 'At least 8 characters': 'কমপক্ষে ৮ অক্ষর',
  'Forgot password?': 'পাসওয়ার্ড ভুলে গেছেন?', 'Sign in': 'সাইন ইন', 'Create account': 'অ্যাকাউন্ট তৈরি করুন',
  'NEW ORDER': 'নতুন অর্ডার', Service: 'সেবা', Review: 'পর্যালোচনা', 'Choose a service': 'সেবা বেছে নিন',
  'Laundry amount': 'লন্ড্রির পরিমাণ', 'Standard laundry bag': 'সাধারণ লন্ড্রি ব্যাগ', 'Up to 5 kg per bag': 'প্রতি ব্যাগে সর্বোচ্চ ৫ কেজি',
  'Pickup time': 'পিকআপের সময়', 'Pickup address': 'পিকআপ ঠিকানা', Change: 'পরিবর্তন', Speed: 'গতি',
  'Express service': 'এক্সপ্রেস সেবা', 'Priority completion within 6 hours': '৬ ঘণ্টার মধ্যে অগ্রাধিকার ভিত্তিতে সম্পন্ন', Payment: 'পেমেন্ট',
  'Order summary': 'অর্ডারের সারাংশ', 'Pickup and delivery': 'পিকআপ ও ডেলিভারি', Free: 'বিনামূল্যে', 'Estimated total': 'আনুমানিক মোট',
  'Place order': 'অর্ডার করুন', 'ORDER CONFIRMED': 'অর্ডার নিশ্চিত', 'Pickup scheduled!': 'পিকআপ নির্ধারিত!',
  'Order number': 'অর্ডার নম্বর', 'Pickup window': 'পিকআপ সময়', 'Track this order': 'এই অর্ডার ট্র্যাক করুন', 'Back to home': 'হোমে ফিরুন',
  'Order tracking': 'অর্ডার ট্র্যাকিং', 'Order progress': 'অর্ডারের অগ্রগতি', 'No active order yet': 'এখনো কোনো চলমান অর্ডার নেই',
  'Order received': 'অর্ডার পাওয়া গেছে', 'Order is {{status}}': 'অর্ডার {{status}}', 'Contact support': 'সহায়তায় যোগাযোগ করুন',
  'Reset password': 'পাসওয়ার্ড রিসেট', 'Check your email': 'ইমেইল দেখুন', 'Send again': 'আবার পাঠান',
  'Forgot your password?': 'পাসওয়ার্ড ভুলে গেছেন?', 'Send reset link': 'রিসেট লিংক পাঠান',
});

Object.assign(my, {
  'SAVE MORE': 'ပိုမိုသက်သာရန်', 'Offers & plans': 'ကမ်းလှမ်းချက်နှင့် အစီအစဉ်များ', 'Laundry care on repeat': 'ပုံမှန်အဝတ်လျှော်စောင့်ရှောက်မှု',
  '/ month': '/ လ', '4 standard laundry bags': 'ပုံမှန်အဝတ်လျှော်အိတ် ၄ အိတ်', 'Free pickup and delivery': 'လာယူခြင်းနှင့် ပို့ဆောင်ခြင်း အခမဲ့',
  '10% off extra services': 'အပိုဝန်ဆောင်မှု ၁၀% လျှော့', 'Plan active': 'အစီအစဉ် အသုံးပြုနေသည်', 'Choose this plan': 'ဒီအစီအစဉ်ကို ရွေးရန်',
  'Available coupons': 'ရရှိနိုင်သော ကူပွန်များ', Use: 'သုံးရန်', 'Read all': 'အားလုံးဖတ်ရန်',
  '{{count}} new updates': 'အပ်ဒိတ်အသစ် {{count}} ခု', 'You are all caught up': 'အားလုံးဖတ်ပြီးပါပြီ',
  'Your laundry is washing': 'သင့်အဝတ်များ လျှော်နေသည်', 'Pickup confirmed': 'လာယူရန် အတည်ပြုပြီး',
  'All services': 'ဝန်ဆောင်မှုအားလုံး', 'Search laundry services': 'အဝတ်လျှော်ဝန်ဆောင်မှု ရှာရန်', Select: 'ရွေးရန်',
  'No matching service': 'ကိုက်ညီသော ဝန်ဆောင်မှုမရှိပါ', 'Try another search word.': 'အခြားစကားလုံးဖြင့် ရှာပါ။',
  'Fresh, clean, delivered': 'သန့်ရှင်းလတ်ဆတ်၊ ပို့ဆောင်ပြီး', 'Laundry day, handled.': 'အဝတ်လျှော်တာ ကျွန်ုပ်တို့တာဝန်။',
  'Get started': 'စတင်ရန်', 'I already have an account': 'အကောင့်ရှိပြီးသားပါ',
  'WELCOME BACK': 'ပြန်လည်ကြိုဆိုပါသည်', 'JOIN SUPER SHINE': 'SUPER SHINE သို့ ဝင်ပါ', 'Sign in to continue': 'ဆက်လုပ်ရန် ဝင်ပါ',
  'Create your account': 'သင့်အကောင့် ဖန်တီးပါ', Password: 'စကားဝှက်', 'At least 8 characters': 'အနည်းဆုံး စာလုံး ၈ လုံး',
  'Forgot password?': 'စကားဝှက် မေ့နေပါသလား?', 'Sign in': 'ဝင်ရန်', 'Create account': 'အကောင့်ဖန်တီးရန်',
  'NEW ORDER': 'အော်ဒါအသစ်', Service: 'ဝန်ဆောင်မှု', Review: 'ပြန်စစ်ရန်', 'Choose a service': 'ဝန်ဆောင်မှု ရွေးရန်',
  'Laundry amount': 'အဝတ်ပမာဏ', 'Standard laundry bag': 'ပုံမှန်အဝတ်လျှော်အိတ်', 'Up to 5 kg per bag': 'တစ်အိတ်လျှင် ၅ ကီလိုအထိ',
  'Pickup time': 'လာယူချိန်', 'Pickup address': 'လာယူမည့်လိပ်စာ', Change: 'ပြောင်းရန်', Speed: 'အမြန်နှုန်း',
  'Express service': 'အမြန်ဝန်ဆောင်မှု', 'Priority completion within 6 hours': '၆ နာရီအတွင်း ဦးစားပေးပြီးစီးမည်', Payment: 'ငွေပေးချေမှု',
  'Order summary': 'အော်ဒါအကျဉ်းချုပ်', 'Pickup and delivery': 'လာယူခြင်းနှင့် ပို့ဆောင်ခြင်း', Free: 'အခမဲ့', 'Estimated total': 'ခန့်မှန်းစုစုပေါင်း',
  'Place order': 'အော်ဒါတင်ရန်', 'ORDER CONFIRMED': 'အော်ဒါအတည်ပြုပြီး', 'Pickup scheduled!': 'လာယူချိန် သတ်မှတ်ပြီး!',
  'Order number': 'အော်ဒါနံပါတ်', 'Pickup window': 'လာယူမည့်အချိန်', 'Track this order': 'ဒီအော်ဒါကို ခြေရာခံရန်', 'Back to home': 'ပင်မသို့ ပြန်ရန်',
  'Order tracking': 'အော်ဒါခြေရာခံခြင်း', 'Order progress': 'အော်ဒါတိုးတက်မှု', 'No active order yet': 'လုပ်ဆောင်နေသော အော်ဒါမရှိသေးပါ',
  'Order received': 'အော်ဒါလက်ခံရရှိပြီး', 'Order is {{status}}': 'အော်ဒါ {{status}}', 'Contact support': 'အကူအညီ ဆက်သွယ်ရန်',
  'Reset password': 'စကားဝှက်ပြန်သတ်မှတ်ရန်', 'Check your email': 'အီးမေးလ် စစ်ဆေးပါ', 'Send again': 'ထပ်ပို့ရန်',
  'Forgot your password?': 'စကားဝှက် မေ့နေပါသလား?', 'Send reset link': 'ပြန်သတ်မှတ်ရန် လင့်ခ်ပို့ပါ',
});

const customerV14: Record<Exclude<LanguageCode, 'en'>, Dictionary> = {
  th: {
    'Choose language': 'เลือกภาษา', 'Explore demo': 'ทดลองใช้แอป', 'Welcome back': 'ยินดีต้อนรับกลับ',
    'Sign in to track orders and schedule pickups.': 'ลงชื่อเข้าใช้เพื่อติดตามคำสั่งซื้อและนัดรับผ้า',
    'Create an account to schedule your first pickup.': 'สร้างบัญชีเพื่อนัดรับผ้าครั้งแรก',
    'Schedule a pickup, track every step, and receive fresh laundry at your door.': 'นัดรับผ้า ติดตามทุกขั้นตอน และรับผ้าสะอาดสดชื่นถึงหน้าประตู',
    'Enter your full name.': 'กรอกชื่อ-นามสกุล', 'Enter a valid phone number.': 'กรอกหมายเลขโทรศัพท์ที่ถูกต้อง', 'Enter a valid email address.': 'กรอกอีเมลที่ถูกต้อง', 'Use at least 8 characters.': 'ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร',
    'Already have an account? Sign in': 'มีบัญชีแล้ว? เข้าสู่ระบบ', 'New to Super Shine? Create an account': 'ยังไม่มีบัญชี Super Shine? สร้างบัญชี',
    'Show password': 'แสดงรหัสผ่าน', 'Hide password': 'ซ่อนรหัสผ่าน', 'Explore demo from the welcome screen': 'ทดลองใช้จากหน้าต้อนรับ',
    'Step {{step}} of 5': 'ขั้นตอนที่ {{step}} จาก 5', Services: 'บริการ', Preferences: 'การตั้งค่าผ้า', Pickup: 'การรับผ้า', Continue: 'ดำเนินการต่อ', Back: 'ย้อนกลับ', Close: 'ปิด',
    'Continue your order?': 'ทำคำสั่งซื้อต่อหรือไม่', 'Continue draft': 'ทำรายการต่อ', Discard: 'ละทิ้ง', 'Leave checkout?': 'ออกจากการสั่งซื้อหรือไม่', Leave: 'ออก', 'Keep editing': 'แก้ไขต่อ',
    'Pickup details': 'รายละเอียดการรับผ้า', 'Contact phone': 'เบอร์ติดต่อ', 'Add another address': 'เพิ่มที่อยู่อื่น', 'Address label': 'ชื่อที่อยู่', 'Full address': 'ที่อยู่เต็ม',
    'Add pickup instructions': 'เพิ่มคำแนะนำการรับผ้า', Optional: 'ไม่บังคับ', Coupons: 'คูปอง', 'View all coupons': 'ดูคูปองทั้งหมด', 'Remove coupon': 'นำคูปองออก', Apply: 'ใช้', Ineligible: 'ใช้ไม่ได้',
    'Review your order': 'ตรวจสอบคำสั่งซื้อ', 'Services and price': 'บริการและราคา', 'Status history': 'ประวัติสถานะ', 'Uploaded files': 'ไฟล์ที่อัปโหลด',
    Today: 'วันนี้', Earlier: 'ก่อนหน้านี้', Older: 'เก่ากว่า', 'Quick settings': 'การตั้งค่าด่วน', Settings: 'การตั้งค่า', Edit: 'แก้ไข', Open: 'เปิด', Closed: 'ปิด', 'View all active orders': 'ดูคำสั่งซื้อที่กำลังดำเนินการทั้งหมด',
  },
  my: {
    'Choose language': 'ဘာသာစကား ရွေးပါ', 'Explore demo': 'သရုပ်ပြကို စမ်းကြည့်ပါ', 'Welcome back': 'ပြန်လည်ကြိုဆိုပါသည်',
    'Sign in to track orders and schedule pickups.': 'အော်ဒါခြေရာခံရန်နှင့် လာယူချိန်သတ်မှတ်ရန် ဝင်ပါ။',
    'Create an account to schedule your first pickup.': 'ပထမဆုံးလာယူချိန် သတ်မှတ်ရန် အကောင့်ဖန်တီးပါ။',
    'Schedule a pickup, track every step, and receive fresh laundry at your door.': 'လာယူချိန်သတ်မှတ်၊ အဆင့်တိုင်းခြေရာခံပြီး သန့်ရှင်းသောအဝတ်ကို အိမ်တိုင်ရာရောက် လက်ခံပါ။',
    'Enter your full name.': 'အမည်အပြည့်အစုံ ထည့်ပါ။', 'Enter a valid phone number.': 'မှန်ကန်သော ဖုန်းနံပါတ် ထည့်ပါ။', 'Enter a valid email address.': 'မှန်ကန်သော အီးမေးလ် ထည့်ပါ။', 'Use at least 8 characters.': 'အနည်းဆုံး စာလုံး ၈ လုံး သုံးပါ။',
    'Already have an account? Sign in': 'အကောင့်ရှိပြီးသားလား? ဝင်ပါ', 'New to Super Shine? Create an account': 'Super Shine အသစ်လား? အကောင့်ဖန်တီးပါ',
    'Show password': 'စကားဝှက်ပြပါ', 'Hide password': 'စကားဝှက်ဖျောက်ပါ', 'Explore demo from the welcome screen': 'ကြိုဆိုစာမျက်နှာမှ သရုပ်ပြကို စမ်းပါ',
    'Step {{step}} of 5': 'အဆင့် {{step}} / ၅', Services: 'ဝန်ဆောင်မှုများ', Preferences: 'ရွေးချယ်မှုများ', Pickup: 'လာယူခြင်း', Continue: 'ဆက်လုပ်ရန်', Back: 'နောက်သို့', Close: 'ပိတ်ရန်',
    'Continue your order?': 'အော်ဒါကို ဆက်လုပ်မလား', 'Continue draft': 'မူကြမ်းဆက်လုပ်ရန်', Discard: 'ပယ်ဖျက်ရန်', 'Leave checkout?': 'အော်ဒါစာမျက်နှာမှ ထွက်မလား', Leave: 'ထွက်ရန်', 'Keep editing': 'ဆက်ပြင်ရန်',
    'Pickup details': 'လာယူမှုအသေးစိတ်', 'Contact phone': 'ဆက်သွယ်ရန်ဖုန်း', 'Add another address': 'အခြားလိပ်စာထည့်ရန်', 'Address label': 'လိပ်စာအမည်', 'Full address': 'လိပ်စာအပြည့်အစုံ',
    'Add pickup instructions': 'လာယူရန်ညွှန်ကြားချက် ထည့်ပါ', Optional: 'ရွေးချယ်နိုင်', Coupons: 'ကူပွန်များ', 'View all coupons': 'ကူပွန်အားလုံးကြည့်ရန်', 'Remove coupon': 'ကူပွန်ဖယ်ရန်', Apply: 'အသုံးပြုရန်', Ineligible: 'အသုံးမပြုနိုင်',
    'Review your order': 'အော်ဒါပြန်စစ်ပါ', 'Services and price': 'ဝန်ဆောင်မှုနှင့်ဈေးနှုန်း', 'Status history': 'အခြေအနေမှတ်တမ်း', 'Uploaded files': 'တင်ထားသောဖိုင်များ',
    Today: 'ယနေ့', Earlier: 'အစောပိုင်း', Older: 'အဟောင်းများ', 'Quick settings': 'အမြန်ဆက်တင်', Settings: 'ဆက်တင်များ', Edit: 'ပြင်ရန်', Open: 'ဖွင့်', Closed: 'ပိတ်', 'View all active orders': 'လုပ်ဆောင်နေသော အော်ဒါအားလုံးကြည့်ရန်',
  },
  bn: {
    'Choose language': 'ভাষা বেছে নিন', 'Explore demo': 'ডেমো দেখুন', 'Welcome back': 'আবার স্বাগতম',
    'Sign in to track orders and schedule pickups.': 'অর্ডার ট্র্যাক ও পিকআপ ঠিক করতে সাইন ইন করুন।',
    'Create an account to schedule your first pickup.': 'প্রথম পিকআপ ঠিক করতে একটি অ্যাকাউন্ট তৈরি করুন।',
    'Schedule a pickup, track every step, and receive fresh laundry at your door.': 'পিকআপ ঠিক করুন, প্রতিটি ধাপ অনুসরণ করুন এবং দরজায় পরিষ্কার কাপড় নিন।',
    'Enter your full name.': 'আপনার পুরো নাম লিখুন।', 'Enter a valid phone number.': 'একটি সঠিক ফোন নম্বর লিখুন।', 'Enter a valid email address.': 'একটি সঠিক ইমেইল লিখুন।', 'Use at least 8 characters.': 'কমপক্ষে ৮টি অক্ষর ব্যবহার করুন।',
    'Already have an account? Sign in': 'আগেই অ্যাকাউন্ট আছে? সাইন ইন করুন', 'New to Super Shine? Create an account': 'Super Shine-এ নতুন? অ্যাকাউন্ট তৈরি করুন',
    'Show password': 'পাসওয়ার্ড দেখান', 'Hide password': 'পাসওয়ার্ড লুকান', 'Explore demo from the welcome screen': 'স্বাগতম পৃষ্ঠা থেকে ডেমো দেখুন',
    'Step {{step}} of 5': '৫টির মধ্যে ধাপ {{step}}', Services: 'সেবা', Preferences: 'পছন্দসমূহ', Pickup: 'পিকআপ', Continue: 'চালিয়ে যান', Back: 'পেছনে', Close: 'বন্ধ করুন',
    'Continue your order?': 'অর্ডারটি চালিয়ে যাবেন?', 'Continue draft': 'খসড়া চালিয়ে যান', Discard: 'বাতিল করুন', 'Leave checkout?': 'চেকআউট ছাড়বেন?', Leave: 'ছেড়ে যান', 'Keep editing': 'সম্পাদনা চালিয়ে যান',
    'Pickup details': 'পিকআপের বিবরণ', 'Contact phone': 'যোগাযোগের ফোন', 'Add another address': 'আরেকটি ঠিকানা যোগ করুন', 'Address label': 'ঠিকানার নাম', 'Full address': 'সম্পূর্ণ ঠিকানা',
    'Add pickup instructions': 'পিকআপ নির্দেশনা যোগ করুন', Optional: 'ঐচ্ছিক', Coupons: 'কুপন', 'View all coupons': 'সব কুপন দেখুন', 'Remove coupon': 'কুপন সরান', Apply: 'প্রয়োগ করুন', Ineligible: 'প্রযোজ্য নয়',
    'Review your order': 'অর্ডার পর্যালোচনা করুন', 'Services and price': 'সেবা ও মূল্য', 'Status history': 'স্ট্যাটাসের ইতিহাস', 'Uploaded files': 'আপলোড করা ফাইল',
    Today: 'আজ', Earlier: 'আগের', Older: 'পুরোনো', 'Quick settings': 'দ্রুত সেটিংস', Settings: 'সেটিংস', Edit: 'সম্পাদনা', Open: 'খোলা', Closed: 'বন্ধ', 'View all active orders': 'সব চলমান অর্ডার দেখুন',
  },
  dz: {
    'Choose language': 'སྐད་ཡིག་གདམ་ཁ་རྐྱབ།', 'Explore demo': 'དཔེ་སྟོན་བལྟ།', 'Welcome back': 'ལོག་ཕེབས་པར་ལེགས་སོ།',
    'Sign in to track orders and schedule pickups.': 'མངགས་ཆ་རྗེས་འདེད་དང་ལེན་དུས་བཀོད་ནིར་ནང་འཛུལ།',
    'Create an account to schedule your first pickup.': 'ལེན་དུས་དང་པ་བཀོད་ནིར་རྩིས་ཐོ་གསརཔ་བཟོ།',
    'Schedule a pickup, track every step, and receive fresh laundry at your door.': 'ལེན་དུས་བཀོད། གོ་རིམ་ཆ་མཉམ་རྗེས་འདེད་འབད། གཙང་སྦྲ་ཅན་གྱི་གྱོན་ཆས་སྒོ་ཁར་ལེན།',
    'Enter your full name.': 'མིང་ཆ་ཚང་བཙུགས།', 'Enter a valid phone number.': 'ཁ་པར་ཨང་ནུས་ཅན་བཙུགས།', 'Enter a valid email address.': 'གློག་འཕྲིན་ནུས་ཅན་བཙུགས།', 'Use at least 8 characters.': 'ཡིག་འབྲུ་ཉུང་མཐའ་ ༨ ལག་ལེན་འཐབ།',
    'Already have an account? Sign in': 'རྩིས་ཐོ་ཡོད་ག? ནང་འཛུལ།', 'New to Super Shine? Create an account': 'Super Shine གསརཔ་ཨིན་ན? རྩིས་ཐོ་བཟོ།',
    'Show password': 'གསང་ཡིག་སྟོན།', 'Hide password': 'གསང་ཡིག་སྦ།', 'Explore demo from the welcome screen': 'དགའ་བསུའི་ཤོག་ལེབ་ལས་དཔེ་སྟོན་བལྟ།',
    'Step {{step}} of 5': 'གོ་རིམ་ {{step}}/༥', Services: 'ཞབས་ཏོག', Preferences: 'དགའ་གདམ།', Pickup: 'ལེན་ནི།', Continue: 'འཕྲོ་མཐུད།', Back: 'རྒྱབ།', Close: 'ཁ་བསྡམ།',
    'Continue your order?': 'མངགས་ཆ་འཕྲོ་མཐུད་ནི་ཨིན་ན?', 'Continue draft': 'ཟིན་བྲིས་འཕྲོ་མཐུད།', Discard: 'བཏོན་གཏང་།', 'Leave checkout?': 'མངགས་ཆ་ལས་འཐོན་ནི་ཨིན་ན?', Leave: 'འཐོན།', 'Keep editing': 'ཞུན་དག་འཕྲོ་མཐུད།',
    'Pickup details': 'ལེན་ནིའི་ཁ་གསལ།', 'Contact phone': 'འབྲེལ་བའི་ཁ་པར།', 'Add another address': 'ཁ་བྱང་གཞན་ཁ་སྐོང་།', 'Address label': 'ཁ་བྱང་མིང་།', 'Full address': 'ཁ་བྱང་ཆ་ཚང་།',
    'Add pickup instructions': 'ལེན་ནིའི་བཀོད་རྒྱ་ཁ་སྐོང་།', Optional: 'གདམ་ཁ་ཅན།', Coupons: 'ཀུ་པོན།', 'View all coupons': 'ཀུ་པོན་ཆ་མཉམ་བལྟ།', 'Remove coupon': 'ཀུ་པོན་བཏོན།', Apply: 'ལག་ལེན།', Ineligible: 'མི་འོས།',
    'Review your order': 'མངགས་ཆ་བསྐྱར་ཞིབ།', 'Services and price': 'ཞབས་ཏོག་དང་གོང་།', 'Status history': 'གནས་ཚད་ལོ་རྒྱུས།', 'Uploaded files': 'སྐྱེལ་བའི་ཡིག་ཆ།',
    Today: 'ད་རིས།', Earlier: 'ཧེ་མ།', Older: 'རྙིངམ།', 'Quick settings': 'མགྱོགས་སྒྲིག', Settings: 'སྒྲིག་སྟངས།', Edit: 'ཞུན་དག', Open: 'ཁ་ཕྱེ།', Closed: 'ཁ་བསྡམས།', 'View all active orders': 'ལཱ་འབད་བའི་མངགས་ཆ་ཆ་མཉམ་བལྟ།',
  },
};

const couponV15: Record<LanguageCode, Dictionary> = {
  en: {
    Available: 'Available', 'Temporarily unavailable': 'Temporarily unavailable',
    'All services are temporarily unavailable.': 'All services are temporarily unavailable.',
    'Please check back later or contact Super Shine.': 'Please check back later or contact Super Shine.',
    'This service is temporarily unavailable.': 'This service is temporarily unavailable.',
    'We could not load available offers.': 'We could not load available offers.',
    'This offer is no longer available.': 'This offer is no longer available.',
    'Service subtotal': 'Service subtotal', 'Eligible service subtotal': 'Eligible service subtotal',
    'Pickup and delivery fees': 'Pickup and delivery fees', 'Applies to {{target}}': 'Applies to {{target}}',
    'Eligible services: {{services}}': 'Eligible services: {{services}}', 'Free {{target}}': 'Free {{target}}',
    'Coupon discount · {{target}}': 'Coupon discount · {{target}}',
  },
  th: {
    Available: 'พร้อมให้บริการ', 'Temporarily unavailable': 'ไม่พร้อมให้บริการชั่วคราว',
    'All services are temporarily unavailable.': 'บริการทั้งหมดไม่พร้อมให้บริการชั่วคราว',
    'Please check back later or contact Super Shine.': 'โปรดลองอีกครั้งภายหลังหรือติดต่อ Super Shine',
    'This service is temporarily unavailable.': 'บริการนี้ไม่พร้อมให้บริการชั่วคราว',
    'We could not load available offers.': 'ไม่สามารถโหลดข้อเสนอที่ใช้ได้ โปรดลองอีกครั้ง',
    'This offer is no longer available.': 'ข้อเสนอนี้ไม่สามารถใช้ได้แล้ว',
    'Service subtotal': 'ยอดรวมค่าบริการ', 'Eligible service subtotal': 'ยอดรวมบริการที่ร่วมรายการ',
    'Pickup and delivery fees': 'ค่ารับและส่งผ้า', 'Applies to {{target}}': 'ใช้กับ{{target}}',
    'Eligible services: {{services}}': 'บริการที่ร่วมรายการ: {{services}}', 'Free {{target}}': 'ฟรี{{target}}',
    'Coupon discount · {{target}}': 'ส่วนลดคูปอง · {{target}}',
  },
  my: {
    Available: 'ရရှိနိုင်သည်', 'Temporarily unavailable': 'ယာယီမရရှိနိုင်ပါ',
    'All services are temporarily unavailable.': 'ဝန်ဆောင်မှုအားလုံး ယာယီမရရှိနိုင်ပါ။',
    'Please check back later or contact Super Shine.': 'နောက်မှ ထပ်မံစစ်ဆေးပါ သို့မဟုတ် Super Shine ကို ဆက်သွယ်ပါ။',
    'This service is temporarily unavailable.': 'ဤဝန်ဆောင်မှုကို ယာယီမရရှိနိုင်ပါ။',
    'We could not load available offers.': 'ရရှိနိုင်သော ကမ်းလှမ်းချက်များကို မဖွင့်နိုင်ပါ။',
    'This offer is no longer available.': 'ဤကမ်းလှမ်းချက်ကို မရရှိနိုင်တော့ပါ။',
    'Service subtotal': 'ဝန်ဆောင်မှု စုစုပေါင်းခွဲ', 'Eligible service subtotal': 'အကျုံးဝင်ဝန်ဆောင်မှု စုစုပေါင်းခွဲ',
    'Pickup and delivery fees': 'လာယူခနှင့် ပို့ဆောင်ခ', 'Applies to {{target}}': '{{target}} အတွက် သက်ဆိုင်သည်',
    'Eligible services: {{services}}': 'အကျုံးဝင်ဝန်ဆောင်မှုများ: {{services}}', 'Free {{target}}': '{{target}} အခမဲ့',
    'Coupon discount · {{target}}': 'ကူပွန်လျှော့ဈေး · {{target}}',
  },
  bn: {
    Available: 'উপলভ্য', 'Temporarily unavailable': 'সাময়িকভাবে অনুপলভ্য',
    'All services are temporarily unavailable.': 'সব সেবা সাময়িকভাবে অনুপলভ্য।',
    'Please check back later or contact Super Shine.': 'পরে আবার দেখুন অথবা Super Shine-এর সাথে যোগাযোগ করুন।',
    'This service is temporarily unavailable.': 'এই সেবাটি সাময়িকভাবে অনুপলভ্য।',
    'We could not load available offers.': 'উপলভ্য অফার লোড করা যায়নি।',
    'This offer is no longer available.': 'এই অফারটি আর উপলভ্য নয়।',
    'Service subtotal': 'সেবার উপমোট', 'Eligible service subtotal': 'যোগ্য সেবার উপমোট',
    'Pickup and delivery fees': 'পিকআপ ও ডেলিভারি ফি', 'Applies to {{target}}': '{{target}}-এ প্রযোজ্য',
    'Eligible services: {{services}}': 'যোগ্য সেবা: {{services}}', 'Free {{target}}': 'বিনামূল্যে {{target}}',
    'Coupon discount · {{target}}': 'কুপন ছাড় · {{target}}',
  },
  dz: {
    Available: 'ཐོབ་ཚུགས།', 'Temporarily unavailable': 'གནས་སྐབས་ཅིག་མི་ཐོབ།',
    'All services are temporarily unavailable.': 'ཞབས་ཏོག་ཆ་མཉམ་གནས་སྐབས་ཅིག་མི་ཐོབ།',
    'Please check back later or contact Super Shine.': 'ཤུལ་ལས་ལོག་ཞིབ་དཔྱད་འབད་ ཡང་ན་ Super Shine ལུ་འབྲེལ་བ་འཐབ།',
    'This service is temporarily unavailable.': 'ཞབས་ཏོག་འདི་གནས་སྐབས་ཅིག་མི་ཐོབ།',
    'We could not load available offers.': 'ཐོབ་ཚུགས་པའི་ཁེ་ཕན་ཚུ་བཀལ་མ་ཚུགས།',
    'This offer is no longer available.': 'ཁེ་ཕན་འདི་ད་ལས་ཕར་མི་ཐོབ།',
    'Service subtotal': 'ཞབས་ཏོག་བསྡོམས་ཆུང་།', 'Eligible service subtotal': 'འོས་འབབ་ཞབས་ཏོག་བསྡོམས་ཆུང་།',
    'Pickup and delivery fees': 'ལེན་ནི་དང་སྐྱེལ་ནིའི་གླ།', 'Applies to {{target}}': '{{target}} ལུ་འཇུག་སྤྱོད།',
    'Eligible services: {{services}}': 'འོས་འབབ་ཞབས་ཏོག: {{services}}', 'Free {{target}}': '{{target}} རིན་མེད།',
    'Coupon discount · {{target}}': 'ཀུ་པོན་ཕབ་ཆ · {{target}}',
  },
};

const workflowV18: Record<LanguageCode, Dictionary> = {
  en: { 'status.completed': 'Delivered', 'paymentStatus.unpaid': 'Unpaid', 'paymentStatus.pending': 'Pending', 'paymentStatus.paid': 'Paid', 'paymentStatus.partially_paid': 'Partially Paid', 'paymentStatus.failed': 'Failed', 'paymentStatus.expired': 'Expired', 'paymentStatus.refunded': 'Refunded' },
  th: { 'status.completed': 'เสร็จสิ้น', 'paymentStatus.unpaid': 'ยังไม่ได้ชำระ', 'paymentStatus.pending': 'รอยืนยัน', 'paymentStatus.paid': 'ชำระแล้ว', 'paymentStatus.partially_paid': 'ชำระบางส่วน', 'paymentStatus.failed': 'ล้มเหลว', 'paymentStatus.expired': 'หมดอายุ', 'paymentStatus.refunded': 'คืนเงินแล้ว' },
  my: { 'status.completed': 'ပြီးဆုံး', 'paymentStatus.unpaid': 'မပေးရသေး', 'paymentStatus.pending': 'အတည်ပြုရန်စောင့်နေသည်', 'paymentStatus.paid': 'ပေးချေပြီး', 'paymentStatus.partially_paid': 'တစ်စိတ်တစ်ပိုင်းပေးချေပြီး', 'paymentStatus.failed': 'မအောင်မြင်', 'paymentStatus.expired': 'သက်တမ်းကုန်', 'paymentStatus.refunded': 'ငွေပြန်အမ်းပြီး' },
  bn: { 'status.completed': 'সম্পন্ন', 'paymentStatus.unpaid': 'অপরিশোধিত', 'paymentStatus.pending': 'নিশ্চিতকরণের অপেক্ষায়', 'paymentStatus.paid': 'পরিশোধিত', 'paymentStatus.partially_paid': 'আংশিক পরিশোধিত', 'paymentStatus.failed': 'ব্যর্থ', 'paymentStatus.expired': 'মেয়াদ শেষ', 'paymentStatus.refunded': 'ফেরত দেওয়া হয়েছে' },
  dz: { 'status.completed': 'མཇུག་བསྡུ།', 'paymentStatus.unpaid': 'དངུལ་མ་སྤྲོད།', 'paymentStatus.pending': 'ངེས་གཏན་སྒུག་པ།', 'paymentStatus.paid': 'དངུལ་སྤྲོད་ཟིན།', 'paymentStatus.partially_paid': 'ཆ་ཤས་སྤྲོད་ཟིན།', 'paymentStatus.failed': 'མ་འགྲུབ།', 'paymentStatus.expired': 'དུས་ཡོལ།', 'paymentStatus.refunded': 'ཕྱིར་སློག་ཟིན།' },
};

const demoV19: Record<LanguageCode, Dictionary> = {
  en: { DEMO_START_FAILED: 'Demo mode could not start. Please try again.', DEMO_MIGRATION_REQUIRED: 'Demo ordering is temporarily unavailable. Please try again shortly.' },
  th: { DEMO_START_FAILED: 'ไม่สามารถเริ่มโหมดสาธิตได้ โปรดลองอีกครั้ง', DEMO_MIGRATION_REQUIRED: 'ยังไม่สามารถสั่งซื้อในโหมดสาธิตได้ชั่วคราว โปรดลองอีกครั้งในอีกสักครู่' },
  my: { DEMO_START_FAILED: 'သရုပ်ပြမုဒ်ကို မစတင်နိုင်ပါ။ ထပ်ကြိုးစားပါ။', DEMO_MIGRATION_REQUIRED: 'သရုပ်ပြအော်ဒါတင်ခြင်းကို ယာယီအသုံးမပြုနိုင်ပါ။ ခဏနေ ထပ်ကြိုးစားပါ။' },
  bn: { DEMO_START_FAILED: 'ডেমো মোড শুরু করা যায়নি। আবার চেষ্টা করুন।', DEMO_MIGRATION_REQUIRED: 'ডেমো অর্ডার সাময়িকভাবে অনুপলব্ধ। কিছুক্ষণ পরে আবার চেষ্টা করুন।' },
  dz: { DEMO_START_FAILED: 'དཔེ་སྟོན་ཐབས་ལམ་འགོ་བཙུགས་མ་ཚུགས། ལོག་འབད།', DEMO_MIGRATION_REQUIRED: 'དཔེ་སྟོན་མངགས་ཆ་གནས་སྐབས་ཅིག་ལག་ལེན་འཐབ་མི་ཚུགས། ཨ་ཙི་ཅིག་གི་ཤུལ་ལས་ལོག་འབད།' },
};

const authV20: Record<LanguageCode, Dictionary> = {
  en: { PASSWORD_REQUIRED: 'Enter your password.', AUTH_CAPTCHA_FAILED: 'Security verification failed. Please try again.', AUTH_EMAIL_NOT_CONFIRMED: 'Please confirm your email before signing in.', AUTH_NETWORK_ERROR: 'We could not connect. Please check your connection.', AUTH_TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait and try again.', PROFILE_LOAD_FAILED: 'You signed in, but your profile could not be loaded.', 'Checking your reset link...': 'Checking your reset link...', 'This reset link is invalid or has expired.': 'This reset link is invalid or has expired.', 'Request a new password reset link and try again.': 'Request a new password reset link and try again.', 'Request a new link': 'Request a new link' },
  th: { PASSWORD_REQUIRED: 'กรุณากรอกรหัสผ่าน', AUTH_CAPTCHA_FAILED: 'การตรวจสอบความปลอดภัยล้มเหลว โปรดลองอีกครั้ง', AUTH_EMAIL_NOT_CONFIRMED: 'โปรดยืนยันอีเมลก่อนเข้าสู่ระบบ', AUTH_NETWORK_ERROR: 'ไม่สามารถเชื่อมต่อได้ โปรดตรวจสอบการเชื่อมต่อของคุณ', AUTH_TOO_MANY_ATTEMPTS: 'ลองหลายครั้งเกินไป โปรดรอสักครู่แล้วลองอีกครั้ง', PROFILE_LOAD_FAILED: 'คุณเข้าสู่ระบบแล้ว แต่ไม่สามารถโหลดโปรไฟล์ได้', 'Checking your reset link...': 'กำลังตรวจสอบลิงก์รีเซ็ต...', 'This reset link is invalid or has expired.': 'ลิงก์รีเซ็ตนี้ไม่ถูกต้องหรือหมดอายุแล้ว', 'Request a new password reset link and try again.': 'ขอลิงก์รีเซ็ตรหัสผ่านใหม่แล้วลองอีกครั้ง', 'Request a new link': 'ขอลิงก์ใหม่' },
  my: { PASSWORD_REQUIRED: 'စကားဝှက်ထည့်ပါ။', AUTH_CAPTCHA_FAILED: 'လုံခြုံရေးစစ်ဆေးမှု မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', AUTH_EMAIL_NOT_CONFIRMED: 'အကောင့်မဝင်မီ သင့်အီးမေးလ်ကို အတည်ပြုပါ။', AUTH_NETWORK_ERROR: 'ချိတ်ဆက်၍မရပါ။ သင့်ချိတ်ဆက်မှုကို စစ်ဆေးပါ။', AUTH_TOO_MANY_ATTEMPTS: 'အကြိမ်များစွာ ကြိုးစားထားပါသည်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ။', PROFILE_LOAD_FAILED: 'အကောင့်ဝင်ပြီးသော်လည်း သင့်ပရိုဖိုင်ကို မတင်နိုင်ပါ။', 'Checking your reset link...': 'ပြန်လည်သတ်မှတ်ရန်လင့်ခ်ကို စစ်ဆေးနေသည်...', 'This reset link is invalid or has expired.': 'ဤပြန်လည်သတ်မှတ်ရန်လင့်ခ်သည် မမှန်ကန်ပါ သို့မဟုတ် သက်တမ်းကုန်သွားပါပြီ။', 'Request a new password reset link and try again.': 'စကားဝှက်ပြန်လည်သတ်မှတ်ရန်လင့်ခ်အသစ်ကို တောင်းပြီး ထပ်ကြိုးစားပါ။', 'Request a new link': 'လင့်ခ်အသစ်တောင်းရန်' },
  bn: { PASSWORD_REQUIRED: 'আপনার পাসওয়ার্ড লিখুন।', AUTH_CAPTCHA_FAILED: 'নিরাপত্তা যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।', AUTH_EMAIL_NOT_CONFIRMED: 'সাইন ইন করার আগে আপনার ইমেল নিশ্চিত করুন।', AUTH_NETWORK_ERROR: 'সংযোগ করা যায়নি। আপনার সংযোগ পরীক্ষা করুন।', AUTH_TOO_MANY_ATTEMPTS: 'অনেকবার চেষ্টা করা হয়েছে। অপেক্ষা করে আবার চেষ্টা করুন।', PROFILE_LOAD_FAILED: 'আপনি সাইন ইন করেছেন, কিন্তু আপনার প্রোফাইল লোড করা যায়নি।', 'Checking your reset link...': 'আপনার রিসেট লিংক যাচাই করা হচ্ছে...', 'This reset link is invalid or has expired.': 'এই রিসেট লিংকটি অবৈধ অথবা মেয়াদ শেষ হয়েছে।', 'Request a new password reset link and try again.': 'একটি নতুন পাসওয়ার্ড রিসেট লিংক চেয়ে আবার চেষ্টা করুন।', 'Request a new link': 'নতুন লিংক চান' },
  dz: { PASSWORD_REQUIRED: 'གསང་ཚིག་བཙུགས།', AUTH_CAPTCHA_FAILED: 'སྲུང་སྐྱོབ་བརྟག་ཞིབ་མ་འགྲུབ། ལོག་འབད།', AUTH_EMAIL_NOT_CONFIRMED: 'ནང་འཛུལ་མ་འབད་བའི་ཧེ་མ་གློག་འཕྲིན་ངེས་གཏན་བཟོ།', AUTH_NETWORK_ERROR: 'མཐུད་མ་ཚུགས། ཁྱོད་ཀྱི་མཐུད་ལམ་བརྟག།', AUTH_TOO_MANY_ATTEMPTS: 'འབད་རྩོལ་མང་དྲགས་སོང་། ཨ་ཙི་སྒུག་ཞིནམ་ལས་ལོག་འབད།', PROFILE_LOAD_FAILED: 'རྩིས་ཐོ་ནང་འཛུལ་ཡོད་རུང་ ཁྱོད་ཀྱི་གསལ་སྡུད་མངོན་མ་ཚུགས།', 'Checking your reset link...': 'གསང་ཚིག་ལོག་བཟོའི་འབྲེལ་ལམ་བརྟག་དཔྱད་འབད་དོ།', 'This reset link is invalid or has expired.': 'འབྲེལ་ལམ་འདི་ནུས་མེད་ཡང་ན་དུས་ཡོལ་སོང་ནུག།', 'Request a new password reset link and try again.': 'གསང་ཚིག་ལོག་བཟོའི་འབྲེལ་ལམ་གསརཔ་ཞུ་ཞིནམ་ལས་ལོག་འབད།', 'Request a new link': 'འབྲེལ་ལམ་གསརཔ་ཞུ།' },
};

const lineV21: Record<LanguageCode, Dictionary> = {
  en: { LINE: 'LINE', 'Connected ✓': 'Connected ✓', 'Not connected': 'Not connected', 'Connect LINE': 'Connect LINE', 'Disconnect LINE': 'Disconnect LINE', 'LINE notifications': 'LINE notifications', 'Send Super Shine updates in LINE': 'Send Super Shine updates in LINE', 'Order updates': 'Order updates', 'Pickup, cleaning, and delivery milestones': 'Pickup, cleaning, and delivery milestones', 'Payment updates': 'Payment updates', 'Payment due, confirmed, failed, and refunded': 'Payment due, confirmed, failed, and refunded', 'Connect LINE from a real customer account.': 'Connect LINE from a real customer account.', 'Connecting…': 'Connecting…', 'Please wait…': 'Please wait…', 'LINE status is temporarily unavailable.': 'LINE status is temporarily unavailable.', 'LINE connection was cancelled.': 'LINE connection was cancelled.', 'LINE connection could not be completed.': 'LINE connection could not be completed.', 'LINE connection failed.': 'LINE connection failed.', 'LINE could not be disconnected.': 'LINE could not be disconnected.', 'LINE notification setting could not be saved.': 'LINE notification setting could not be saved.', 'Connected · add Super Shine as a LINE friend': 'Connected · add Super Shine as a LINE friend' },
  th: { LINE: 'LINE', 'Connected ✓': 'เชื่อมต่อแล้ว ✓', 'Not connected': 'ยังไม่ได้เชื่อมต่อ', 'Connect LINE': 'เชื่อมต่อ LINE', 'Disconnect LINE': 'ยกเลิกการเชื่อมต่อ LINE', 'LINE notifications': 'การแจ้งเตือน LINE', 'Send Super Shine updates in LINE': 'รับการอัปเดต Super Shine ใน LINE', 'Order updates': 'อัปเดตคำสั่งซื้อ', 'Pickup, cleaning, and delivery milestones': 'ความคืบหน้ารับผ้า ซัก และจัดส่ง', 'Payment updates': 'อัปเดตการชำระเงิน', 'Payment due, confirmed, failed, and refunded': 'แจ้งเตือนครบกำหนด ยืนยัน ล้มเหลว และคืนเงิน', 'Connect LINE from a real customer account.': 'เชื่อมต่อ LINE จากบัญชีลูกค้าจริง', 'Connecting…': 'กำลังเชื่อมต่อ…', 'Please wait…': 'โปรดรอ…', 'LINE status is temporarily unavailable.': 'ไม่สามารถตรวจสอบ LINE ได้ชั่วคราว', 'LINE connection was cancelled.': 'ยกเลิกการเชื่อมต่อ LINE แล้ว', 'LINE could not be disconnected.': 'ไม่สามารถยกเลิกการเชื่อมต่อ LINE ได้', 'LINE notification setting could not be saved.': 'บันทึกการตั้งค่า LINE ไม่สำเร็จ', 'Connected · add Super Shine as a LINE friend': 'เชื่อมต่อแล้ว · เพิ่ม Super Shine เป็นเพื่อนใน LINE' },
  my: { LINE: 'LINE', 'Connected ✓': 'ချိတ်ဆက်ပြီး ✓', 'Not connected': 'မချိတ်ဆက်ရသေးပါ', 'Connect LINE': 'LINE ချိတ်ဆက်ရန်', 'Disconnect LINE': 'LINE ဖြုတ်ရန်', 'LINE notifications': 'LINE အသိပေးချက်များ', 'Send Super Shine updates in LINE': 'Super Shine အပ်ဒိတ်များကို LINE တွင် ရယူရန်', 'Order updates': 'အော်ဒါအပ်ဒိတ်များ', 'Pickup, cleaning, and delivery milestones': 'လာယူခြင်း၊ လျှော်ခြင်းနှင့် ပို့ဆောင်ခြင်း အဆင့်များ', 'Payment updates': 'ငွေပေးချေမှု အပ်ဒိတ်များ', 'Payment due, confirmed, failed, and refunded': 'ပေးရန်၊ အတည်ပြု၊ မအောင်မြင်နှင့် ပြန်အမ်း အကြောင်းကြားချက်များ', 'Connect LINE from a real customer account.': 'အကောင့်အစစ်ဖြင့် LINE ချိတ်ဆက်ပါ', 'Connecting…': 'ချိတ်ဆက်နေသည်…', 'Please wait…': 'ခဏစောင့်ပါ…', 'LINE status is temporarily unavailable.': 'LINE အခြေအနေကို ယာယီစစ်ဆေး၍မရပါ', 'LINE connection was cancelled.': 'LINE ချိတ်ဆက်ခြင်း ပယ်ဖျက်ပြီး', 'LINE could not be disconnected.': 'LINE ဖြုတ်၍မရပါ', 'LINE notification setting could not be saved.': 'LINE အသိပေးချက် ဆက်တင်ကို သိမ်း၍မရပါ', 'Connected · add Super Shine as a LINE friend': 'ချိတ်ဆက်ပြီး · Super Shine ကို LINE သူငယ်ချင်းအဖြစ် ထည့်ပါ' },
  bn: { LINE: 'LINE', 'Connected ✓': 'সংযুক্ত ✓', 'Not connected': 'সংযুক্ত নয়', 'Connect LINE': 'LINE সংযুক্ত করুন', 'Disconnect LINE': 'LINE সংযোগ বিচ্ছিন্ন করুন', 'LINE notifications': 'LINE বিজ্ঞপ্তি', 'Send Super Shine updates in LINE': 'Super Shine আপডেট LINE-এ পান', 'Order updates': 'অর্ডার আপডেট', 'Pickup, cleaning, and delivery milestones': 'পিকআপ, পরিষ্কার ও ডেলিভারির ধাপ', 'Payment updates': 'পেমেন্ট আপডেট', 'Payment due, confirmed, failed, and refunded': 'পেমেন্ট বকেয়া, নিশ্চিত, ব্যর্থ ও ফেরত বিজ্ঞপ্তি', 'Connect LINE from a real customer account.': 'একটি আসল গ্রাহক অ্যাকাউন্ট থেকে LINE সংযুক্ত করুন', 'Connecting…': 'সংযুক্ত হচ্ছে…', 'Please wait…': 'অপেক্ষা করুন…', 'LINE status is temporarily unavailable.': 'LINE অবস্থা সাময়িকভাবে পাওয়া যাচ্ছে না', 'LINE connection was cancelled.': 'LINE সংযোগ বাতিল হয়েছে', 'LINE could not be disconnected.': 'LINE সংযোগ বিচ্ছিন্ন করা যায়নি', 'LINE notification setting could not be saved.': 'LINE বিজ্ঞপ্তি সেটিং সংরক্ষণ করা যায়নি', 'Connected · add Super Shine as a LINE friend': 'সংযুক্ত · LINE-এ Super Shine-কে বন্ধু করুন' },
  dz: { LINE: 'LINE', 'Connected ✓': 'མཐུད་ཟིན ✓', 'Not connected': 'མ་མཐུད།', 'Connect LINE': 'LINE མཐུད།', 'Disconnect LINE': 'LINE བཀག', 'LINE notifications': 'LINE བརྡ་བསྐུལ།', 'Send Super Shine updates in LINE': 'Super Shine གསར་བསྒྱུར LINE ནང་ལུ་ཐོབ།', 'Order updates': 'མངགས་ཆའི་གསར་བསྒྱུར།', 'Pickup, cleaning, and delivery milestones': 'ལེན་ནི་དང་ འཁྱུ་ནི་ སྐྱེལ་ནིའི་གནས་རིམ།', 'Payment updates': 'དངུལ་སྤྲོད་གསར་བསྒྱུར།', 'Payment due, confirmed, failed, and refunded': 'དངུལ་སྤྲོད་དགོ་པ་ ངེས་གཏན་ མ་འགྲུབ་ ཕྱིར་སློག་བརྡ་བསྐུལ།', 'Connect LINE from a real customer account.': 'རྩིས་ཐོ་ངོ་མ་ནང་ལས LINE མཐུད།', 'Connecting…': 'མཐུད་དོ…', 'Please wait…': 'བསྒུག།', 'LINE status is temporarily unavailable.': 'LINE གནས་སྟངས་གནས་སྐབས་མི་ཐོབ།', 'LINE connection was cancelled.': 'LINE མཐུད་ནི་ཆ་མེད།', 'LINE could not be disconnected.': 'LINE བཀག་མ་ཚུགས།', 'LINE notification setting could not be saved.': 'LINE བརྡ་བསྐུལ་སྒྲིག་སྟངས་སྲུང་མ་ཚུགས།', 'Connected · add Super Shine as a LINE friend': 'མཐུད་ཟིན · LINE ནང་ Super Shine གྲོགས་སུ་ཁ་སྐོང་།' },
};

const freshFlowV22: Record<LanguageCode, Dictionary> = {
  en: { 'FRESH LAUNDRY, LESS EFFORT': 'FRESH LAUNDRY, LESS EFFORT', 'Review & Payment': 'Review & Payment', 'RECOMMENDED FOR YOU': 'RECOMMENDED FOR YOU', 'Your defaults': 'Your defaults', Unavailable: 'Unavailable' },
  th: { 'FRESH LAUNDRY, LESS EFFORT': 'ผ้าสะอาด สบายกว่าเดิม', 'Review & Payment': 'ตรวจสอบและชำระเงิน', 'RECOMMENDED FOR YOU': 'แนะนำสำหรับคุณ', 'Your defaults': 'ค่าเริ่มต้นของคุณ', Unavailable: 'ไม่พร้อมใช้งาน' },
  my: { 'FRESH LAUNDRY, LESS EFFORT': 'သန့်ရှင်းတဲ့အဝတ်၊ ပိုသက်သာတဲ့အလုပ်', 'Review & Payment': 'အော်ဒါစစ်ဆေးပြီး ငွေပေးချေမှု', 'RECOMMENDED FOR YOU': 'သင့်အတွက် အကြံပြုထားသည်', 'Your defaults': 'သင့်မူလရွေးချယ်မှုများ', Unavailable: 'မရရှိနိုင်ပါ' },
  bn: { 'FRESH LAUNDRY, LESS EFFORT': 'পরিষ্কার কাপড়, কম ঝামেলা', 'Review & Payment': 'পর্যালোচনা ও পেমেন্ট', 'RECOMMENDED FOR YOU': 'আপনার জন্য প্রস্তাবিত', 'Your defaults': 'আপনার ডিফল্ট', Unavailable: 'পাওয়া যাচ্ছে না' },
  dz: { 'FRESH LAUNDRY, LESS EFFORT': 'FRESH LAUNDRY, LESS EFFORT', 'Review & Payment': 'Review & Payment', 'RECOMMENDED FOR YOU': 'RECOMMENDED FOR YOU', 'Your defaults': 'Your defaults', Unavailable: 'Unavailable' },
};

const visualPolishV23: Record<LanguageCode, Dictionary> = {
  en: {
    'Your previous order': 'Your previous order', OFFER: 'OFFER', 'Use code {{code}}': 'Use code {{code}}', POPULAR: 'POPULAR',
    '{{current}} of {{target}}': '{{current}} of {{target}}', '1 DAY LEFT': '1 DAY LEFT', '{{count}} DAYS LEFT': '{{count}} DAYS LEFT',
    MEMBER: 'MEMBER', 'Profile complete': 'Profile complete', '{{count}} free pickups remaining': '{{count}} free pickups remaining',
    'Select an item': 'Select an item', 'Similar saved addresses found': 'Similar saved addresses found',
    'Choose carefully, then remove any duplicate in Profile after placing your order.': 'Choose carefully, then remove any duplicate in Profile after placing your order.',
    Similar: 'Similar', '1 service selected': '1 service selected', '{{count}} services selected': '{{count}} services selected',
    'When dropped off': 'When dropped off', '~10 min after drop-off': '~10 min after drop-off', 'After cleaning': 'After cleaning', 'When collected': 'When collected',
  },
  th: {
    'Your previous order': 'คำสั่งซื้อล่าสุดของคุณ', OFFER: 'ข้อเสนอ', 'Use code {{code}}': 'ใช้โค้ด {{code}}', POPULAR: 'ยอดนิยม',
    '{{current}} of {{target}}': '{{current}} จาก {{target}}', '1 DAY LEFT': 'เหลือ 1 วัน', '{{count}} DAYS LEFT': 'เหลือ {{count}} วัน',
    MEMBER: 'สมาชิก', 'Profile complete': 'ความสมบูรณ์ของโปรไฟล์', '{{count}} free pickups remaining': 'เหลือสิทธิ์รับผ้าฟรี {{count}} ครั้ง',
    'Select an item': 'เลือกรายการ', 'Similar saved addresses found': 'พบที่อยู่ที่คล้ายกัน',
    'Choose carefully, then remove any duplicate in Profile after placing your order.': 'กรุณาเลือกอย่างระมัดระวัง แล้วลบที่อยู่ซ้ำในโปรไฟล์หลังสั่งซื้อ',
    Similar: 'คล้ายกัน', '1 service selected': 'เลือก 1 บริการ', '{{count}} services selected': 'เลือก {{count}} บริการ',
    'When dropped off': 'เมื่อส่งผ้าที่ร้าน', '~10 min after drop-off': '~10 นาทีหลังส่งผ้า', 'After cleaning': 'หลังซักเสร็จ', 'When collected': 'เมื่อรับผ้า',
  },
  my: {},
  bn: {},
  dz: {},
};

const dictionaries: Record<LanguageCode, Dictionary> = {
  en: { ...enV11, ...couponV15.en, ...securityV14.en, ...workflowV18.en, ...demoV19.en, ...authV20.en, ...lineV21.en, ...freshFlowV22.en, ...visualPolishV23.en },
  th: { ...th, ...thV11, ...customerV14.th, ...couponV15.th, ...securityV14.th, ...workflowV18.th, ...demoV19.th, ...authV20.th, ...lineV21.th, ...freshFlowV22.th, ...visualPolishV23.th },
  my: { ...my, ...myV11, ...customerV14.my, ...couponV15.my, ...securityV14.my, ...workflowV18.my, ...demoV19.my, ...authV20.my, ...lineV21.my, ...freshFlowV22.my, ...visualPolishV23.my },
  bn: { ...bn, ...bnV11, ...customerV14.bn, ...couponV15.bn, ...securityV14.bn, ...workflowV18.bn, ...demoV19.bn, ...authV20.bn, ...lineV21.bn, ...freshFlowV22.bn, ...visualPolishV23.bn },
  dz: { ...dz, ...dzV11, ...customerV14.dz, ...couponV15.dz, ...securityV14.dz, ...workflowV18.dz, ...demoV19.dz, ...authV20.dz, ...lineV21.dz, ...freshFlowV22.dz, ...visualPolishV23.dz },
};

export function isLanguageCode(value: string | null): value is LanguageCode {
  return languageOptions.some((option) => option.code === value);
}

export function getLanguageOption(code: LanguageCode) {
  return languageOptions.find((option) => option.code === code) ?? languageOptions[0];
}

export function translate(language: LanguageCode, key: string, variables: Variables = {}) {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
  return Object.entries(variables).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}
