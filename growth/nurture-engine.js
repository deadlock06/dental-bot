const { createClient } = require('@supabase/supabase-js');
const { sendWhatsApp } = require('./lib/whatsappProvider');
const { applyGuardrails } = require('./brain');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const NURTURE_SEQUENCES = {
  warm: [
    { day: 3, msg: { en: "Checking in. Still looking to plug those leaks?", ar: "أهلاً مجدداً. هل ما زلت تفكر في إيقاف تسرب المرضى؟" } },
    { day: 7, msg: { en: "Most clinics wait until they lose a big patient. Don't be them.", ar: "معظم العيادات تنتظر حتى تخسر مريضاً مهماً لتبدأ. لا تكن مثلهم." } },
    { day: 14, msg: { en: "Quick question: how many messages did you miss this weekend?", ar: "سؤال سريع: كم رسالة فقدتها هذه العطلة؟" } },
    { day: 21, msg: { en: "If timing is off, let me know. Otherwise, let's fix your front desk.", ar: "إذا كان الوقت غير مناسب، أخبرني. وإلا، دعنا نصلح مشكلة الاستقبال." } },
    { day: 30, msg: { en: "Last message. If things change, I'm here.", ar: "آخر رسالة مني. إذا تغيرت الأمور، أنا موجود." } }
  ],
  cold: [
    { day: 3, msg: { en: "Did you catch my last message about missed WhatsApp inquiries?", ar: "هل رأيت رسالتي السابقة حول استفسارات الواتساب الضائعة؟" } },
    { day: 7, msg: { en: "Just a quick follow up. Are you still actively hiring receptionists?", ar: "متابعة سريعة. هل ما زلتم توظفون موظفي استقبال؟" } },
    { day: 14, msg: { en: "Competitors are automating. You're losing ground. Open to a chat?", ar: "المنافسون يعتمدون على الأتمتة. أنت تتراجع. هل نتحدث؟" } },
    { day: 30, msg: { en: "I'll close your file for now. Reach out when you're ready to grow.", ar: "سأغلق ملفك الآن. تواصل معي عندما تكون مستعداً للنمو." } }
  ]
};

async function processNurtureQueue() {
  console.log('[nurture-engine] Processing nurture queue...');
  // Core logic to query gs_sequences and trigger sequence steps based on days
}

async function triggerIntentReengagement(lead, triggerType) {
  let msgTemplate = '';
  switch (triggerType) {
    case 'ghost_room_visit':
      msgTemplate = lead.language === 'ar' ? "رأيت أنك قمت بزيارة غرفة المحاكاة! هل لديك أي أسئلة حول ما رأيته؟" : "Saw you checked out the Ghost Room! Any questions on what you saw?";
      break;
    case 'new_job':
      msgTemplate = lead.language === 'ar' ? "رأيت إعلاناً جديداً للتوظيف لديكم. يبدو أنكم تتوسعون! أتمتة الاستقبال ستوفر عليكم الكثير." : "Saw your new job posting. Looks like you're expanding! Automating your front desk will save a lot.";
      break;
    case 'new_review':
      msgTemplate = lead.language === 'ar' ? "لاحظت تقييماً جديداً حول تأخر الرد. هل نرتب موعداً لنحل هذا نهائياً؟" : "Noticed a new review mentioning wait times. Shall we fix this permanently?";
      break;
  }
  
  if (msgTemplate) {
    const finalMsg = applyGuardrails(msgTemplate);
    const sent = await sendWhatsApp(lead.phone, finalMsg);
    if (sent.success) {
      await supabase.from('gs_conversations').insert({
        lead_id: lead.id,
        channel: 'whatsapp',
        direction: 'outbound',
        message_text: finalMsg,
        status: 'sent',
        ai_generated: true,
        sent_at: new Date().toISOString()
      });
      await supabase.from('gs_leads').update({ conversation_state: 'NURTURING' }).eq('id', lead.id);
    }
  }
}

module.exports = { NURTURE_SEQUENCES, processNurtureQueue, triggerIntentReengagement };
