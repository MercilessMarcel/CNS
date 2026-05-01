export const PERSIAN_YOUTUBE_COOKIES_EXPIRED =
  'کوکی‌های یوتیوب منقضی شده‌اند یا یوتیوب آن‌ها را باطل کرده است (مثلاً کوکی در مرورگر چرخیده یا یوتیوب ورود انسان می‌خواهد). از همان مرورگری که داخل youtube.com لاگین هستید cookies.txt تازه بگیرید، در تنظیمات اپ دوباره بچسبانید و ذخیره کنید، بعد همان ویدیو را دوباره دریافت کنید.';

function joinLogsForDetection(logs: string[]): string {
  return logs
    .map((l) => l.replace(/^\[[^\]]+\]\s*/, ''))
    .join('\n')
    .toLowerCase()
    .replace(/[\u2019\u2018]/g, "'");
}

export function youtubeCookieFailureFromLogs(logs: string[]): boolean {
  if (!logs.length) return false;
  const tail = logs.length > 200 ? logs.slice(-200) : logs;
  const blob = joinLogsForDetection(tail);
  return (
    blob.includes('cns_cookies_expired') ||
    blob.includes('cns_cookies_invalid') ||
    blob.includes('cookies are no longer valid') ||
    blob.includes('account cookies are no longer valid') ||
    blob.includes('rotated in the browser') ||
    blob.includes('exporting-youtube-cookies') ||
    (blob.includes('no longer valid') && blob.includes('cookie')) ||
    (blob.includes('sign in to confirm') && blob.includes('not a bot')) ||
    (blob.includes('confirm you') && blob.includes('not a bot'))
  );
}

export function toPersianErrorMessageFromLogs(logs: string[]): string {
  if (!logs.length) return toPersianErrorMessage('');
  if (youtubeCookieFailureFromLogs(logs)) return PERSIAN_YOUTUBE_COOKIES_EXPIRED;
  const last = logs[logs.length - 1] ?? '';
  return toPersianErrorMessage(last.replace(/^\[[^\]]+\]\s*/, ''));
}

export function toPersianErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'خطای ناشناخته رخ داد.';

  if (/[\u0600-\u06ff]/.test(raw)) {
    return raw;
  }

  const message = raw.toLowerCase().replace(/[\u2019\u2018]/g, "'");

  if (
    message.includes('cns_cookies_expired') ||
    message.includes('cns_cookies_invalid') ||
    message.includes('cookie_expired_local') ||
    message.includes('cookie_format_invalid') ||
    message.includes('cookies.txt') ||
    message.includes('cookies are no longer valid') ||
    message.includes('account cookies are no longer valid') ||
    message.includes('rotated in the browser') ||
    message.includes('exporting-youtube-cookies') ||
    (message.includes('no longer valid') && message.includes('cookie')) ||
    message.includes('not a bot') ||
    (message.includes('sign in to confirm') && (message.includes('youtube') || message.includes('not a bot'))) ||
    (message.includes('please upload') && message.includes('cookie')) ||
    message.includes('cookies.txt not found') ||
    message.includes('cookies.txt required')
  ) {
    return PERSIAN_YOUTUBE_COOKIES_EXPIRED;
  }

  if (message.includes('invalid github token') || message.includes('authentication failed') || message.includes('bad credentials') || message.includes('401')) {
    return 'توکن گیت‌هاب نامعتبر است یا دسترسی لازم را ندارد. توکن جدید بسازید و در تنظیمات وارد کنید.';
  }

  if (message.includes('workflow not found') || message.includes('download.yml') || message.includes('workflow_failed')) {
    return 'فایل workflow دانلود در مخزن پیدا نشد. در تنظیمات، راه‌اندازی خودکار را اجرا کنید.';
  }

  if (message.includes('rate limit') || message.includes('rate limited') || message.includes('abuse') || message.includes('403')) {
    return 'گیت‌هاب موقتاً درخواست‌ها را محدود کرده است. چند دقیقه صبر کنید و دوباره تلاش کنید.';
  }

  if (message.includes('repo_not_found') || message.includes('not found') || message.includes('404')) {
    return 'مخزن گیت‌هاب پیدا نشد یا توکن به آن دسترسی ندارد. نام مخزن و توکن را در تنظیمات بررسی کنید.';
  }

  if (message.includes('invalid url') || message.includes('failed to construct') || message.includes('url')) {
    return 'لینک وارد شده معتبر نیست. لینک کامل ویدیو را با https وارد کنید.';
  }

  if (message.includes('network') || message.includes('failed to fetch') || message.includes('load failed')) {
    return 'اتصال اینترنت یا ارتباط با گیت‌هاب مشکل دارد. اینترنت، فیلترشکن و دسترسی گیت‌هاب را بررسی کنید.';
  }

  if (message.includes('download') || message.includes('yt-dlp') || message.includes('youtube')) {
    return 'دانلود از یوتیوب ناموفق شد. معمولاً دلیل آن کوکی منقضی، محدودیت یوتیوب، یا لینک خصوصی است.';
  }

  if (message.includes('quota') || message.includes('storage') || message.includes('too large')) {
    return 'فضای ذخیره یا محدودیت حجم فایل مشکل دارد. فایل بزرگ است یا مخزن گیت‌هاب جا ندارد.';
  }

  if (raw && raw !== 'خطای ناشناخته رخ داد.') {
    return `خطا: ${raw}`;
  }

  return raw;
}

export function toPersianFailureHelp(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('کوکی') || lower.includes('cookie')) {
    return 'راه‌حل: کوکی جدید را از مرورگر بگیرید، در تنظیمات وارد کنید، سپس دوباره دانلود را بزنید.';
  }

  if (lower.includes('توکن') || lower.includes('token') || lower.includes('گیت‌هاب')) {
    return 'راه‌حل: تنظیمات را باز کنید، توکن و نام مخزن را بررسی کنید، سپس دوباره تلاش کنید.';
  }

  if (lower.includes('لینک') || lower.includes('url')) {
    return 'راه‌حل: لینک کامل و عمومی ویدیو را وارد کنید. لینک خصوصی یا حذف‌شده دانلود نمی‌شود.';
  }

  if (lower.includes('محدود') || lower.includes('rate')) {
    return 'راه‌حل: چند دقیقه صبر کنید. بعد دوباره همان لینک را دانلود کنید.';
  }

  return 'راه‌حل: اگر ویدیو عمومی است، اول کوکی‌ها را تازه کنید. اگر باز هم خطا داد، لینک یا کیفیت دیگری امتحان کنید.';
}
