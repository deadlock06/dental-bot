const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// ─── Phase 10: Premium Bilingual Service Grid Upgrade ───
const serviceDB_Replacement = `const serviceDB = {
  "reception": {
    "icon": "🤖",
    "ar": {
      "title": "موظف الاستقبال الذكي",
      "desc": "نظام استقبال ذاتي متكامل عبر الواتساب يدير المرضى من الطلب حتى الحضور.",
      "flow": ["استلام الطلب وتحليله", "تنسيق الوقت مع التقويم", "تأكيد وحجز الموعد آلياً"],
      "benefits": ["حجز آلي بنسبة 100%", "تذكيرات تقلل الغياب 80%", "دعم ثنائي اللغة", "مزامنة تقويم جوجل"]
    },
    "en": {
      "title": "Smart AI Receptionist",
      "desc": "Fully autonomous WhatsApp reception system managing the entire patient journey.",
      "flow": ["Lead Analysis", "Calendar Coordination", "Automated Booking"],
      "benefits": ["100% Automated Booking", "80% No-Show Reduction", "Bilingual Support", "Google Calendar Sync"]
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
      "title": "Growth Swarm Engine",
      "desc": "Autonomous digital marketing agency in a single system for discovery and trust.",
      "flow": ["Audience Extraction", "Personalized AI Outreach", "Lost Lead Recovery"],
      "benefits": ["Precise Geo-Targeting", "High-Conversion AI Copy", "Smart Auto-Followup", "Live ROI Reporting"]
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
      "desc": "Qualify leads, schedule viewings, and distribute opportunities to agents autonomously.",
      "flow": ["Budget Qualification", "Unit Matching", "Viewing Scheduling"],
      "benefits": ["Instant Buyer Qualification", "Smart Property Sorting", "Live Sync Viewings", "Hot Lead Alerts"]
    }
  },
  "web": {
    "icon": "🌐",
    "ar": {
      "title": "أنظمة ويب للتحويل",
      "desc": "مسارات بيع (Funnels) سريعة تربط العميل مباشرة بنظام الواتساب.",
      "flow": ["تصميم واجهة تحويل", "تحميل فائق السرعة", "ربط زر العمل بالبوت"],
      "benefits": ["تحويل زوار لعملاء", "سرعة تحميل < 1.5ث", "تحسين محركات البحث", "تصميم عصري متجاوب"]
    },
    "en": {
      "title": "Web Conversion Funnels",
      "desc": "High-performance sales funnels that connect visitors directly to your AI system.",
      "flow": ["Conversion UI Design", "Ultra-Fast Loading", "Bot Integration"],
      "benefits": ["Visitor-to-Lead Conversion", "< 1.5s Load Speeds", "SEO Optimized", "Modern Responsive Design"]
    }
  },
  "app": {
    "icon": "📱",
    "ar": {
      "title": "تطبيقات الأعمال",
      "desc": "تطوير أدوات مخصصة لمنشأتك لتسهيل العمليات أو خدمة العملاء.",
      "flow": ["تحديد متطلبات العمل", "تطوير واجهات مخصصة", "إطلاق وتكامل الأنظمة"],
      "benefits": ["تطبيقات PWA سريعة", "واجهات API مخصصة", "أمان بيانات مشفر", "سهولة الاستخدام"]
    },
    "en": {
      "title": "Custom Business Apps",
      "desc": "Bespoke tools designed for your clinic to streamline internal operations.",
      "flow": ["Requirement Discovery", "Custom UI Development", "System Integration"],
      "benefits": ["Fast PWA Technology", "Custom API Endpoints", "Encrypted Data Security", "Intuitive UX/UI"]
    }
  },
  "auto": {
    "icon": "⚡",
    "ar": {
      "title": "أتمتة العمليات",
      "desc": "ربط جميع برامجك لتعمل معاً كآلة واحدة دون تدخل بشري.",
      "flow": ["تحديد المهام المتكررة", "ربط الأنظمة (Zapier/API)", "تفعيل التدفق الآلي"],
      "benefits": ["توفير 100+ ساعة شهرياً", "ربط 5000+ تطبيق", "صفر أخطاء بشرية", "إشعارات لحظية"]
    },
    "en": {
      "title": "Workflow Automation",
      "desc": "Connect all your software to work as one machine without human touch.",
      "flow": ["Repetitive Task Mapping", "System Interconnect (API)", "Automated Workflow Activation"],
      "benefits": ["Save 100+ Hours Monthly", "Connect 5000+ Apps", "Zero Human Error", "Real-Time Notifications"]
    }
  },
  "analytics": {
    "icon": "📊",
    "ar": {
      "title": "لوحة القيادة الذكية",
      "desc": "بيانات حية تكشف الأرباح المهدرة وتوجه قرارات النمو.",
      "flow": ["جمع البيانات من القنوات", "تحليل العائد والأرباح", "توليد تقارير اتخاذ القرار"],
      "benefits": ["تتبع أرباح مهدرة", "بيانات حية بالثانية", "تحليل أداء الفريق", "ROI دقيق للحملات"]
    },
    "en": {
      "title": "Smart Owner Dashboard",
      "desc": "Live data that reveals wasted profit and guides growth decisions.",
      "flow": ["Multi-Channel Data Sync", "ROI & Profit Analysis", "Strategic Reporting"],
      "benefits": ["Wasted Profit Tracking", "Per-Second Live Data", "Team Performance KPIs", "Precise Campaign ROI"]
    }
  },
  "enterprise": {
    "icon": "💎",
    "ar": {
      "title": "النظام المؤسسي",
      "desc": "بنية تحتية مستقلة (Private SaaS) للشركات الكبرى والعيادات المتعددة.",
      "flow": ["تخصيص الخادم المستقل", "تكامل الأنظمة المركزية", "تفعيل الصلاحيات والأمان"],
      "benefits": ["خصوصية بيانات كاملة", "سعة معالجة غير محدودة", "دعم فني استراتيجي", "تخصيص AI متقدم"]
    },
    "en": {
      "title": "Enterprise Infrastructure",
      "desc": "Independent Private SaaS infrastructure for large companies and chains.",
      "flow": ["Private Server Provisioning", "Central System Integration", "Security & Permissions"],
      "benefits": ["Full Data Privacy", "Unlimited Processing Capacity", "Strategic Technical Support", "Advanced AI Customization"]
    }
  }
};`;

