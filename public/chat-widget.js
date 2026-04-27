// public/chat-widget.js — Qudozen Embedded Chat
// Self-contained, no external dependencies

(function() {
  'use strict';

  class QudozenChat {\n    getLang() { return sessionStorage.getItem('qd_lang') || 'en'; }
    constructor() {\n      this.sessionId = this.generateId();
      this.sessionId = this.generateId();
      this.clinic = new URLSearchParams(window.location.search).get('clinic') || 'Your Clinic';
      this.owner = new URLSearchParams(window.location.search).get('owner') || 'there';
      
      this.started = false;
      this.build();
    }

    build() {
      const container = document.createElement('div');
      container.id = 'qd-chat-root';
      container.innerHTML = `
        <div id="qd-chat-window" class="qd-hidden">
          <div id="qd-chat-header">
            <div class="qd-header-info">
              <div class="qd-status-dot"></div>
              <span>Qudozen Assistant</span>
            </div>
            <button id="qd-close" aria-label="Close chat">×</button>
          </div>
          <div id="qd-chat-messages"></div>
          <div id="qd-chat-input-area">
            <input type="text" id="qd-input" autocomplete="off" />
            <button id="qd-send" aria-label="Send message">→</button>
          </div>
        </div>
        <button id="qd-chat-toggle" aria-label="Open chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      `;
      document.body.appendChild(container);
      this.attachEvents();
      this.injectStyles();
    }

    attachEvents() {
      const toggle = document.getElementById('qd-chat-toggle');
      const close = document.getElementById('qd-close');
      const send = document.getElementById('qd-send');
      const input = document.getElementById('qd-input');

      toggle.addEventListener('click', () => this.toggle());
      close.addEventListener('click', () => this.toggle());
      send.addEventListener('click', () => this.send());
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.send();
      });
    }

    toggle() {
      const win = document.getElementById('qd-chat-window');
      win.classList.toggle('qd-hidden');
      if (!win.classList.contains('qd-hidden') && !this.started) {
        this.start();
      }
    }

    open(action = null) {
      const win = document.getElementById('qd-chat-window');
      if (!win) return;
      if (win.classList.contains('qd-hidden')) {
        this.toggle();
      }
      if (action) {
        this.handleAction(action);
      }
    }

    async start() {
      this.started = true;
      const greetings = {
        en: `Hi ${this.owner}! I see you're exploring Qudozen for ${this.clinic}. I can activate your AI receptionist right now — no calls, no waiting. Want a 30-second demo first?`,
        ar: `أهلاً ${this.owner}! أرى أنك تستكشف Qudozen لـ ${this.clinic}. يمكنني تفعيل استقبالك الذكي الآن — بدون مكالمات أو انتظار. هل تريد عرضاً لمدة 30 ثانية أولاً؟`
      };
      this.addMessage('bot', greetings[this.getLang()] || greetings.en);
      this.addButtons([
        { text: this.getLang() === 'ar' ? 'نعم، أرني العرض' : 'Yes, show me', action: 'demo' },
        { text: this.getLang() === 'ar' ? 'فعل النظام مباشرة' : 'Activate now', action: 'activate' }
      ]);
    }

    async handleAction(action) {
      if (action === 'demo') await this.runDemo();
      else if (action === 'activate' || action === 'trial') await this.activateTrial();
      else if (action === 'pricing') this.showPricing();
      else if (action === 'dashboard') this.showCredentials();
      else if (action === 'support') this.showSupport();
    }

    showSupport() {
      const msg = {
        en: "I've notified our priority support team. Someone will reach out to you within 15 minutes. In the meantime, how can I help you?",
        ar: "لقد أخطرت فريق الدعم ذو الأولوية. سيتواصل معك أحد أعضاء الفريق خلال 15 دقيقة. في هذه الأثناء، كيف يمكنني مساعدتك؟"
      };
      this.addMessage('bot', msg[this.getLang()] || msg.en);
    }

    async jakeIntercept() {
      if (!this.started) {
        this.started = true;
      }
      const win = document.getElementById('qd-chat-window');
      if (win.classList.contains('qd-hidden')) {
        this.toggle();
      }
      
      const intercept = {
        en: "I noticed you just finished the simulation! Your clinic could be capturing these bookings right now. Ready to go live?",
        ar: "لاحظت أنك انتهيت للتو من العرض التوضيحي! يمكن لعيادتك استقبال هذه المواعيد وتوليد الأرباح الآن. هل أنت جاهز للبدء؟"
      };
      
      await this.delay(1000);
      this.addMessage('bot', intercept[this.getLang()] || intercept.en);
      this.addButtons([
        { text: this.getLang() === 'ar' ? 'نعم، لنفعلها' : 'Yes, let\'s go', action: 'trial' },
        { text: this.getLang() === 'ar' ? 'الأسعار' : 'Pricing', action: 'pricing' }
      ]);
    }

    async runDemo() {
      const demo = {
        en: [
          "Great! Let's simulate a patient booking at 2 AM...",
          "🧑 Patient: Hi, I need a dental cleaning",
          "🤖 Bot: Welcome! I'm your AI receptionist. Could you share your name?",
          "🧑 Patient: Ahmed",
          "🤖 Bot: Thanks Ahmed! Dr. Khalid is available tomorrow at 10 AM or 2 PM. Which works?",
          "🧑 Patient: 10 AM",
          "🤖 Bot: ✅ Confirmed! Ahmed, your cleaning is booked for tomorrow 10 AM with Dr. Khalid. You'll receive a reminder 24 hours before.",
          "That entire conversation took 8 seconds. No human was awake. The clinic captured 150 SAR while sleeping."
        ],
        ar: [
          "ممتاز! لنحاكي حجز مريض في الساعة 2 صباحاً...",
          "🧑 المريض: مرحباً، أحتاج تنظيف أسنان",
          "🤖 البوت: أهلاً بك! أنا مساعدة الاستقبال الذكية. هل يمكنك مشاركة اسمك؟",
          "🧑 المريض: أحمد",
          "🤖 البوت: شكراً أحمد! د. خالد متوفر غداً الساعة 10 صباحاً أو 2 ظهراً. ما الوقت المناسب لك؟",
          "🧑 المريض: 10 صباحاً",
          "🤖 البوت: ✅ تم التأكيد! أحمد، حجزت لك موعد تنظيف غداً الساعة 10 صباحاً مع د. خالد. ستتلقى تذكيراً قبل 24 ساعة.",
          "استغرق هذا الحوار 8 ثوانٍ. لم يكن أحد مستيقظاً. العيادة حصلت على 150 ريال وهي نائمة."
        ]
      };

      const flow = demo[this.getLang()] || demo.en;
      for (let i = 0; i < flow.length; i++) {
        await this.delay(1500);
        this.addMessage('bot', flow[i]);
      }

      this.addButtons([
        { text: this.getLang() === 'ar' ? 'كم السعر؟' : 'How much?', action: 'pricing' },
        { text: this.getLang() === 'ar' ? 'ابدأ التجربة المجانية' : 'Start free trial', action: 'trial' }
      ]);
    }

    showPricing() {
      const pricing = {
        en: "💳 Qudozen Pricing:\n\n• Awareness (Solo clinic): 299 SAR/month\n• System (Multi-doctor): 499 SAR/month + 699 SAR setup\n• Swarm (Enterprise): Custom\n\nAll plans include 24/7 AI reception, automated reminders, and dashboard access.",
        ar: "💳 أسعار Qudozen:\n\n• وعي (عيادة فردية): 299 ريال/شهر\n• نظام (متعدد الأطباء): 499 ريال/شهر + 699 ريال إعداد\n• سرب (مؤسسي): حسب الطلب\n\nجميع الباقات تشمل استقبال ذكي 24/7، تذكيرات تلقائية، ولوحة تحكم."
      };
      this.addMessage('bot', pricing[this.getLang()] || pricing.en);
      this.addButtons([
        { text: this.getLang() === 'ar' ? 'ابدأ التجربة المجانية' : 'Start 7-day free trial', action: 'trial' }
      ]);
    }

    async activateTrial() {
      this.addMessage('bot', this.getLang() === 'ar' ? '⏳ جاري تفعيل تجربتك...' : '⏳ Activating your trial...');
      
      try {
        const response = await fetch('/api/start-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_name: this.clinic,
            session_id: this.sessionId,
            lang: this.getLang()
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          this.addMessage('bot', this.getLang() === 'ar' 
            ? `✅ تم التفعيل!\n\n🔑 بيانات الدخول:\nالمستخدم: ${data.username}\nكلمة المرور: ${data.password}\n\n📊 لوحة التحكم: ${data.dashboard_url}\n\nسأرسل تفاصيل إضافية خلال دقيقتين.`
            : `✅ Activated!\n\n🔑 Your login:\nUsername: ${data.username}\nPassword: ${data.password}\n\n📊 Dashboard: ${data.dashboard_url}\n\nI'll send additional details in 2 minutes.`
          );
          this.addButtons([
            { text: this.getLang() === 'ar' ? 'فتح لوحة التحكم' : 'Open Dashboard', action: 'dashboard' }
          ]);
        } else {
          throw new Error(data.error);
        }
      } catch (e) {
        this.addMessage('bot', this.getLang() === 'ar' 
          ? '❌ حدث خطأ. يرجى المحاولة مرة أخرى أو كتابة "مساعدة".' 
          : '❌ Something went wrong. Please try again or type "help".'
        );
      }
    }

    showCredentials() {
      window.open('https://qudozen.com/dashboard', '_blank');
    }

    async startActivation() {
      this.addMessage('bot', this.getLang() === 'ar' 
        ? 'يمكنني تفعيل نظامك فوراً. هل تريد البدء بالتجربة المجانية لمدة 7 أيام؟' 
        : 'I can activate your system instantly. Would you like to start with a 7-day free trial?'
      );
      this.addButtons([
        { text: this.getLang() === 'ar' ? 'نعم، ابدأ التجربة' : 'Yes, start trial', action: 'trial' },
        { text: this.getLang() === 'ar' ? 'أريد معرفة الأسعار أولاً' : 'Show me pricing first', action: 'pricing' }
      ]);
    }

    async send() {
      const input = document.getElementById('qd-input');
      const text = input.value.trim();
      if (!text) return;
      
      this.addMessage('user', text);
      input.value = '';
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            session_id: this.sessionId,
            clinic: this.clinic,
            lang: this.getLang()
          })
        });
        
        const data = await response.json();
        this.addMessage('bot', data.reply);
        if (data.buttons) this.addButtons(data.buttons);
      } catch (e) {
        this.addMessage('bot', this.getLang() === 'ar' 
          ? '⚠️ خطأ في الاتصال. حاول مرة أخرى.' 
          : '⚠️ Connection error. Please try again.'
        );
      }
    }

    addMessage(sender, text) {
      const msgs = document.getElementById('qd-chat-messages');
      const div = document.createElement('div');
      div.className = \`qd-msg qd-\${sender}\`;
      div.textContent = text;
      msgs.appendChild(div);
      this.scrollToBottom();
    }

    addButtons(buttons) {
      const msgs = document.getElementById('qd-chat-messages');
      const div = document.createElement('div');
      div.className = 'qd-buttons';
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.textContent = b.text;
        btn.addEventListener('click', () => this.handleAction(b.action));
        div.appendChild(btn);
      });
      msgs.appendChild(div);
      this.scrollToBottom();
    }

    scrollToBottom() {
      const msgs = document.getElementById('qd-chat-messages');
      msgs.scrollTop = msgs.scrollHeight;
    }

    delay(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    generateId() {
      return 'qd_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = \`
        #qd-chat-root { position: fixed; bottom: 24px; right: 24px; z-index: 9999; font-family: 'Space Grotesk', -apple-system, sans-serif; }
        #qd-chat-window { width: 400px; height: 650px; background: #0F172A; border: 1px solid rgba(148,163,184,0.1); border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); transition: transform 0.3s, opacity 0.3s; }
        #qd-chat-window.qd-hidden { transform: scale(0.95) translateY(20px); opacity: 0; pointer-events: none; }
        #qd-chat-header { background: #0B1120; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(148,163,184,0.08); }
        .qd-header-info { display: flex; align-items: center; gap: 10px; }
        .qd-status-dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; animation: qd-pulse 2s infinite; }
        @keyframes qd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        #qd-chat-header span { color: #F8FAFC; font-weight: 600; font-size: 15px; }
        #qd-close { background: none; border: none; color: #94A3B8; font-size: 24px; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: background 0.2s; }
        #qd-close:hover { background: rgba(148,163,184,0.1); color: #F8FAFC; }
        #qd-chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .qd-msg { padding: 14px 18px; border-radius: 16px; max-width: 85%; line-height: 1.6; font-size: 14px; white-space: pre-wrap; }
        .qd-bot { background: rgba(13,148,136,0.08); color: #F8FAFC; align-self: flex-start; border: 1px solid rgba(13,148,136,0.15); border-bottom-left-radius: 4px; }
        .qd-user { background: #0D9488; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
        .qd-buttons { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 20px; }
        .qd-buttons button { background: rgba(13,148,136,0.12); color: #5EEAD4; border: 1px solid rgba(13,148,136,0.25); padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .qd-buttons button:hover { background: rgba(13,148,136,0.2); border-color: #5EEAD4; transform: translateY(-1px); }
        #qd-chat-input-area { display: flex; padding: 16px 20px; border-top: 1px solid rgba(148,163,184,0.08); gap: 10px; }
        #qd-input { flex: 1; background: #0B1120; border: 1px solid rgba(148,163,184,0.15); border-radius: 12px; padding: 12px 16px; color: #F8FAFC; font-size: 14px; outline: none; transition: border-color 0.2s; }
        #qd-input:focus { border-color: rgba(13,148,136,0.4); }
        #qd-input::placeholder { color: #64748B; }
        #qd-send { background: #0D9488; color: white; border: none; border-radius: 12px; padding: 12px 20px; cursor: pointer; font-weight: 600; font-size: 16px; transition: background 0.2s, transform 0.1s; }
        #qd-send:hover { background: #0F766E; }
        #qd-send:active { transform: scale(0.95); }
        #qd-chat-toggle { width: 60px; height: 60px; border-radius: 50%; background: #0D9488; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 30px rgba(13,148,136,0.3); transition: transform 0.2s, box-shadow 0.2s; }
        #qd-chat-toggle:hover { transform: scale(1.08); box-shadow: 0 12px 40px rgba(13,148,136,0.4); }
        #qd-chat-toggle svg { width: 28px; height: 28px; }
        @media (max-width: 480px) { #qd-chat-root { bottom: 16px; right: 16px; left: 16px; } #qd-chat-window { width: 100%; height: calc(100vh - 100px); border-radius: 16px; } }
      \`;
      document.head.appendChild(style);
    }
  }

  // Expose globally
  window.QudozenChat = QudozenChat;
  window.qdChat = new QudozenChat();
})();
