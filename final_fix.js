const fs = require('fs');

const filePath = 'd:\\Downloads\\antigravity\\dental-bot (2)\\dental-bot\\public\\index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Ensure UTF-8 and correct head structure
if (html.includes('<head></head>')) {
    html = html.replace('<head></head>', '<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Qudozen - The Self-Operating System for Businesses</title>\n</head>');
}

// 2. Fix the Bento Grid card to include the small simulator
const bentoGridSearch = /<section id="services"[\s\S]*?<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">/;
const bentoGridNew = `<section id="services" class="py-24 px-6 relative z-10 border-b border-white/5 bg-gradient-to-b from-[#0A0F18] to-[#0B1120]">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <div class="inline-block px-4 py-1 rounded-full glass text-xs font-bold text-aqua mb-4 tracking-widest uppercase" data-i18n="nav_services">Our Services</div>
        <h2 class="text-3xl md:text-4xl font-bold mb-4" data-i18n="services_title">The Integrated <span class="text-aqua">Digital Infrastructure</span></h2>
        <p class="text-gray-400" data-i18n="services_subtitle">A smart system that connects everything. Click any card for details.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">`;

html = html.replace(bentoGridSearch, bentoGridNew);

// 3. Define the serviceDB and other logic in a single clean script block at the top
const headerScript = `
<script>
const serviceDB = {
  "reception": {
    "icon": "🤖",
    "ar": {
      "title": "موظف الاستقبال الذكي",
      "desc": "نظام استقبال ذاتي متكامل عبر الواتساب يدير المرضى من الطلب حتى الحضور.",
      "flow": ["استلام الطلب وتحليله", "تنسيق الوقت مع التقويم", "تأكيد وحجز الموعد آلياً"],
      "benefits": ["حجز آلي بنسبة 100%", "تذكيرات تقلل الغياب 80%", "دعم ثنائي اللغة", "مزامنة تقويم جوجل"]
    },
    "en": {
      "title": "Smart Receptionist",
      "desc": "Autonomous system that manages patients via WhatsApp from initial request to booking.",
      "flow": ["Inquiry analysis", "Calendar coordination", "Automated confirmation"],
      "benefits": ["100% Automated booking", "Reduce no-shows by 80%", "Bilingual support", "Google Calendar sync"]
    }
  },
  "growth": {
    "icon": "🎯",
    "ar": {
      "title": "محرك النمو التلقائي",
      "desc": "وكالة تسويق رقمية في نظام واحد للبحث عن العملاء وبناء الثقة.",
      "flow": ["استخراج بيانات الجمهور", "إرسال رسائل مخصصة AI", "متابعة العملاء المترددين"],
      "benefits": ["استهداف جغرافي دقيق", "رسائل AI عالية التحويل", "متابعة آلية ذكية", "تقارير أداء حية"]
    },
    "en": {
      "title": "Automatic Growth Engine",
      "desc": "A digital marketing agency in one system to find customers and build trust.",
      "flow": ["Audience data extraction", "Personalized AI outreach", "Automated follow-ups"],
      "benefits": ["Precise geo-targeting", "High-conversion AI copy", "Smart persistent follow-up", "Live ROI dashboard"]
    }
  },
  "realestate": {
    "icon": "🏢",
    "ar": {
      "title": "المساعد العقاري",
      "desc": "تأهيل العملاء وجدولة المعاينات وتوزيع الفرص على الوكلاء.",
      "flow": ["تأهيل ميزانية العميل", "عرض الوحدات المناسبة", "جدولة المعاينة للوكيل"],
      "benefits": ["تأهيل فوري للمشترين", "فرز الطلبات العقارية", "مزامنة معاينات حية", "تنبيهات مبيعات ساخنة"]
    },
    "en": {
      "title": "Real Estate Assistant",
      "desc": "Qualifying leads, scheduling viewings, and distributing opportunities to agents.",
      "flow": ["Budget qualification", "Property matching", "Viewing coordination"],
      "benefits": ["Instant buyer qualification", "Property requirement filtering", "Live viewing sync", "Hot lead alerts"]
    }
  }
};

function openModal(id) {
  const d = serviceDB[id];
  if(!d) return;
  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const content = d[lang] || d['en'];

  document.getElementById('smIcon').textContent = d.icon;
  document.getElementById('smTitle').textContent = content.title;
  document.getElementById('smDesc').textContent = content.desc;
  
  const fDiv = document.getElementById('smFlow');
  if(fDiv) {
    fDiv.innerHTML = '';
    content.flow.forEach((step, idx) => {
      fDiv.innerHTML += \`<div class="bg-white/5 p-3 rounded-xl border border-white/5 text-center"><div class="text-aqua font-bold mb-1 text-xs">\${lang==='ar'?'خطوة':'Step'} \${idx+1}</div><div class="text-[10px] text-gray-400">\${step}</div></div>\`;
    });
  }

  const bDiv = document.getElementById('smBenefits');
  if(bDiv) {
    bDiv.innerHTML = '';
    content.benefits.forEach(b => {
      bDiv.innerHTML += \`<div class="flex items-start gap-3 bg-white/5 rounded-lg p-4 border border-white/5"><span class="text-[#5EEAD4]">✓</span> <span class="text-gray-300 font-medium">\${b}</span></div>\`;
    });
  }
  const ov = document.getElementById('smOverlay');
  const ct = document.getElementById('smContent');
  ov.classList.remove('hidden');
  ov.classList.add('flex');
  void ov.offsetWidth;
  ov.classList.remove('opacity-0');
  ct.classList.remove('opacity-0','scale-95');
  document.body.style.overflow='hidden';
}

function closeModal() {
  const ov = document.getElementById('smOverlay');
  const ct = document.getElementById('smContent');
  if(!ov || !ct) return;
  ov.classList.add('opacity-0');
  ct.classList.add('opacity-0','scale-95');
  document.body.style.overflow='';
  setTimeout(()=> { ov.classList.remove('flex'); ov.classList.add('hidden'); }, 300);
}
</script>
`;

