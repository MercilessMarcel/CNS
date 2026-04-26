export const fa = {
  app: {
    title: 'CNS :: سامانه دریافت ویدیو',
    subtitle: 'سیستم انتقال داده مرکزی',
  },
  input: {
    label: 'ورودی فرمان',
    placeholder: 'لینک یوتیوب را وارد کنید...',
    hint: 'پشتیبانی از ویدیو، پلی‌لیست و کانال',
  },
  quality: {
    label: 'پارامترهای کیفیت',
    best: '--best (بهترین کیفیت)',
    '1080p': '--1080p',
    '720p': '--720p',
    '480p': '--480p',
    audio: '--audio-only (فقط صدا)',
  },
  format: {
    label: 'فرمت خروجی',
    mp4: 'MP4',
    webm: 'WebM',
    mp3: 'MP3',
  },
  actions: {
    download: 'دریافت',
    processing: 'در حال پردازش...',
    queue: 'افزودن به صف',
    clear: 'پاک کردن',
    settings: 'تنظیمات',
  },
  feed: {
    label: 'فید سیگنال',
    waiting: 'منتظر ورودی...',
    connecting: 'برقراری ارتباط...',
    downloading: 'در حال دریافت...',
    complete: 'پایان انتقال',
    error: 'خطا در انتقال',
  },
  archive: {
    label: 'بایگانی',
    empty: 'بایگانی خالی است',
    video: 'ویدیو',
    audio: 'صوت',
    duration: 'مدت',
    size: 'حجم',
    delete: 'حذف',
    download: 'دریافت فایل',
  },
  settings: {
    label: 'پیکربندی سیستم',
    token: 'توکن دسترسی گیت‌هاب',
    repo: 'مخزن هدف',
    save: 'ذخیره پیکربندی',
  },
  warnings: {
    tos: 'هشدار: استفاده صرفاً برای محتوای عمومی یا متعلق به خود شما. رعایت قوانین GitHub و حق نشر الزامی است.',
    rateLimit: 'محدودیت نرخ درخواست: حداکثر 5 درخواست در دقیقه',
  },
  meta: {
    title: 'عنوان',
    channel: 'کانال',
    views: 'بازدید',
    date: 'تاریخ',
    duration: 'مدت',
  },
  status: {
    pending: 'در انتظار',
    running: 'در حال اجرا',
    success: 'موفق',
    failed: 'ناموفق',
  },
  errors: {
    invalidUrl: 'آدرس نامعتبر',
    noToken: 'توکن گیت‌هاب تنظیم نشده',
    network: 'خطای شبکه',
  },
} as const;

export type Translations = typeof fa;