// ─── Update openModal to use the new bilingual structure ───
const openModal_Replacement = `function openModal(id) {
  const lang = sessionStorage.getItem('qd_lang') || 'en';
  const entry = serviceDB[id];
  if (!entry) return;
  
  const d = entry[lang] || entry['ar']; // Fallback to ar if lang missing

  document.getElementById('smIcon').textContent  = entry.icon;
  document.getElementById('smTitle').textContent = d.title;
  document.getElementById('smDesc').textContent  = d.desc;

  const fDiv = document.getElementById('smFlow');
  if (fDiv) {
    fDiv.innerHTML = '';
    const stepTxt = lang === 'ar' ? 'خطوة' : 'Step';
    d.flow.forEach((step, idx) => {
      fDiv.innerHTML += '<div class="bg-white/5 p-3 rounded-xl border border-white/5 text-center"><div class="text-aqua font-bold mb-1 text-xs">' + stepTxt + ' ' + (idx+1) + '</div><div class="text-[10px] text-gray-400">' + step + '</div></div>';
    });
  }

  const bDiv = document.getElementById('smBenefits');
  if (bDiv) {
    bDiv.innerHTML = '';
    d.benefits.forEach(b => {
      bDiv.innerHTML += '<div class="flex items-start gap-3 bg-white/5 rounded-lg p-4 border border-white/5"><span class="text-[#5EEAD4]">✓</span> <span class="text-gray-300 font-medium">' + b + '</span></div>';
    });
  }

  const ov = document.getElementById('smOverlay');
  const ct = document.getElementById('smContent');
  if (!ov || !ct) return;

  ov.classList.remove('hidden');
  ov.classList.add('flex');
  ov.style.opacity = '0';
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ov.style.opacity = '1';
      ov.style.transition = 'opacity 0.25s ease';
      ct.style.opacity = '1';
      ct.style.transform = 'scale(1)';
      ct.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    });
  });
}`;

// Find and replace serviceDB
const dbStart = html.indexOf('const serviceDB = {');
const dbEnd = html.indexOf('};', dbStart) + 2;
html = html.substring(0, dbStart) + serviceDB_Replacement + html.substring(dbEnd);

// Find and replace openModal
const omStart = html.indexOf('function openModal(id) {');
const omEnd = html.indexOf('\n}', omStart) + 2;
html = html.substring(0, omStart) + openModal_Replacement + html.substring(omEnd);

fs.writeFileSync('public/index.html', html);
console.log('✅ Phase 10: Service Grid optimized and made bilingual.');
