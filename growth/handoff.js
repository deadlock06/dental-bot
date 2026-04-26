const { sendWhatsApp } = require('./lib/whatsappProvider');

const supabase = require('./lib/supabase');

const ESCALATION_TRIGGERS = [
  'opt_out', 'legal', 'ai_questioned', 'pricing', 'buying_signal', 'stalled', 'low_confidence'
];

const OBJECTIONS = {
  data_safety: {
    triggers: ['data safe', 'patient data', 'privacy', 'hipaa', 'secure', 'معلومات المرضى', 'خصوصية', 'آمن'],
    response_en: `All patient data is encrypted and stored in Saudi-hosted Supabase infrastructure. We do not share, sell, or train third-party models on your data. You can request full deletion at any time.`,
    response_ar: `جميع بيانات المرضى مشفرة ومخزنة على خوادم Supabase في السعودية. لا نشارك أو نبيع البيانات. يمكنك طلب الحذف الكامل في أي وقت.`,
    escalate: false
  },
  surgery_pause: {
    triggers: ['surgery', 'turn off', 'pause', 'during operation', 'عملية', 'أوقف', 'إيقاف'],
    response_en: `Yes. Send "PAUSE" anytime and the bot goes silent instantly. Send "RESUME" when you're ready. You have full control.`,
    response_ar: `نعم. أرسل "توقف" في أي وقت وسيصمت البوت فوراً. أرسل "استئناف" عندما تكون جاهزاً. التحكم الكامل بيدك.`,
    escalate: false
  },
  wrong_procedure: {
    triggers: ['wrong booking', 'wrong procedure', 'mistake', 'خطأ', 'حجز خاطئ'],
    response_en: `The bot confirms every detail before locking the slot. Patients can also reschedule or cancel via WhatsApp without calling your clinic.`,
    response_ar: `البوت يؤكد كل تفصيل قبل تأكيد الحجز. ويمكن للمرضى إعادة الجدولة أو الإلغاء عبر الواتساب دون الاتصال.`,
    escalate: false
  },
  have_receptionist: {
    triggers: ['already have', 'receptionist', 'secretary', 'موظفة', 'استقبال', 'عندي موظفة'],
    response_en: `This handles the overflow — nights, weekends, and busy hours when your receptionist is overwhelmed or off-duty. Your staff focuses on in-clinic patients.`,
    response_ar: `هذا النظام يغطي الفترات المزدحمة والليل والعطلات عندما تكون موظفة الاستقبال مشغولة أو خارج الدوام. فريقك يركز على المرضى داخل العيادة.`,
    escalate: false
  },
  too_expensive: {
    triggers: ['expensive', 'cost too much', 'price high', 'غالي', 'سعر', 'تكلفة'],
    response_en: `Most clinics recover the monthly cost within the first 2-3 bookings the bot captures after hours. Would you like to see a 7-day free trial first?`,
    response_ar: `معظم العيادات تسترجع التكلفة الشهرية من أول حجزين أو ثلاثة يتمكن البوت من استلامهم بعد الدوام. هل تريد تجربة مجانية لمدة 7 أيام أولاً؟`,
    escalate: true
  }
};

function detectObjection(message) {
  const lower = message.toLowerCase();
  for (const [key, obj] of Object.entries(OBJECTIONS)) {
    if (obj.triggers.some(t => lower.includes(t.toLowerCase()))) {
      return { type: key, ...obj };
    }
  }
  return null;
}

async function checkEscalationTriggers(lead, messageText, intent) {
  const lowerMsg = messageText.toLowerCase();
  
  if (intent === 'OPT_OUT') return 'opt_out';
  if (lowerMsg.includes('sue') || lowerMsg.includes('lawyer') || lowerMsg.includes('legal')) return 'legal';
  if (lowerMsg.includes('are you a bot') || lowerMsg.includes('ai')) return 'ai_questioned';
  if (lowerMsg.includes('how much') || lowerMsg.includes('price')) return 'pricing';
  if (intent === 'HANDED_OFF') return 'buying_signal';
  if (lead.qualification_step && lead.qualification_step > 5) return 'stalled';
  
  return null;
}

async function handoffLead(lead, triggerMessage, reason = 'buying_signal') {
  try {
    console.log(`[handoff] 🤝 Initiating handoff for ${lead.phone} (Reason: ${reason})`);

    const adminPhone = process.env.ADMIN_PHONE || '+966570733834';

    // Formatting alert specifically to the requested format
    const adminMsg = `🚨 *Qudozen Escalation Alert* 🚨\n\n` +
      `🏢 Clinic: ${lead.company_name || 'Unknown'}\n` +
      `📱 Phone: ${lead.phone}\n` +
      `🔥 Reason: ${reason.toUpperCase()}\n` +
      `💬 Last Msg: "${triggerMessage}"\n` +
      `📊 Score: ${lead.total_score || 0}/100\n\n` +
      `Action required immediately.`;

    await sendWhatsApp(adminPhone, adminMsg);

    // Create a 'patient' record to allow the lead to interact with the Qudozen demo bot
    const { error: patientError } = await supabase.from('patients').upsert({
      phone: lead.phone,
      language: lead.language || 'ar',
      current_flow: 'start',
      flow_step: 0,
      flow_data: { source: 'growth_swarm_handoff', reason }
    }, { onConflict: 'phone' });

    if (patientError) {
      console.error('[handoff] ❌ Failed to create patient record:', patientError.message);
    }

    const lang = lead.language || 'ar';
    let transitionMsg = "";

    if (reason === 'opt_out') {
      transitionMsg = lang === 'ar' ? "تم إزالة رقمك بنجاح. عذراً على الإزعاج." : "You've been successfully removed. Apologies for the interruption.";
    } else {
      transitionMsg = lang === 'ar'
        ? `لقد أبلغت فريقي وسيتواصلون معك قريباً. 📞\n\nفي هذه الأثناء، يمكنك تجربة روبوت خدمة العملاء الخاص بنا الآن. فقط أرسل *"مرحبا"* للبدء!`
        : `I've alerted the team and they'll reach out shortly. 📞\n\nIn the meantime, you can test out our AI Receptionist right now. Just reply *"Hello"* to start!`;
    }

    await sendWhatsApp(lead.phone, transitionMsg);
    
    const newState = reason === 'opt_out' ? 'opted_out' : 'handed_off';
    await supabase.from('gs_leads').update({ status: newState, conversation_state: 'ESCALATED' }).eq('id', lead.id);

    // Explicitly log the lifecycle event
    await supabase.from('gs_events').insert({
      lead_id: lead.id,
      event_type: 'HANDOFF',
      old_state: lead.status,
      new_state: newState,
      metadata: { reason, triggered_by: triggerMessage }
    });

    console.log(`[handoff] ✅ Handoff complete for ${lead.phone}`);
    return { success: true };

  } catch (err) {
    console.error('[handoff] ❌ Handoff failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  handoffLead,
  checkEscalationTriggers,
  detectObjection
};
