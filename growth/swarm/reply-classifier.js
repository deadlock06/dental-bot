const db = require('../../db.js');

class ReplyClassifier {
  constructor() {
    // Intent patterns (bilingual)
    this.patterns = {
      not_interested: {
        en: ['not interested', 'unsubscribe', 'stop', 'remove me', 'don\'t message', 'no thanks', 'not now'],
        ar: ['لا شكرا', 'أوقف', 'لا تهتم', 'لا أريد', 'ألغي', 'لا ترسل']
      },
      pricing: {
        en: ['how much', 'price', 'cost', 'pricing', 'expensive', 'cheap', 'sar', 'usd', 'fees'],
        ar: ['كم السعر', 'التكلفة', 'السعر', 'رسوم', 'غالي', 'رخيص', 'بكم']
      },
      simulator: {
        en: ['demo', 'see it', 'how does it work', 'show me', 'test'],
        ar: ['جرب', 'عرض', 'كيف يعمل', 'اختبار', 'أشوف']
      },
      trial: {
        en: ['trial', 'try', 'free', 'start trial', '7 day', '7-day'],
        ar: ['تجربة', 'تجربه', 'مجاني', 'ابدأ التجربة', '7 أيام']
      },
      hot_lead: {
        en: ['book a call', 'talk to someone', 'schedule', 'meeting', 'call me', 'interested', 'sign up', 'activate', 'lets go', 'ready'],
        ar: ['احجز مكالمة', 'اتصلوا فيني', 'مهتم', 'أريد الاشتراك', 'ابدأ', 'فعل', 'نبي نتكلم', 'جاهز']
      },
      objection: {
        en: ['already have', 'too expensive', 'not sure', 'maybe later', 'compare', 'think about it', 'data safe', 'surgery'],
        ar: ['عندي نظام', 'غالي', 'ما أدري', 'بفكر', 'أقارن', 'خصوصية', 'عملية']
      }
    };
  }

  classify(message, lang = 'en') {
    const lower = (message || '').toLowerCase().trim();

    // Check each intent
    for (const [intent, patterns] of Object.entries(this.patterns)) {
      const langPatterns = patterns[lang] || patterns.en;
      if (langPatterns.some(p => lower.includes(p))) {
        return { intent, confidence: 'high' };
      }
    }

    // Cross-language fallback (Arabic message checked against English patterns)
    if (lang === 'ar') {
      for (const [intent, patterns] of Object.entries(this.patterns)) {
        if (patterns.en.some(p => lower.includes(p))) {
          return { intent, confidence: 'medium' };
        }
      }
    }

    return { intent: 'unclear', confidence: 'low' };
  }

  async processInbound(leadId, businessId, message, fromPhone) {
    // 0. Safety Guardrail: Rate Limiting
    const { limited } = await this.checkRateLimit(leadId);
    if (limited) {
      console.log(`[Classifier] Rate limit reached for lead ${leadId}. Skipping auto-reply.`);
      return { replied: false, reason: 'rate_limit' };
    }

    // Detect language
    const lang = this.detectLanguage(message);

    // Classify
    const classification = this.classify(message, lang);

    // Log the inbound
    await db.createGrowthConversation({
      lead_id: leadId,
      business_id: businessId,
      direction: 'inbound',
      content: message,
      intent_classified: classification.intent
    });

    // Route based on intent
    const handler = this.getHandler(classification.intent);
    const result = await handler(leadId, businessId, message, lang, fromPhone);

    // Log the outbound auto-reply
    if (result.replied) {
      await db.createGrowthConversation({
        lead_id: leadId,
        business_id: businessId,
        direction: 'outbound',
        content: result.message,
        intent_classified: classification.intent,
        auto_replied: true,
        human_escalated: result.escalate || false
      });
    }

    // Safety Guardrail: Auto-escalate to hot lead after 3+ unclear intents
    if (classification.intent === 'unclear') {
      const unclearCount = await db.countUnclearIntents(leadId, 48); // hours
      if (unclearCount >= 3) {
        console.log(`[Classifier] 3+ unclear intents detected for ${leadId}. Auto-escalating to hot lead.`);
        await this.handleHotLead(leadId, businessId, message, lang, fromPhone);
      }
    }

    return result;
  }

  async checkRateLimit(leadId) {
    const recent = await db.countRecentAutoReplies(leadId, 24); // hours
    if (recent >= 3) {
      return { limited: true };
    }
    return { limited: false };
  }

