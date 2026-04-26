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

  // ─── ENTRY POINT: Called when bot detects "Activate my trial" ───
  async handleActivation(phone, message, context) {
    const lower = message.toLowerCase();
    
    // Intent detection
    const activationKeywords = [
      'activate', 'activation', 'تفعيل', 'فعل', 'ابدأ', 'start trial',
      'جرب', 'تجربة', 'اشتراك', 'subscribe', 'احجز النظام'
    ];
    
    const isActivation = activationKeywords.some(k => lower.includes(k));
    if (!isActivation) return { handled: false };

    // Check if already onboarding
    const existing = await db.getOnboardingByPhone(phone);
    if (existing) {
      await this.resumeSequence(existing);
      return { handled: true };
    }

    // Extract clinic name from context or personalization
    const clinicName = context.clinic || 'Your Clinic';
    const ownerName = context.owner || 'Doctor';
    const lang = context.lang || 'ar';

    // Create onboarding record
    const onboarding = await db.createOnboarding({
      clinic_name: clinicName,
      owner_name: ownerName,
      owner_phone: phone,
      current_state: this.states.ACTIVATION_REQUESTED,
      lang
    });

    // Trigger Day 0 sequence immediately
    await this.runDay0(onboarding);
    
    return { handled: true, onboarding_id: onboarding.id };
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
    const password = generatePassword(12); // 12-char random
    
    await db.updateOnboarding(onboarding.id, {
      dashboard_username: username,
      dashboard_password: password
    });

    // 4. Send credentials (delayed 2 minutes so they don't feel spammed)
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
    
    // Schedule Day 3
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
    
    // Schedule Day 7
    await this.scheduleCron(onboarding.id, 7, 'review');
  }

  // ─── DAY 7: Human review call ───
  async runDay7(onboarding) {
    const m = this.getMessages(onboarding.lang);
    
    // Notify Jake
    await this.notifyJake(onboarding);
    
    await sendWhatsApp(onboarding.owner_phone, m.day7Review());
    await this.logMessage(onboarding.id, 7, 'review_call', m.day7Review());
    
    await db.updateOnboarding(onboarding.id, { 
      current_state: this.states.REVIEW_DAY7,
      jake_notified: true
    });
  }

  // ─── GROWTH SWARM: Gift 5 leads ───
  async giftLeads(clinicName, phone, count) {
    // Find leads similar to the client's industry/area
    // For now, return 5 high-confidence leads from the database
    const leads = await db.getRandomHotLeads(count);
    
    return leads || [];
  }

  // ─── NOTIFY JAKE ───
  async notifyJake(onboarding) {
    const adminPhone = process.env.ADMIN_PHONE;
    if (!adminPhone) return;
    const msg = `🔔 ONBOARDING REVIEW NEEDED\nClinic: ${onboarding.clinic_name}\nOwner: ${onboarding.owner_name}\nPhone: ${onboarding.owner_phone}\nStatus: Day 7\nDashboard: ${onboarding.dashboard_username}\nLeads gifted: ${onboarding.leads_gifted}`;
    await sendWhatsApp(adminPhone, msg);
  }

  // ─── CRON SCHEDULER ───
  async scheduleCron(onboardingId, day, type) {
    // This will be picked up by cron/jobs/onboarding.js
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
        day7Review: () => `You've been live for a week! I'd love to schedule a 10-minute call to review your results and optimize the setup. When works best for you this week?`
      },
      ar: {
        welcome: (owner, clinic) => `أهلاً بك في Qudozen، د. ${owner}! 🎉\n\nنحن نجهز نظام ${clinic}. أحتاج دقيقتين لربط التقويم وإرسال لوحة التحكم.`,
        calendarRequest: (clinic) => `الخطوة 1: ربط Google Calendar حتى يتمكن ${clinic} من إدارة الحجوزات.\n\nأرسل معرف التقويم أو قل "مساعدة".`,
        credentials: (user, pass) => `🔐 بيانات الدخول\nالمستخدم: ${user}\nكلمة المرور: ${pass}\n\nالرابط: https://qudozen.com/dashboard\n\nيرجى تغيير كلمة المرور بعد أول دخول.`,
        leadGift: (count) => `🎁 هدية النجاح: وجدت ${count} عميل محتمل في منطقتك. تجدهم في لوحة التحكم.`,
        day1FollowUp: (clinic) => `تحقق سريع — هل ربطت تقويم ${clinic}؟ بدونه لا يستطيع البوت حجز المواعيد. رد "تم" أو "مساعدة".`,
        day3CheckIn: (clinic) => `كيف يعمل ${clinic} مع النظام الجديد؟ هل هناك حجوزات؟ إذا واجهتك مشكلة، رد هنا.`,
        day7Review: () => `مر أسبوع على التشغيل! أود تحديد مكالمة 10 دقائق لمراجعة النتائج. متى يناسبك هذا الأسبوع؟`
      }
    };
    return msgs[lang] || msgs.en;
  }

  async logMessage(onboardingId, day, type, content) {
    await db.logOnboardingMessage(onboardingId, day, type, content);
  }

  async resumeSequence(existing) {
    // For now, simple acknowledge. Logic to handle pending states can be added.
    return;
  }
}

module.exports = new OnboardingStateMachine();
