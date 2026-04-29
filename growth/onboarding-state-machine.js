const db = require('../db.js');
const { sendMessage: sendWhatsApp } = require('../whatsapp.js');
const { generatePassword } = require('../utils/encrypt.js');

const ONBOARDING_STATES = {
  ACTIVATION_REQUESTED: 'activation_requested',
  CALENDAR_PENDING: 'calendar_pending',
  CREDENTIALS_SENT: 'credentials_sent',
  LIVE: 'live',
  FOLLOWUP_DAY1: 'followup_day1',
  CHECKIN_DAY3: 'checkin_day3',
  REVIEW_DAY7: 'review_day7',
  COMPLETED: 'completed'
};

class OnboardingStateMachine {
  constructor() {
    this.states = ONBOARDING_STATES;
  }

  // ─── ENTRY POINT: Called by Stripe webhook after payment ───
  async startFromPayment({ clinic_name, email, plan, lang, stripe_customer_id, stripe_subscription_id, owner_phone }) {
    console.log(`[Onboarding] 💳 Payment received — Starting onboarding for ${clinic_name}`);

    // Resolve phone from email if not provided (guest format: phone@onboarding.qudozen.com)
    let phone = owner_phone;
    if (!phone && email && email.includes('@onboarding.qudozen.com')) {
      phone = email.split('@')[0];
    }

    const existing = phone ? await db.getOnboardingByPhone(phone) : null;
    if (existing) {
      console.log(`[Onboarding] Existing record found for ${phone} — resuming`);
      await this.resumeSequence(existing);
      return;
    }

    const onboarding = await db.createOnboarding({
      clinic_name: clinic_name || 'Your Clinic',
      owner_name: 'Doctor',
      owner_phone: phone || 'unknown',
      current_state: this.states.ACTIVATION_REQUESTED,
      lang: lang || 'en',
      plan: plan || 'system',
      stripe_customer_id,
      stripe_subscription_id,
      paid: true
    });

    await this.runDay0(onboarding);
  }

  // ─── ENTRY POINT: Called when bot detects "Activate my trial" ───
  async handleActivation(phone, message, context) {
    const lower = message.toLowerCase();

    const activationKeywords = [
      'activate', 'activation', 'تفعيل', 'فعل', 'ابدأ', 'start trial',
      'جرب', 'تجربة', 'اشتراك', 'subscribe', 'احجز النظام'
    ];

    const isActivation = activationKeywords.some(k => lower.includes(k));
    if (!isActivation) return { handled: false };

    const existing = await db.getOnboardingByPhone(phone);
    if (existing) {
      await this.resumeSequence(existing);
      return { handled: true };
    }

    const clinicName = context.clinic || 'Your Clinic';
    const ownerName = context.owner || 'Doctor';
    const lang = context.lang || 'ar';

    const onboarding = await db.createOnboarding({
      clinic_name: clinicName,
      owner_name: ownerName,
      owner_phone: phone,
      current_state: this.states.ACTIVATION_REQUESTED,
      lang
    });

    await this.runDay0(onboarding);
    return { handled: true, onboarding_id: onboarding.id };
  }

  // ─── RESPONSE HANDLER: Processes replies to onboarding steps ───
  async handleResponse(phone, message, existing) {
    const lang = existing.lang || 'ar';
    const m = this.getMessages(lang);
    const msg = message.trim();

    // 1. Handle Help Request
    if (/help|مساعدة|كيف|بمساعدة/i.test(msg)) {
      await sendWhatsApp(phone, m.calendarHelp);
      return { handled: true };
    }

    // 2. Handle Calendar ID submission (Simple regex for email/ID format)
    if (existing.current_state === ONBOARDING_STATES.CALENDAR_PENDING && (msg.includes('@') || msg.length > 20)) {
      await db.updateOnboarding(existing.id, {
        calendar_id: msg,
        calendar_connected: true,
        current_state: ONBOARDING_STATES.LIVE
      });
      await sendWhatsApp(phone, m.setupComplete(existing.clinic_name));
      return { handled: true };
    }

    return { handled: false };
  }


