// public/chat-widget.js — Qudozen Embedded Chat
// Self-contained, no external dependencies

(function() {
  'use strict';

  class QudozenChat {
    getLang() { return sessionStorage.getItem('qd_lang') || 'en'; }
    
    constructor() {
      this.sessionId = this.generateId();
      this.clinic = new URLSearchParams(window.location.search).get('clinic') || 'Your Clinic';
      this.owner = new URLSearchParams(window.location.search).get('owner') || 'there';
      
      this.started = false;
      this.logEvent('widget_initialized');
      this.build();
    }

    async logEvent(event, metadata = {}) {
      try {
        await fetch('/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, session_id: this.sessionId, metadata })
        });
      } catch (e) {}
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
      const isOpening = win.classList.contains('qd-hidden');
      win.classList.toggle('qd-hidden');
      if (isOpening) {
        this.logEvent('widget_opened');
        if (!this.started) this.start();
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
      this.addMessage('bot', this.getLang() === 'ar' 
        ? 'يرجى تزويدي برقم هاتفك وسيقوم فريقنا بالتواصل معك فوراً.' 
        : 'Please provide your phone number and our team will contact you immediately.'
      );
    }

    showPricing() {
      const msg = this.getLang() === 'ar'
        ? '💰 أسعار Qudozen:\n\n• وعي (فردي): 299 ريال/شهر\n• نظام (متعدد): 499 ريال/شهر + 699 إعداد\n• سرب: حسب الطلب\n\nجميع الباقات تشمل استقبال 24/7 ولوحة تحكم.'
        : '💰 Qudozen Pricing:\n\n• Awareness (Solo): 299 SAR/month\n• System (Multi-doctor): 499 SAR/month + 699 SAR setup\n• Swarm (Enterprise): Custom\n\nAll plans include 24/7 reception and dashboard.';
      this.addMessage('bot', msg);
    }

    async activateTrial() {
      this.logEvent('trial_clicked');
      this.addMessage('bot', this.getLang() === 'ar' ? 'جاري تفعيل نظامك... لحظة واحدة 🚀' : 'Activating your system... one moment 🚀');

      try {
        const res = await fetch('/api/start-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clinic_name: this.clinic, 
            session_id: this.sessionId,
            lang: this.getLang()
          })
        });
        const data = await res.json();
        if (data.success) {
          this.addMessage('bot', this.getLang() === 'ar' 
            ? `✅ تم تفعيل نظامك بنجاح!\n\n• اسم المستخدم: ${data.username}\n• كلمة المرور: ${data.password}\n\nيمكنك الآن الدخول إلى لوحة التحكم الخاصة بك.` 
            : `✅ System activated successfully!\n\n• Username: ${data.username}\n• Password: ${data.password}\n\nYou can now log in to your dashboard.`
          );
          this.addButtons([{ text: this.getLang() === 'ar' ? 'اذهب للوحة التحكم' : 'Go to Dashboard', action: 'dashboard' }]);
        }
      } catch (e) {
        this.addMessage('bot', 'Error activating system. Please try again.');
      }
    }

    showCredentials() {
      window.location.href = '/dashboard';
    }

    async runDemo() {
      this.logEvent('demo_started');
      this.addMessage('bot', this.getLang() === 'ar' ? 'رائع! سأقوم بمحاكاة حجز موعد الآن...' : 'Great! I will simulate a booking now...');

      await this.delay(1500);
      this.addMessage('bot', this.getLang() === 'ar' ? 'موظف الاستقبال: أهلاً بك! كيف يمكنني مساعدتك؟' : 'Receptionist: Welcome! How can I help you?');
      await this.delay(1000);
      this.addMessage('user', this.getLang() === 'ar' ? 'أريد حجز موعد تنظيف' : 'I want to book a cleaning');
      await this.delay(1000);
      this.addMessage('bot', this.getLang() === 'ar' ? 'موظف الاستقبال: بالتأكيد. متى تفضل الموعد؟' : 'Receptionist: Sure. When would you like it?');
      await this.delay(1000);
      this.addMessage('user', this.getLang() === 'ar' ? 'غداً الساعة 10 صباحاً' : 'Tomorrow at 10 AM');
      await this.delay(1500);
      this.addMessage('bot', this.getLang() === 'ar' ? '✅ تم الحجز! هل رأيت السرعة؟ يمكنني فعل هذا لعيادتك الآن.' : '✅ Booked! Did you see the speed? I can do this for your clinic right now.');
      this.addButtons([{ text: this.getLang() === 'ar' ? 'تفعيل الآن' : 'Activate Now', action: 'activate' }]);
    }

    async send() {
      const input = document.getElementById('qd-input');
      const text = input.value.trim();
      if (!text) return;

      this.addMessage('user', text);
      input.value = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: text, 
            session_id: this.sessionId,
            clinic: this.clinic,
            lang: this.getLang()
          })
        });
        const data = await res.json();
        if (data.reply) {
          this.addMessage('bot', data.reply);
        }
        if (data.buttons) {
          this.addButtons(data.buttons);
        }
        if (data.action) {
          this.handleAction(data.action);
        }
      } catch (e) {
        console.error('Chat error:', e);
      }
    }

    addMessage(role, text) {
      const container = document.getElementById('qd-chat-messages');
      const msg = document.createElement('div');
      msg.className = `qd-msg qd-${role}`;
      msg.innerText = text;
      container.appendChild(msg);
      this.scrollToBottom();
    }

    addButtons(buttons) {
      const container = document.getElementById('qd-chat-messages');
      const btnGroup = document.createElement('div');
      btnGroup.className = 'qd-buttons';
      buttons.forEach(btn => {
        const b = document.createElement('button');
        b.innerText = btn.text;
        b.onclick = () => this.handleAction(btn.action);
        btnGroup.appendChild(b);
      });
      container.appendChild(btnGroup);
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
      style.textContent = `
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
      `;
      document.head.appendChild(style);
    }
  }

  // Expose globally
  window.QudozenChat = QudozenChat;
  window.qdChat = new QudozenChat();
})();