if (!html.includes('const serviceDB =')) {
    html = html.replace('</head>', headerScript + '\n</head>');
}

// 4. Update the MESSAGES object with backticks and bilingual support
const messagesNew = `
const MESSAGES = {
  ar: {
    langSelect: \`🌐 أهلاً! أنا جيك، مساعدك الذكي.\\nاختر لغتك:\\n1️⃣ English\\n2️⃣ العربية\\n\\n💡 اضغط 1 للإنجليزية، 2 للعربية\`,
    menu: \`أهلاً وسهلاً بك في عيادتنا! 🦷✨\\nأنا *جيك*، مساعدك الطبي الذكي، متاح على مدار الساعة.\\nكيف يمكنني مساعدتك اليوم؟\\n\\n1️⃣ حجز موعد 📅\\n2️⃣ موعدي الحالي 📋\\n3️⃣ إعادة جدولة 🔄\\n4️⃣ إلغاء الموعد ❌\\n5️⃣ خدماتنا 🦷\\n6️⃣ أطباؤنا 👨‍⚕️\\n7️⃣ الأسعار 💰\\n8️⃣ الموقع 📍\\n9️⃣ تقييم المنشأة ⭐\\n🔟 التحدث مع الفريق 👩‍⚕️\\n\\n💡 اضغط رقماً أو أخبرني بما تحتاج 😊\`,
    bookingSteps: {
      name: \`رائع! لنبدأ الحجز 😊\\nما اسمك الكريم؟\\n\\n💡 اكتب اسمك وأرسل\\n0️⃣ القائمة الرئيسية\`,
      phone: (p) => \`شكراً! 😊\\nرقم واتساب الخاص بك هو: *\${p}*\\nهل هذا صحيح؟\\n\\n1️⃣ نعم، هذا صحيح\\n2️⃣ لا، أريد رقماً آخر\\n\\n💡 اضغط 1 للتأكيد أو 2 للتغيير\\n0️⃣ القائمة الرئيسية\`,
      phoneReq: \`من فضلك أدخل رقم هاتفك:\\n\\n💡 اكتب رقم هاتفك وأرسل\`,
      treatment: \`اختر نوع الخدمة: 🦷\\n\\n1️⃣ تنظيف وتلميع 🦷\\n2️⃣ حشوات\\n3️⃣ تقويم الأسنان 📐\\n4️⃣ تبييض الأسنان ⚪\\n5️⃣ خلع\\n6️⃣ زراعة أسنان 🔬\\n7️⃣ علاج العصب 🏥\\n8️⃣ أخرى / غير متأكد\\n\\n💡 اضغط رقماً أو اختر من القائمة\`,
      notes: \`هل لديك ملاحظات أو وصف للحالة؟ (اختياري)\\n\\n💡 اكتب ملاحظتك أو أرسل *0* للتخطي\\n0️⃣ تخطي الخطوة\`,
      doctor: \`اختر الفريق المفضل: 👨‍⚕️\\n\\n1️⃣ د. أحمد (أخصائي زراعة)\\n2️⃣ د. سارة (أخصائية تقويم)\\n3️⃣ أي فريق متاح\\n\\n💡 اضغط رقماً للاختيار\`,
      date: (doc) => \`متى تفضل موعدك \${doc}؟ 📅\\n\\n1️⃣ غداً (الثلاثاء)\\n2️⃣ الأربعاء\\n3️⃣ الخميس\\n4️⃣ الأسبوع القادم\\n\\n💡 اضغط رقماً أو اكتب أي تاريخ مثل "بكرة"\`,
      slot: (date) => \`الأوقات المتاحة لهذا اليوم (\${date}): 📋\\n\\n1️⃣ 10:00 صباحاً\\n2️⃣ 12:00 مساءً\\n3️⃣ 04:00 مساءً\\n4️⃣ 06:30 مساءً\\n\\n💡 اختر الوقت المناسب لك\`,
      securing: \`🔒 جاري تأمين موعدك...\\nتحقق من التعارضات في التقويم...\`,
      confirmed: \`✅ *تم الحجز بنجاح!* 🎉\`,
      summary: (d) => \`📋 *تفاصيل موعدك:*\\n👤 الاسم: \${d.name}\\n🦷 العلاج: \${d.treatment}\\n📅 التاريخ: \${d.date}\\n⏰ الوقت: \${d.slot}\\n👨‍⚕️ الفريق: \${d.doctor}\\n\\n📅 تم التسجيل في تقويم المنشأة\\n🔔 ستصلك تذكيرات تلقائية قبل الموعد\`
    },
    reminderPreview: (name, date, slot, treat) => \`🔔 *تذكير تلقائي (بعد 24 ساعة)*\\n\\nمرحباً \${name}، نذكرك بموعدك غداً:\\n📅 \${date} الساعة ⏰ \${slot}\\n🦷 العلاج: \${treat}\\n\\nنراك قريباً! 😊 إذا أردت تغيير الموعد، فقط أرسل "إعادة جدولة".\`,
    myAppt: (d) => \`📋 *موعدك الحالي:*\\n📅 \${d.date} الساعة \${d.slot}\\n👨‍⚕️ الفريق: \${d.doctor}\\n\\n1️⃣ إعادة جدولة 🔄\\n2️⃣ إلغاء الموعد ❌\\n3️⃣ العودة للقائمة الرئيسية\`,
    resched: {
      date: \`أهلاً بك! لتغيير موعدك، اختر التاريخ الجديد:\\n\\n1️⃣ غداً\\n2️⃣ بعد غد\\n3️⃣ الأسبوع القادم\`,
      confirm: (d, s) => \`تم التحديث! موعدك الجديد هو:\\n📅 \${d} الساعة \${s}\\n\\n✅ تم تحديث التقويم بنجاح.\`
    },
    cancel: {
      confirm: \`هل أنت متأكد من إلغاء موعدك؟ ❌\\n\\n1️⃣ نعم، ألغِ الموعد\\n2️⃣ لا، احتفظ بالموعد\`,
      success: \`✅ تم إلغاء الموعد بنجاح. نأمل رؤيتك قريباً!\`
    },
    prices: \`💰 *قائمة الأسعار التقريبية:*\\n• تنظيف: 200 ريال\\n• حشو: 350 ريال\\n• تقويم: يبدأ من 3000 ريال\\n• زراعة: يبدأ من 4500 ريال\\n\\n💡 هذه الأسعار أولية وتخضع للفحص.\`,
    services: \`🦷 *خدمات المنشأة:*\\n• زراعة الأسنان المتقدمة\\n• تقويم الأسنان الشفاف والعادي\\n• طب أسنان الأطفال\\n• تبييض الأسنان بالليزر\`,
    location: \`📍 *موقع المنشأة:*\\nيقع مجمعنا في قلب الخبر، شارع الأمير تركي.\\n\\n🗺️ رابط خرائط جوجل:\\nhttps://maps.google.com/?q=Qudozen+Clinic\\n\\n💡 يمكنك دائماً طلب الموقع وسأرسله لك فوراً!\`,
    reviews: \`⭐ *آراء عملائنا:*\\n• 'تعامل راقي جداً ونظام دقيق' - خالد\\n• 'أفضل منشأة تعاملت معها في الشرقية' - سارة\\n\\n🔗 يمكنك قراءة المزيد أو وضع تقييمك هنا:\\nhttps://g.page/qudozen/review\`,
    staff: \`👩‍⚕️ جاري تحويلك للتحدث مع الفريق...\\nيرجى الانتظار لحظة.\`,
    completion: (name) => \`بكل سرور \${name}! 😊\\nنتطلع لاستقبالك. إذا احتجت أي مساعدة إضافية نحن هنا.\\n\\n-- النظام الذكي للمنشأة 🤖\`,
    dash: { status:'نشط', title:'لوحة التحكم', conf:'موعد جديد', treat:'العلاج', time:'الوقت', date:'التاريخ', doc:'الفريق', sync:'مزامنة', rem:'تذكير' }
  },
  en: {
    langSelect: \`🌐 Welcome! I'm Jake, your AI assistant.\\nPlease choose your language / اختر لغتك:\\n1️⃣ English\\n2️⃣ العربية\\n\\n💡 Tap 1 for English, 2 for Arabic\`,
    menu: \`Welcome to our clinic! 🦷✨\\nI'm *Jake*, your AI medical assistant, available 24/7.\\nHow can I help you today?\\n\\n1️⃣ Book appointment 📅\\n2️⃣ My appointment 📋\\n3️⃣ Reschedule 🔄\\n4️⃣ Cancel appointment ❌\\n5️⃣ Our services 🦷\\n6️⃣ Our doctors 👨‍⚕️\\n7️⃣ Prices 💰\\n8️⃣ Location 📍\\n9️⃣ Leave a review ⭐\\n🔟 Talk to staff 👩‍⚕️\\n\\n💡 Tap a number or tell me what you need 😊\`,
    bookingSteps: {
      name: \`Great! Let's book your appointment 😊\\nWhat's your full name?\\n\\n💡 Type your name and send\\n0️⃣ Main menu\`,
      phone: (p) => \`Thanks! 😊\\nYour WhatsApp number is: *\${p}*\\nIs this correct?\\n\\n1️⃣ Yes, that's correct\\n2️⃣ No, use a different number\\n\\n💡 Tap 1 to confirm or 2 to change\\n0️⃣ Main menu\`,
      phoneReq: \`Please enter your phone number:\\n\\n💡 Type your phone number and send\`,
      treatment: \`Select service type: 🦷\\n\\n1️⃣ Cleaning & Polishing 🦷\\n2️⃣ Fillings\\n3️⃣ Braces & Orthodontics 📐\\n4️⃣ Teeth Whitening ⚪\\n5️⃣ Extraction\\n6️⃣ Dental Implants 🔬\\n7️⃣ Root Canal 🏥\\n8️⃣ Other / Not sure\\n\\n💡 Tap a number or pick from the list\`,
      notes: \`Any notes or description of your issue? (optional)\\n\\n💡 Type your note or send *0* to skip\\n0️⃣ Skip step\`,
      doctor: \`Select your preferred doctor: 👨‍⚕️\\n\\n1️⃣ Dr. Ahmed (Implants)\\n2️⃣ Dr. Sarah (Braces)\\n3️⃣ Any available doctor\\n\\n💡 Tap a number to select\`,
      date: (doc) => \`When would you like your appointment with \${doc}? 📅\\n\\n1️⃣ Tomorrow (Tuesday)\\n2️⃣ Wednesday\\n3️⃣ Thursday\\n4️⃣ Next week\\n\\n💡 Tap a number or type a date like "tomorrow"\`,
      slot: (date) => \`Available slots for \${date}: 📋\\n\\n1️⃣ 10:00 AM\\n2️⃣ 12:00 PM\\n3️⃣ 04:00 PM\\n4️⃣ 06:30 PM\\n\\n💡 Pick the best time for you\`,
      securing: \`🔒 Securing your slot...\\nChecking calendar for conflicts...\`,
      confirmed: \`✅ *Booking Successful!* 🎉\`,
      summary: (d) => \`📋 *Your Details:*\\n👤 Name: \${d.name}\\n🦷 Treatment: \${d.treatment}\\n📅 Date: \${d.date}\\n⏰ Time: \${d.slot}\\n👨‍⚕️ Doctor: \${d.doctor}\\n\\n📅 Registered in clinic calendar\\n🔔 Auto-reminders scheduled\`
    },
    reminderPreview: (name, date, slot, treat) => \`🔔 *Auto-Reminder (24h later)*\\n\\nHi \${name}, reminding you of your appointment tomorrow:\\n📅 \${date} at ⏰ \${slot}\\n🦷 Treatment: \${treat}\\n\\nSee you then! 😊 If you need to change the time, just reply 'reschedule'.\`,
    myAppt: (d) => \`📋 *Your Current Appointment:*\\n📅 \${d.date} at \${d.slot}\\n👨‍⚕️ Doctor: \${d.doctor}\\n\\n1️⃣ Reschedule 🔄\\n2️⃣ Cancel ❌\\n3️⃣ Back to Main Menu\`,
    resched: {
      date: \`Welcome! To change your time, select a new date:\\n\\n1️⃣ Tomorrow\\n2️⃣ Day after\\n3️⃣ Next week\`,
      confirm: (d, s) => \`Updated! Your new appointment is:\\n📅 \${d} at \${s}\\n\\n✅ Calendar updated successfully.\`
    },
    cancel: {
      confirm: \`Are you sure you want to cancel? ❌\\n\\n1️⃣ Yes, cancel it\\n2️⃣ No, keep it\`,
      success: \`✅ Appointment cancelled. We hope to see you soon!\`
    },
    prices: \`💰 *Estimated Price List:*\\n• Cleaning: 200 SAR\\n• Fillings: 350 SAR\\n• Braces: from 3000 SAR\\n• Implants: from 4500 SAR\\n\\n💡 Final price depends on clinical exam.\`,
    services: \`🦷 *Our Services:*\\n• Dental Implants\\n• Clear Aligners\\n• Pediatric Dentistry\\n• Laser Whitening\`,
    location: \`📍 *Our Location:*\\nWe are located in the heart of Khobar, Prince Turki St.\\n\\n🗺️ Google Maps Link:\\nhttps://maps.google.com/?q=Qudozen+Clinic\\n\\n💡 You can always ask for the location and I'll send it!\`,
    reviews: \`⭐ *Patient Reviews:*\\n• 'Amazing experience and very professional' - Khalid\\n• 'Best clinic in the Eastern Province' - Sarah\\n\\n🔗 Read more or leave a review here:\\nhttps://g.page/qudozen/review\`,
    staff: \`👩‍⚕️ Connecting you to our team...\\nPlease hold for a moment.\`,
    completion: (name) => \`You're welcome, \${name}! 😊\\nWe look forward to seeing you. Let us know if you need anything else.\\n\\n-- Qudozen OS 🤖\`,
    dash: { status:'ACTIVE', title:'Management DB', conf:'New Booking', treat:'Treatment', time:'Time', date:'Date', doc:'Doctor', sync:'Sync', rem:'Remind' }
  }
};
`;

const messagesRegex = /const MESSAGES = \{[\s\S]*?\};/;
html = html.replace(messagesRegex, messagesNew);

// 5. Remove WhatsApp redirect and replace with on-site completion
const redirectSearch = /function showWhatsAppRedirect\(\) \{[\s\S]*?\}/;
const redirectNew = `function showWhatsAppRedirect() {
  const wa = document.getElementById('waRedirect');
  if (wa) {
    wa.innerHTML = \`
      <div class="bg-teal-900/20 border border-teal-500/30 rounded-2xl p-8 text-center">
        <div class="text-4xl mb-4">🚀</div>
        <h3 class="text-2xl font-bold text-white mb-2">Ready to evolve?</h3>
        <p class="text-gray-400 mb-6">Your facility's autonomous journey starts here. No more missed patients.</p>
        <button onclick="openModal('reception')" class="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-gray-200 transition">Contact Jake for Activation</button>
      </div>
    \`;
    wa.classList.remove('hidden');
    wa.style.opacity = '1';
  }
}`;
html = html.replace(redirectSearch, redirectNew);

fs.writeFileSync(filePath, html);
console.log('index.html fixed with backticks and bilingual support.');