  detectLanguage(message) {
    // Simple heuristic: if more than 30% Arabic Unicode range, classify as AR
    const msg = message || '';
    const arabicChars = (msg.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicChars > msg.length * 0.3 ? 'ar' : 'en';
  }

  getHandler(intent) {
    const handlers = {
      'not_interested': this.handleOptOut.bind(this),
      'pricing':        this.handlePricing.bind(this),
      'simulator':      this.handleSimulator.bind(this),
      'trial':          this.handleTrial.bind(this),
      'hot_lead':       this.handleHotLead.bind(this),
      'objection':      this.handleObjection.bind(this),
      'unclear':        this.handleUnclear.bind(this)
    };
    return handlers[intent] || handlers.unclear;
  }

  // ─── HANDLERS ───

  async handleOptOut(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');

    const responses = {
      en: `No problem at all. You won't receive any more messages from us. If you ever want to explore smart automation for your clinic, just reply START.`,
      ar: `لا مشكلة على الإطلاق. لن تتلقى أي رسائل أخرى. إذا أردت استكشاف الأتمتة الذكية لعيادتك، فقط رد بـ "ابدأ".`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    await db.updateLeadStatus(leadId, 'opted_out');

    return { replied: true, message: responses[lang], escalate: false };
  }

  async handlePricing(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');
    const { createCheckoutSession } = require('../../api/stripe-checkout.js');

    const lead = await db.getLeadById(leadId);
    const checkout = await createCheckoutSession(
      lead?.company_name || 'Your Clinic',
      `${phone}@onboarding.qudozen.com`,
      'awareness',
      lang
    );

    const responses = {
      en: `*Qudozen Pricing:*\n\n💼 *Awareness Plan* — $80/mo (299 SAR)\n• 200 conversations, booking + reminders\n\n🚀 *System Plan* — $133/mo (499 SAR)\n• Everything + Growth Engine + Dashboard\n• Setup: $186 (699 SAR) one-time\n\nThe system typically pays for itself within the first 2–3 bookings it captures.\n\n✅ Start now:\n${checkout.url}\n\nOr reply *TRIAL* for 7 days free.`,
      ar: `*أسعار Qudozen:*\n\n💼 *خطة الحضور* — $80/شهر (299 ريال)\n• 200 محادثة، حجز وتذكيرات\n\n🚀 *خطة النظام* — $133/شهر (499 ريال)\n• كل شيء + محرك النمو + لوحة التحكم\n• إعداد: $186 (699 ريال) مرة واحدة\n\nالنظام يغطي تكلفته عادةً من أول حجزين.\n\n✅ ابدأ الآن:\n${checkout.url}\n\nأو رد بـ *تجربة* للوصول المجاني لمدة 7 أيام.`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    return { replied: true, message: responses[lang] || responses.en, escalate: false };
  }

  // ─── STEP 4: In-Chat WhatsApp Simulator (replaces link-based demo) ───
  async handleSimulator(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');

    const demo = {
      en: [
        "I'll show you exactly how your patients experience this. *Live demo starting...*",
        "*Patient:* Hi, I need a dental cleaning",
        "*Bot:* Welcome! I'd be happy to help. Could you share your name please?",
        "*Patient:* Sarah",
        "*Bot:* Thanks Sarah! We offer:\n1. Cleaning (150 SAR)\n2. Whitening (800 SAR)\n3. Fillings (300 SAR)\n4. Implants (5,000 SAR)\n\nWhich would you like?",
        "*Patient:* 1",
        "*Bot:* Great choice! Dr. Ahmed is available:\n• Tomorrow 10:00 AM\n• Tomorrow 2:00 PM\n\nWhich works for you?",
        "*Patient:* 10 AM",
        "*Bot:* ✅ *Confirmed!*\n\nSarah, your cleaning is booked for:\n📅 Tomorrow, 10:00 AM\n👨‍⚕️ Dr. Ahmed\n💰 150 SAR\n\nYou'll receive a reminder 24 hours before. *That took 8 seconds.*"
      ],
      ar: [
        "سأريك بالضبط كيف سيتفاعل مرضاك. *العرض الحي يبدأ...*",
        "*المريض:* مرحباً، أحتاج تنظيف أسنان",
        "*البوت:* أهلاً بك! يسعدني مساعدتك. هل يمكنك مشاركة اسمك؟",
        "*المريض:* سارة",
        "*البوت:* شكراً سارة! نقدم:\n1. تنظيف (150 ريال)\n2. تبييض (800 ريال)\n3. حشوات (300 ريال)\n4. زراعة (5,000 ريال)\n\nماذا تفضلين؟",
        "*المريض:* 1",
        "*البوت:* خيار ممتاز! د. أحمد متوفر:\n• غداً 10:00 صباحاً\n• غداً 2:00 ظهراً\n\nما الوقت المناسب لك؟",
        "*المريض:* 10 صباحاً",
        "*البوت:* ✅ *تم التأكيد!*\n\nسارة، حجزت لك موعد تنظيف:\n📅 غداً، 10:00 صباحاً\n👨‍⚕️ د. أحمد\n💰 150 ريال\n\nستتلقين تذكيراً قبل 24 ساعة. *استغرق ذلك 8 ثوانٍ.*"
      ]
    };

    const flow = demo[lang] || demo.en;

    // Send with realistic delays
    for (let i = 0; i < flow.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 500 : 1500));
      await sendMessage(phone, flow[i]);
    }

    // Close with checkout link
    const { createCheckoutSession } = require('../../api/stripe-checkout.js');
    const lead = await db.getLeadById(leadId);
    const checkout = await createCheckoutSession(
      lead?.company_name || 'Your Clinic',
      `${phone}@onboarding.qudozen.com`,
      'system',
      lang
    );

    const close = {
      en: `*That was a live simulation — not a video.*\n\nYour patients get this exact experience 24/7. No missed calls. No lost bookings.\n\nReady to activate ${lead?.company_name || 'your clinic'}?\n${checkout.url}\n\nOr reply *TRIAL* for 7 days free.`,
      ar: `*هذا كان عرضاً حياً — ليس فيديو.*\n\nمرضاك يحصلون على هذه التجربة بالضبط على مدار الساعة. لا مكالمات فائتة. لا حجوزات ضائعة.\n\nجاهز لتفعيل ${lead?.company_name || 'عيادتك'}؟\n${checkout.url}\n\nأو رد بـ *تجربة* للوصول المجاني لمدة 7 أيام.`
    };

    await new Promise(r => setTimeout(r, 2000));
    await sendMessage(phone, close[lang] || close.en);

    await db.updateLeadStatus(leadId, 'demo_sent', {
      checkout_url: checkout.url,
      checkout_sent_at: new Date().toISOString()
    });

    return { replied: true, message: 'simulation_complete', escalate: false };
  }

  // ─── STEP 3: Hot Lead Handler — Zero Human, Self-Checkout ───
  async handleHotLead(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');
    const { createCheckoutSession } = require('../../api/stripe-checkout.js');

    const lead = await db.getLeadById(leadId);
    const email = lead?.email || `${phone}@onboarding.qudozen.com`;

    // Generate checkout immediately — no human in the loop
    const checkout = await createCheckoutSession(
      lead?.company_name || 'Your Clinic',
      email,
      'system',
      lang
    );

    const responses = {
      en: `Perfect! I can get ${lead?.company_name || 'your clinic'} live immediately.\n\n✅ *Personalized Checkout:*\n${checkout.url}\n\n*After payment, you'll receive instantly:*\n• Dashboard login credentials\n• WhatsApp bot activation (10 minutes)\n• 5 high-intent patient leads as welcome gift\n\n*No credit card?* Reply TRIAL for 7-day free access.\n\nQuestions? Reply here — I'm available 24/7.`,
      ar: `ممتاز! يمكنني تفعيل ${lead?.company_name || 'عيادتك'} فوراً.\n\n✅ *رابط الدفع الشخصي:*\n${checkout.url}\n\n*بعد الدفع، ستتلقى فوراً:*\n• بيانات دخول لوحة التحكم\n• تفعيل بوت الواتساب (10 دقائق)\n• 5 مرضى محتملين كهدية ترحيب\n\n*لا بطاقة ائتمان؟* رد بـ "تجربة" للوصول المجاني لمدة 7 أيام.\n\nلديك أسئلة؟ رد هنا — أنا متاح 24/7.`
    };

    await sendMessage(phone, responses[lang] || responses.en);

    // Store checkout URL for tracking — no ADMIN_PHONE alert
    await db.updateLeadStatus(leadId, 'checkout_sent', {
      checkout_url: checkout.url,
      checkout_session_id: checkout.session_id,
      checkout_sent_at: new Date().toISOString()
    });

    console.log(`[Classifier] ✅ Hot lead ${leadId} sent self-checkout — no human escalation`);

    return { replied: true, message: responses[lang] || responses.en, escalate: false };
  }

  // ─── TRIAL: Free 7-day activation ───
  async handleTrial(leadId, businessId, message, lang, phone) {
    const onboarding = require('../onboarding-state-machine.js');
    const lead = await db.getLeadById(leadId);

    const result = await onboarding.handleTrialRequest(phone, message, {
      clinic: lead?.company_name,
      lang
    });

    if (result.handled) {
      await db.updateLeadStatus(leadId, 'trial_started');
      return { replied: true, message: 'trial_activated', escalate: false };
    }

    // Fallback: send checkout link
    return this.handleHotLead(leadId, businessId, message, lang, phone);
  }

  async handleObjection(leadId, businessId, message, lang, phone) {
    try {
      const { handleObjection } = require('../handoff.js');
      const response = await handleObjection(leadId, businessId, message, lang, phone);
      return { replied: true, message: response || 'Objection handled', escalate: false };
    } catch (e) {
      return this.handleUnclear(leadId, businessId, message, lang, phone);
    }
  }

  async handleUnclear(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');

    const responses = {
      en: `Thanks for your message. To help you best, could you let me know if you'd like to:\n1. See a live demo\n2. Know about pricing\n3. Activate your system now\n\nJust reply with the number or ask your question!`,
      ar: `شكراً لرسالتك. لمساعدتك بشكل أفضل، هل يمكنك إخباري إذا كنت تريد:\n1. رؤية عرض حي\n2. معرفة الأسعار\n3. تفعيل نظامك الآن\n\nفقط رد بالرقم أو اسأل سؤالك!`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    return { replied: true, message: responses[lang] || responses.en, escalate: false };
  }
}

module.exports = new ReplyClassifier();
