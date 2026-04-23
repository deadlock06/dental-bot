const { detectLanguage, applyGuardrails } = require('./brain');

const OBJECTIONS = {
  too_expensive: {
    keywords: ['expensive', 'cost', 'price', 'too much', 'budget', 'غالي', 'مكلف', 'سعر', 'فلوس'],
    template_en: "It actually costs less than a receptionist and works 24/7. Even if it saves just 2 missed patients a month, it pays for itself. Make sense?",
    template_ar: "في الواقع هو أقل تكلفة من موظف استقبال ويعمل 24 ساعة. لو أنقذ مريضين فقط شهرياً، فإنه يغطي تكلفته. هل هذا منطقي؟"
  },
  not_interested: {
    keywords: ['not interested', 'stop', 'no thanks', 'remove me', 'لا شكرا', 'غير مهتم', 'لا أريد'],
    template_en: "Understood. I'll take you off the list. If you ever want to automate your front desk, you know where to find me.",
    template_ar: "مفهوم. سأزيل رقمك من القائمة. إذا احتجت لأتمتة استقبالك في المستقبل، نحن هنا."
  },
  already_have: {
    keywords: ['already have', 'using', 'we have', 'لدينا', 'نستخدم', 'موجود'],
    template_en: "That's great you're ahead of the curve. Are you getting 100% immediate response times even at 2 AM?",
    template_ar: "ممتاز جداً. هل يضمن لك نظامك الحالي الرد الفوري بنسبة 100% حتى الساعة 2 صباحاً؟"
  },
  send_info: {
    keywords: ['send info', 'details', 'email', 'more info', 'تفاصيل', 'معلومات', 'ارسل'],
    template_en: "I'd love to, but every clinic is different. Are you currently missing more than 5 inquiries a week?",
    template_ar: "يسعدني ذلك، لكن كل عيادة تختلف. هل تفقد حالياً أكثر من 5 استفسارات أسبوعياً؟"
  },
  not_now: {
    keywords: ['not now', 'busy', 'later', 'next month', 'مشغول', 'ليس الان', 'بعدين', 'لاحقا'],
    template_en: "No problem. Timing is everything. Should I reach out next month, or is this completely off the table?",
    template_ar: "لا مشكلة، الوقت مهم. هل أعود للتواصل معك الشهر القادم أم أن الفكرة غير مطروحة تماماً؟"
  },
  call_me: {
    keywords: ['call me', 'phone', 'discuss', 'اتصل', 'مكالمة', 'هاتف'],
    template_en: "I can definitely arrange a call with our team. Are you the main decision-maker for the clinic?",
    template_ar: "بالتأكيد يمكنني ترتيب مكالمة مع فريقنا. هل أنت صانع القرار الرئيسي للعيادة؟"
  }
};

const QUALIFICATION_QUESTIONS = [
  { id: 'Q1', en: "How do you handle WhatsApp messages when the clinic is closed?", ar: "كيف تتعاملون مع رسائل الواتساب عندما تكون العيادة مغلقة؟" },
  { id: 'Q2', en: "Roughly how many inquiries do you think slip through the cracks each week?", ar: "كم عدد الاستفسارات التي تضيع منكم أسبوعياً تقريباً؟" },
  { id: 'Q3', en: "Is fixing this a priority for you this month, or something for later?", ar: "هل حل هذه المشكلة أولوية لكم هذا الشهر، أم لاحقاً؟" },
  { id: 'Q4', en: "Would you be the main person making the decision on a system like this?", ar: "هل أنت الشخص المسؤول عن اتخاذ القرار بشأن هذا النظام؟" },
  { id: 'Q5', en: "Do you have a budget allocated for improving patient acquisition?", ar: "هل لديكم ميزانية مخصصة لتحسين اكتساب المرضى الجدد؟" }
];

function detectObjection(messageText) {
  const lowerMsg = messageText.toLowerCase();
  for (const [key, obj] of Object.entries(OBJECTIONS)) {
    if (obj.keywords.some(kw => lowerMsg.includes(kw))) {
      return key;
    }
  }
  return null;
}

function getObjectionResponse(lead, objectionKey) {
  const lang = detectLanguage(lead);
  const obj = OBJECTIONS[objectionKey];
  if (!obj) return null;
  const msg = lang === 'ar' ? obj.template_ar : obj.template_en;
  return applyGuardrails(`${msg}\n\n`);
}

function getNextQualificationQuestion(lead, currentStepIndex = 0) {
  const lang = detectLanguage(lead);
  if (currentStepIndex >= QUALIFICATION_QUESTIONS.length) {
    return null;
  }
  const q = QUALIFICATION_QUESTIONS[currentStepIndex];
  const msg = lang === 'ar' ? q.ar : q.en;
  return applyGuardrails(`${msg}\n\n`);
}

module.exports = {
  OBJECTIONS,
  QUALIFICATION_QUESTIONS,
  detectObjection,
  getObjectionResponse,
  getNextQualificationQuestion
};