  // ─── TRIAL: No credit card required ───
  async handleTrialRequest(phone, message, context) {
    const lower = message.toLowerCase();
    const trialKeywords = ['trial', 'تجربة', 'تجربه', 'start trial', 'ابدأ التجربة', 'free', 'مجاني'];

    if (!trialKeywords.some(k => lower.includes(k))) {
      return { handled: false };
    }

    const clinic = context.clinic || 'Your Clinic';
    const lang = context.lang || 'en';

    const username = `trial@${clinic.toLowerCase().replace(/\s+/g, '')}.qd`;
    const password = generatePassword(12);

    const m = this.getMessages(lang);
    await sendWhatsApp(phone, m.trialWelcome(username, password, clinic));

    // Create trial record (expires in 7 days)
    try {
      await db.createTrial({
        phone,
        clinic_name: clinic,
        username,
        password,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (e) {
      console.error('[Onboarding] Trial creation error:', e.message);
    }

    return { handled: true };
  }

  // ─── DAY 0: Welcome + Calendar Request + Credentials + Lead Gift ───
  async runDay0(onboarding) {
    const { owner_name, clinic_name, owner_phone, lang } = onboarding;
    const m = this.getMessages(lang);

    // 1. Welcome message
    await sendWhatsApp(owner_phone, m.welcome(owner_name, clinic_name));
    await this.logMessage(onboarding.id, 0, 'welcome', m.welcome(owner_name, clinic_name));

    // 2. Request Google Calendar sync
    await sendWhatsApp(owner_phone, m.calendarRequest(clinic_name));
    await this.logMessage(onboarding.id, 0, 'calendar_request', m.calendarRequest(clinic_name));

    await db.updateOnboarding(onboarding.id, {
      current_state: this.states.CALENDAR_PENDING
    });

    // 3. Generate dashboard credentials
    const username = `admin@${clinic_name.toLowerCase().replace(/\s+/g, '')}.qd`;
    const password = generatePassword(12);

    await db.updateOnboarding(onboarding.id, {
      dashboard_username: username,
      dashboard_password: password
    });

    // 4. Send credentials (delayed 2 minutes)
    setTimeout(async () => {
      await sendWhatsApp(owner_phone, m.credentials(username, password));
      await this.logMessage(onboarding.id, 0, 'credentials', m.credentials(username, password));
      await db.updateOnboarding(onboarding.id, {
        dashboard_credentials_sent: true,
        current_state: this.states.CREDENTIALS_SENT
      });
    }, 120000);

    // 5. Trigger Growth Swarm lead gift (5 leads)
    setTimeout(async () => {
      const leads = await this.giftLeads(clinic_name, owner_phone, 5);
      await sendWhatsApp(owner_phone, m.leadGift(leads.length));
      await db.updateOnboarding(onboarding.id, {
        leads_gifted: leads.length,
        current_state: this.states.LIVE
      });
    }, 300000); // 5 minutes after welcome

    // 6. Schedule Day 1 follow-up
    await this.scheduleCron(onboarding.id, 1, 'followup');
  }

  // ─── DAY 1: Calendar follow-up ───
  async runDay1(onboarding) {
    const m = this.getMessages(onboarding.lang);

    if (!onboarding.calendar_connected) {
      await sendWhatsApp(onboarding.owner_phone, m.day1FollowUp(onboarding.clinic_name));
      await this.logMessage(onboarding.id, 1, 'followup', m.day1FollowUp(onboarding.clinic_name));
    }

    await db.updateOnboarding(onboarding.id, {
      current_state: this.states.FOLLOWUP_DAY1
    });

    await this.scheduleCron(onboarding.id, 3, 'checkin');
  }

  // ─── DAY 3: Check-in ───
  async runDay3(onboarding) {
    const m = this.getMessages(onboarding.lang);

    await sendWhatsApp(onboarding.owner_phone, m.day3CheckIn(onboarding.clinic_name));
    await this.logMessage(onboarding.id, 3, 'checkin', m.day3CheckIn(onboarding.clinic_name));

    await db.updateOnboarding(onboarding.id, {
      current_state: this.states.CHECKIN_DAY3
    });

    await this.scheduleCron(onboarding.id, 7, 'review');
  }

  // ─── DAY 7: Autonomous bot review — NO human notification ───
  async runDay7(onboarding) {
    const m = this.getMessages(onboarding.lang);

    // Bot handles review, not human
    await sendWhatsApp(onboarding.owner_phone, m.day7Review());
    await this.logMessage(onboarding.id, 7, 'review_call', m.day7Review());

    await db.updateOnboarding(onboarding.id, {
      current_state: this.states.REVIEW_DAY7
    });

    // Bot will handle their reply in next inbound:
    // "good/جيد" → asks for Google review link
    // "help/مساعدة" → troubleshooting flow
    // "call/مكالمة" → sends Calendly self-scheduling link
    // "upgrade/ترقية" → shows advanced features
    console.log(`[Onboarding] Day 7 autonomous review sent to ${onboarding.owner_phone} (no human alert)`);
  }

  // ─── GROWTH SWARM: Gift 5 leads ───
  async giftLeads(clinicName, phone, count) {
    const leads = await db.getRandomHotLeads(count);
    return leads || [];
  }

  // ─── CRON SCHEDULER ───
  async scheduleCron(onboardingId, day, type) {
    await db.createCronJob({
      onboarding_id: onboardingId,
      run_at: new Date(Date.now() + day * 24 * 60 * 60 * 1000),
      type
    });
  }

  // ─── MESSAGE TEMPLATES ───
  getMessages(lang) {
    const msgs = {
      en: {
        welcome: (owner, clinic) => `Welcome to Qudozen, ${owner}! 🎉\n\nYour ${clinic} OS is being prepared. I'll need 2 minutes of your time to connect your calendar and deliver your dashboard.`,
        calendarRequest: (clinic) => `Step 1: Connect your Google Calendar so ${clinic} can manage bookings in real-time.\n\nReply with your Google Calendar ID (found in Settings > Integrations) or say "help" and I'll guide you.`,
        credentials: (user, pass) => `🔐 Your Dashboard Access\nUsername: ${user}\nPassword: ${pass}\n\nLogin: https://qudozen.com/dashboard\n\nChange your password after first login.`,
        leadGift: (count) => `🎁 Success Gift: I've found ${count} high-intent leads in your area. They're visible in your dashboard under "Growth Swarm".`,
        day1FollowUp: (clinic) => `Hi! Quick check — did you connect ${clinic}'s Google Calendar? Without it, the bot can't lock slots. Reply "done" when ready or "help" for assistance.`,
        day3CheckIn: (clinic) => `How is ${clinic} doing with the new system? Any bookings yet? If something feels off, reply here and I'll fix it.`,
        day7Review: () => `🎉 You've been live for a week!\n\nHow is everything working?\n\nReply:\n• *GOOD* — I'll send your Google review link\n• *HELP* — I'll troubleshoot any issue now\n• *CALL* — I'll send you a self-scheduling link\n• *UPGRADE* — I'll show you advanced features`,
        trialWelcome: (user, pass, clinic) => `🎉 Your 7-day free trial of ${clinic} OS is now LIVE!\n\n🔐 Dashboard Access:\nUsername: ${user}\nPassword: ${pass}\n\nLogin: https://qudozen.com/dashboard\n\nYour bot is active. Patients can message right now.\n\nAfter 7 days, subscribe to keep it running:\nhttps://qudozen.com/#pricing`,
        trialOffer: (clinic) => `No credit card needed! Start your 7-day free trial of ${clinic} OS now.\n\nReply *START TRIAL* and I'll activate everything instantly.`,
        calendarHelp: `To connect your calendar:\n1. Open Google Calendar on Desktop\n2. Go to Settings > Integrate Calendar\n3. Copy the "Calendar ID" (usually your email or a long string)\n4. Paste it here!`,
        setupComplete: (clinic) => `✅ Perfect! ${clinic} is now fully connected to your Google Calendar.\n\nI will now start locking appointments and handling your patients autonomously. 🚀`
      },
      ar: {
        welcome: (owner, clinic) => `أهلاً بك في Qudozen، د. ${owner}! 🎉\n\nنحن نجهز نظام ${clinic}. أحتاج دقيقتين لربط التقويم وإرسال لوحة التحكم.`,
        calendarRequest: (clinic) => `الخطوة 1: ربط Google Calendar حتى يتمكن ${clinic} من إدارة الحجوزات.\n\nأرسل معرف التقويم أو قل "مساعدة".`,
        credentials: (user, pass) => `🔐 بيانات الدخول\nالمستخدم: ${user}\nكلمة المرور: ${pass}\n\nالرابط: https://qudozen.com/dashboard\n\nيرجى تغيير كلمة المرور بعد أول دخول.`,
        leadGift: (count) => `🎁 هدية النجاح: وجدت ${count} عميل محتمل في منطقتك. تجدهم في لوحة التحكم.`,
        day1FollowUp: (clinic) => `تحقق سريع — هل ربطت تقويم ${clinic}؟ بدونه لا يستطيع البوت حجز المواعيد. رد "تم" أو "مساعدة".`,
        day3CheckIn: (clinic) => `كيف يعمل ${clinic} مع النظام الجديد؟ هل هناك حجوزات؟ إذا واجهتك مشكلة، رد هنا.`,
        day7Review: () => `🎉 مر أسبوع على التشغيل!\n\nكيف يعمل كل شيء؟\n\nرد بـ:\n• *جيد* — سأرسل لك رابط تقييم Google\n• *مساعدة* — سأحل أي مشكلة الآن\n• *مكالمة* — سأرسل لك رابط جدولة ذاتية\n• *ترقية* — سأريك الميزات المتقدمة`,
        trialWelcome: (user, pass, clinic) => `🎉 تجربتك المجانية لمدة 7 أيام من نظام ${clinic} أصبحت نشطة الآن!\n\n🔐 بيانات الدخول:\nالمستخدم: ${user}\nكلمة المرور: ${pass}\n\nالرابط: https://qudozen.com/dashboard\n\nبوتك نشط. المرضى يمكنهم المراسلة الآن.\n\nبعد 7 أيام، اشترك للاستمرار:\nhttps://qudozen.com/#pricing`,
        trialOffer: (clinic) => `لا حاجة لبطاقة ائتمان! ابدأ تجربتك المجانية لمدة 7 أيام لنظام ${clinic} الآن.\n\nرد بـ *ابدأ التجربة* وسأفعل كل شيء فوراً.`,
        calendarHelp: `لربط تقويمك:\n1. افتح تقويم Google من الكمبيوتر\n2. الإعدادات > دمج التقويم\n3. انسخ "معرف التقويم" (غالباً بريدك الإلكتروني)\n4. الصقه هنا!`,
        setupComplete: (clinic) => `✅ ممتاز! تم ربط ${clinic} بنجاح مع تقويم Google الخاص بك.\n\nسأبدأ الآن في حجز المواعيد وإدارة مرضاك بشكل آلي تماماً. 🚀`
      }

    };
    return msgs[lang] || msgs.en;
  }

  async logMessage(onboardingId, day, type, content) {
    await db.logOnboardingMessage(onboardingId, day, type, content);
  }

  async resumeSequence(existing) {
    // Acknowledge and optionally nudge to the next step
    const m = this.getMessages(existing.lang || 'en');
    const state = existing.current_state;
    console.log(`[Onboarding] Resuming ${existing.clinic_name} at state: ${state}`);
  }
  // ─── WEB CHAT: Called when trial is started from the website ───
  async startFromWebChat({ clinic_name, username, password, trial_id, lang, owner_phone }) {
    console.log(`[Onboarding] 🌐 Trial started from web chat for ${clinic_name}`);
    const m = this.getMessages(lang || 'en');

    // If we have a phone number, send the welcome credentials
    if (owner_phone) {
      await sendWhatsApp(owner_phone, m.trialWelcome(username, password, clinic_name));
    }
    
    // Log the event if onboarding record exists
    if (trial_id) {
      await this.logMessage(trial_id, 0, 'web_trial_start', `Trial activated for ${clinic_name} via web chat.`);
    }
  }
}

const machine = new OnboardingStateMachine();
module.exports = machine;
module.exports.ONBOARDING_STATES = ONBOARDING_STATES;

