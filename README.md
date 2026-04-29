<div align="center">

<img width="1815" height="570" alt="CNS ASCII" src="https://github.com/user-attachments/assets/1f29a8e0-98a1-4794-b66c-4a09db94c055"/>

[![Downloads](https://img.shields.io/github/downloads/MercilessMarcel/CNS/total?style=flat-square&logo=github)](https://github.com/MercilessMarcel/CNS/releases/)
[![Last Version](https://img.shields.io/github/release/MercilessMarcel/CNS/all.svg?style=flat-square)](https://github.com/MercilessMarcel/CNS/releases/)
[![Last Release Date](https://img.shields.io/github/release-date/MercilessMarcel/CNS.svg?style=flat-square)](https://github.com/MercilessMarcel/CNS/releases/)
[![Stars](https://img.shields.io/github/stars/MercilessMarcel/CNS?style=flat-square)](https://github.com/MercilessMarcel/CNS/stargazers)

</div>

## سی‌ان‌اس چیست؟

سی‌ان‌اس یک ابزار قدرتمند برای دانلود ویدیوهای یوتیوب با استفاده از زیرساخت گیت‌هاب است. سی‌ان‌اس به شما این امکان را می‌دهد که بدون نیاز به وی‌پی‌ان و با سرعت بالا، ویدیوهای مورد نظر خود را دانلود و مدیریت کنید. این برنامه از قدرت سرورهای گیت‌هاب برای دانلود بهره می‌برد و حتی با اینترنت کند، تجربه دانلود سریع و پایداری را ارائه می‌دهد.


<img width="1926" height="1558" alt="CNS Showcase" src="https://github.com/user-attachments/assets/4ac1f205-2ec9-488a-9fc8-d63f1b0b9c23" />



## 🚀 امکانات اصلی

⭐ رابط کاربری ساده و کاربرپسند با طراحی مدرن

✈️ پشتیبانی از چند پلتفرم: ویندوز، لینوکس و مک

🔍 دانلود با سرعت بالا بدون نیاز به VPN

🟡 پشتیبانی از انواع کیفیت‌ها:
Best Quality, 1080p, 720p, 480p و فقط صدا

🟡 پشتیبانی از فرمت‌های مختلف:
MP4, WebM, MP3

🔄 مدیریت خودکار فایل‌های بزرگ با قابلیت تقسیم‌بندی

🔎 داشبورد مدیریت دانلود با آرشیو کامل

🌙 رایگان، منبع‌باز و بدون تبلیغات

⚙ راه‌اندازی ساده و خودکار	

📱 نسخه دسکتاپ آماده برای استفاده

⭐ کاملا فارسی و بهینه برای کاربران ایرانی

## 📥 دانلود و نصب

### دانلود مستقیم نسخه دسکتاپ (v1.1.0)

<div dir="rtl" align="right">
   <table>
    <thead align="right">
        <tr>
            <th>سیستم عامل</th>
            <th>دانلود</th>
        </tr>
    </thead>
    <tbody align="right">
        <tr>
            <td>ویندوز</td>
            <td>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_1.1.0_x64-setup.exe"><img src="https://img.shields.io/badge/Setup-x64-0078d7.svg?logo=windows"></a><br>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_1.1.0_x64_en-US.msi"><img src="https://img.shields.io/badge/MSI-x64-2d7d9a.svg?logo=windows"></a>
            </td>
        </tr>
        <tr>
            <td>لینوکس</td>
            <td>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/cns_1.1.0_amd64.deb"><img src="https://img.shields.io/badge/DEB-x64-FF9966.svg?logo=debian"></a>
            </td>
        </tr>
        <tr>
            <td>مک</td>
            <td>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_1.1.0_aarch64.dmg"><img src="https://img.shields.io/badge/DMG-Apple_Silicon-007AFF.svg?logo=apple"></a><br>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_1.1.0_x64.dmg"><img src="https://img.shields.io/badge/DMG-Intel-ea005e.svg?logo=apple"></a><br>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_aarch64.app.tar.gz"><img src="https://img.shields.io/badge/APP-ARM64-34C759.svg?logo=apple"></a><br>
                <a href="https://github.com/MercilessMarcel/CNS/releases/download/v1.1.0/CNS_x64.app.tar.gz"><img src="https://img.shields.io/badge/APP-x64-FF9500.svg?logo=apple"></a>
            </td>
        </tr>
    </tbody>
</table>
</div>

### ساخت از روی سورس

اگر می‌خواهید خودتان برنامه را بسازید:

```bash
# نصب وابستگی‌ها
npm install

# ساخت نسخه دسکتاپ
npm run desktop:build
```

**پیش‌نیاز:** نیاز به نصب `Rust stable` دارید:
```bash
rustup default stable
```

خروجی‌ها در پوشه `src-tauri/target/release/bundle/` قرار می‌گیرند.

### ساخت نسخه قابل حمل (Portable)

برای ویندوز:
```bash
npm run desktop:build:portable
```

فایل اجرایی در `src-tauri/target/release/` ساخته می‌شود.

## ⚙️ راه‌اندازی و آموزش

### مرحله ۱: ساخت توکن GitHub

برای استفاده از CNS، نیاز به یک توکن دسترسی شخصی از GitHub دارید:

1. به [github.com](https://github.com) بروید و وارد شوید
2. روی عکس پروفایل کلیک کنید و **Settings** را انتخاب کنید
3. از منوی چپ، **Developer settings** را باز کنید
4. **Personal access tokens** > **Tokens (classic)** را انتخاب کنید
5. روی **Generate new token (classic)** کلیک کنید
6. در قسمت **Note** نامی مانند "CNS App" وارد کنید
7. **⚠️ مهم:** حتماً دسترسی‌های `repo` و `workflow` را فعال کنید
8. روی **Generate token** کلیک و توکن را کپی کنید

> 💡 **نکته امنیتی:** توکن را در جای امن نگه دارید و با هیچ‌کس به اشتراک نگذارید.

### مرحله ۲: دریافت کوکی‌های YouTube

برای دانلود ویدیو، به کوکی‌های حساب یوتیوب نیاز دارید:

1. افزونه [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) را نصب کنید
2. به [youtube.com](https://youtube.com) بروید و وارد شوید
3. روی آیکون افزونه کلیک و **Export** را انتخاب کنید
4. فایل `cookies.txt` را دانلود کنید
5. محتویات فایل را در تنظیمات CNS وارد کنید

### مرحله ۳: راه‌اندازی خودکار

1. برنامه CNS را باز کنید
2. توکن GitHub را وارد کنید
3. روی **راه‌اندازی خودکار** کلیک کنید
4. برنامه به‌صورت خودکار مخزن `cns-downloads` را می‌سازد

## 📖 نحوه استفاده

### دانلود ویدیو

1. آدرس ویدیوی یوتیوب را کپی کنید
2. در کادر ورودی پیست کنید
3. کیفیت دلخواه را انتخاب کنید (Best, 1080p, 720p, 480p, Audio)
4. فرمت خروجی را انتخاب کنید (MP4, WebM, MP3)
5. روی دکمه **دانلود** کلیک کنید

### مدیریت دانلودها

در بخش **آرشیو دانلود**:
- لیست تمام فایل‌های دانلودشده را مشاهده کنید
- فایل‌ها را روی کامپیوتر خود دانلود کنید
- فایل‌های غیرضروری را حذف کنید

### ترکیب فایل‌های تقسیم‌شده

برای فایل‌های بزرگتر از ۹۵MB که به بخش‌های ZIP تقسیم می‌شوند:

1. همه بخش‌ها را دانلود کنید
2. فایل با پسوند `.zip` را باز کنید
3. ویدیو به‌صورت خودکار از بخش‌ها استخراج می‌شود

## 🛠️ عیب‌یابی

### دانلود شروع نمی‌شود

توکن GitHub را بررسی کنید
مطمئن شوید مخزن ساخته شده است
کوکی‌های YouTube را به‌روز کنید

### خطای "cookies.txt not found"

کوکی‌ها را در تنظیمات بارگذاری کنید
فرمت فایل کوکی را بررسی کنید

### خطای "Rate limited"

چند دقیقه صبر کنید
GitHub محدودیت استفاده در ساعت دارد

---
## ⚠️ هشدار امنیتی مهم

> [!CAUTION]
> **توکن GitHub و کوکی‌های YouTube بسیار حساس هستند.**
> 
> - مثل رمز عبور اصلی حسابتون مراقبشون باشید
> - هرگز آن‌ها را در چت، اسکرین‌شات، ایمیل یا هیچ پلتفرمی به اشتراک نگذارید
> - اگر مشکوک به لو رفتن شدید، **فوراً** توکن را در GitHub revoke کنید
> - فقط در دستگاه و مرورگر شخصی خودتان استفاده کنید
---

## 🙏 سپاسگزاری‌ها

این پروژه با الهام از ابزارهای زیر ساخته شده است:

- [github-sandbox](https://github.com/maanimis/github-sandbox) - ایده اصلی استفاده از GitHub Actions
- [sandbox](https://github.com/nscl5/sandbox/) - روش تقسیم‌بندی فایل‌ها

تشکر ویژه از تمام توسعه‌دهندگان.

## 🎯 حمایت از پروژه

ساده‌ترین راه حمایت از ما کلیک کردن روی ستاره (⭐) بالای همین صفحه است.

[![Stargazers over time](https://starchart.cc/MercilessMarcel/CNS.svg?background=%23181e19&axis=%236fb08c&line=%23495948)](https://starchart.cc/MercilessMarcel/CNS)

## 📞 ارتباط با ما

اگر سوال، پیشنهاد یا گزارش باگ دارید:

- [GitHub Issues](https://github.com/MercilessMarcel/CNS/issues) - گزارش مشکلات
- [GitHub Discussions](https://github.com/MercilessMarcel/CNS/discussions) - بحث و تبادل نظر

## 📄 مجوز

این پروژه تحت مجوز [MIT](LICENSE) منتشر شده است.

---

<img width="1920" height="1080" alt="[SEEK THE TRUTH BEYOND THE WALLS]" src="https://github.com/user-attachments/assets/c8eb4d3d-7d47-4cb3-adb2-e2663d9ff429" />
