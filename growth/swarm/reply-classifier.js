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
        en: ['demo', 'try', 'see it', 'how does it work', 'show me', 'test', 'trial'],
        ar: ['جرب', 'تجربة', 'عرض', 'كيف يعمل', 'اختبار', 'أشوف']
      },
      hot_lead: {
        en: ['book a call', 'talk to someone', 'schedule', 'meeting', 'call me', 'interested', 'sign up', 'activate', 'lets go'],
        ar: ['احجز مكالمة', 'اتصلوا فيني', 'مهتم', 'أريد الاشتراك', 'ابدأ', 'فعل', 'نبي نتكلم']
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

    // Safety Guardrail: Human Override after 3 unclear intents
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
      'pricing': this.handlePricing.bind(this),
      'simulator': this.handleSimulator.bind(this),
      'hot_lead': this.handleHotLead.bind(this),
      'objection': this.handleObjection.bind(this),
      'unclear': this.handleUnclear.bind(this)
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
    
    // Update lead status to opted_out
    await db.updateLeadStatus(leadId, 'opted_out');

    return { replied: true, message: responses[lang], escalate: false };
  }

  async handlePricing(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');
    
    const responses = {
      en: `Our AI receptionist starts at 299 SAR/month for solo clinics, and 499 SAR/month for multi-doctor practices (plus a one-time setup fee).\n\nThe system typically pays for itself within the first 2-3 after-hours bookings it captures.\n\nWant to see it in action? Try the live simulator: https://qudozen.com/?clinic=YourClinic`,
      ar: `يبدأ الاستقبال الذكي من 299 ريال/شهر للعيادات الفردية، و499 ريال/شهر للعيادات متعددة الأطباء (بالإضافة إلى رسوم إعداد لمرة واحدة).\n\nالنظام يغطي تكلفته عادةً من أول حجزين يتم استلامهم بعد الدوام.\n\nتريد تجربته مباشرة؟ جرب المحاكي الحي: https://qudozen.com`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    return { replied: true, message: responses[lang], escalate: false };
  }

  async handleSimulator(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');
    
    // Personalize the simulator link if we know the clinic name
    const lead = await db.getLeadById(leadId);
    const clinicParam = lead?.company_name ? `?clinic=${encodeURIComponent(lead.company_name)}` : '';
    
    const responses = {
      en: `See exactly how your patients would experience this:\n\nhttps://qudozen.com${clinicParam}\n\nThis is a live demo — try booking an appointment as if you were a patient.`,
      ar: `شاهد بالضبط كيف سيتفاعل مرضاك مع النظام:\n\nhttps://qudozen.com${clinicParam}\n\nهذا عرض حي — جرب حجز موعد كما لو كنت مريضاً.`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    return { replied: true, message: responses[lang], escalate: false };
  }

  async handleHotLead(leadId, businessId, message, lang, phone) {
    const { sendMessage } = require('../../whatsapp.js');
    
    // Acknowledge the lead immediately
    const responses = {
      en: `Great! I'm connecting you with Jake, the founder, who will personally get you set up. He'll be in touch within the next few hours.\n\nIn the meantime, if you want to see the system live: https://qudozen.com`,
      ar: `ممتاز! سأوصلك بجيك، المؤسس، الذي سيقوم بإعداد نظامك شخصياً. سيتواصل معك خلال الساعات القليلة القادمة.\n\nفي الوقت الحالي، إذا أردت رؤية النظام مباشرة: https://qudozen.com`
    };

    await sendMessage(phone, responses[lang] || responses.en);

    // Escalate to Jake
    const lead = await db.getLeadById(leadId);
    const escalationMsg = `🔥 HOT LEAD ALERT\nClinic: ${lead?.company_name || 'Unknown'}\nPhone: ${phone}\nIntent: ${lang === 'ar' ? 'مهتم / حار' : 'Hot lead'}\nMessage: ${message}\n\nReply to this thread to take over the conversation.`;
    
    await sendMessage(process.env.ADMIN_PHONE || '966500000000', escalationMsg);

    return { replied: true, message: responses[lang], escalate: true };
  }

  async handleObjection(leadId, businessId, message, lang, phone) {
    // Delegate to existing objection handler from Phase 4
    // Note: handleObjection in handoff.js might need slight adjustments to match this return type
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
      en: `Thanks for your message. To help you best, could you let me know if you'd like to:\n1. See a live demo\n2. Know about pricing\n3. Talk to our founder Jake directly\n\nJust reply with the number or ask your question!`,
      ar: `شكراً لرسالتك. لمساعدتك بشكل أفضل، هل يمكنك إخباري إذا كنت تريد:\n1. رؤية عرض حي\n2. معرفة الأسعار\n3. التحدث مع جيك مباشرة\n\nفقط رد بالرقم أو اسأل سؤالك!`
    };

    await sendMessage(phone, responses[lang] || responses.en);
    return { replied: true, message: responses[lang], escalate: false };
  }
}

module.exports = new ReplyClassifier();
