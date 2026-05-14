// public/chat-widget.js — Qudozen Embedded Chat (Rebuilt)
(function(){
'use strict';

const LANG = {
  ar: {
    header: 'جيك — المساعد الذكي',
    online: 'متصل دائماً',
    inputPh: 'اكتب رسالة...',
    greet: (o,c)=> `أهلاً ${o}! 👋\nأنا *جيك*، مساعدك الذكي من Qudozen.\nأرى أنك تستكشف النظام لـ *${c}*.\n\nكيف أقدر أساعدك؟`,
    demo: '🚀 شاهد العرض',
    activate: '⚡ فعّل النظام',
    pricing: '💰 الأسعار',
    support: '📞 تواصل معنا',
    demoIntro: 'رائع! شاهد كيف يعمل النظام الذكي...',
    demoBot1: '🤖 موظف الاستقبال: أهلاً بك! كيف أقدر أساعدك؟',
    demoUsr1: 'أبي أحجز موعد تنظيف',
    demoBot2: '🤖 تم! متى تفضل الموعد؟',
    demoUsr2: 'بكره الساعة 10 الصبح',
    demoBot3: '✅ تم حجز موعدك!\n📅 غداً 10:00 ص\n🦷 تنظيف وتلميع\n📅 مزامنة تقويم ✅\n🔔 تذكير مجدول',
    demoEnd: '⚡ هذا بالضبط ما سيحدث في عيادتك.\nالنظام يعمل 24/7 بدون تدخل بشري.',
    activateNow: '🚀 فعّل الآن',
    backMenu: '↩ القائمة',
    pricingMsg: '💰 أسعار Qudozen:\n\n• الوعي (فردي): 299 ريال/شهر\n• النظام (متعدد): 499 ريال/شهر + 699 إعداد\n• السوارم: حسب الطلب\n\nجميع الباقات تشمل استقبال 24/7 ولوحة تحكم.',
    activateMsg: 'جاري تفعيل نظامك... لحظة واحدة 🚀',
    activateOk: (u,p)=> `✅ تم التفعيل!\n\n• المستخدم: ${u}\n• كلمة المرور: ${p}\n\nيمكنك الدخول للوحة التحكم الآن.`,
    dashboard: '📊 لوحة التحكم',
    supportMsg: 'يرجى إدخال رقم هاتفك وسيتواصل فريقنا معك فوراً.',
    activateErr: 'حدث خطأ. حاول مرة أخرى.',
    freeText: 'شكراً لرسالتك! فريقنا سيتواصل معك قريباً.\nهل تريد شيئاً آخر؟'
  },
  en: {
    header: 'Jake — AI Assistant',
    online: 'Always Online',
    inputPh: 'Type a message...',
    greet: (o,c)=> `Hi ${o}! 👋\nI'm *Jake*, your AI assistant from Qudozen.\nI see you're exploring the system for *${c}*.\n\nHow can I help?`,
    demo: '🚀 See Demo',
    activate: '⚡ Activate Now',
    pricing: '💰 Pricing',
    support: '📞 Contact Us',
    demoIntro: 'Great! Watch how the AI system works...',
    demoBot1: '🤖 Receptionist: Welcome! How can I help?',
    demoUsr1: 'I want to book a cleaning',
    demoBot2: '🤖 Done! When would you like it?',
    demoUsr2: 'Tomorrow at 10 AM',
    demoBot3: '✅ Appointment booked!\n📅 Tomorrow 10:00 AM\n🦷 Cleaning & Polishing\n📅 Calendar sync ✅\n🔔 Reminder scheduled',
    demoEnd: '⚡ This is exactly what happens at your clinic.\nThe system runs 24/7 with zero human effort.',
    activateNow: '🚀 Activate Now',
    backMenu: '↩ Menu',
    pricingMsg: '💰 Qudozen Pricing:\n\n• Awareness (Solo): 299 SAR/mo\n• System (Multi): 499 SAR/mo + 699 setup\n• Swarm: Custom\n\nAll plans include 24/7 reception & dashboard.',
    activateMsg: 'Activating your system... one moment 🚀',
    activateOk: (u,p)=> `✅ Activated!\n\n• Username: ${u}\n• Password: ${p}\n\nYou can now log in to your dashboard.`,
    dashboard: '📊 Dashboard',
    supportMsg: 'Please provide your phone number and our team will contact you immediately.',
    activateErr: 'Error activating. Please try again.',
    freeText: 'Thanks for your message! Our team will reach out soon.\nAnything else I can help with?'
  }
};

class QudozenChat {
  constructor(){
    this.sid = 'qd_'+Math.random().toString(36).substr(2,9)+'_'+Date.now();
    const p = new URLSearchParams(location.search);
    this.clinic = p.get('clinic')||'Your Clinic';
    this.owner = p.get('owner')||'there';
    this.started = false;
    this.lang = sessionStorage.getItem('qd_lang')||'ar';
    this.log('widget_init');
    this.build();
  }

  t(){ return LANG[this.lang]||LANG.en; }

  async log(ev,meta={}){
    try{ await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:ev,session_id:this.sid,metadata:meta})}); }catch(e){}
  }

  build(){
    const c = document.createElement('div');
    c.id = 'qd-chat-root';
    c.innerHTML = `
<div id="qd-chat-window" class="qd-hidden">
  <div id="qd-header">
    <div class="qd-hdr-left">
      <div class="qd-avatar">🤖</div>
      <div class="qd-hdr-text">
        <span id="qd-hdr-name">${this.t().header}</span>
        <small id="qd-hdr-status">${this.t().online}</small>
      </div>
    </div>
    <button id="qd-close" aria-label="Close">×</button>
  </div>
  <div id="qd-progress-wrap"><div id="qd-progress-bar"></div></div>
  <div id="qd-messages"></div>
  <div id="qd-chips"></div>
  <div id="qd-input-bar">
    <input type="text" id="qd-input" autocomplete="off" disabled placeholder="${this.t().inputPh}"/>
    <button id="qd-send" disabled aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
  </div>
</div>
<button id="qd-toggle" aria-label="Chat">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
</button>`;
    document.body.appendChild(c);
    this.el = {
      win: document.getElementById('qd-chat-window'),
      msgs: document.getElementById('qd-messages'),
      chips: document.getElementById('qd-chips'),
      input: document.getElementById('qd-input'),
      send: document.getElementById('qd-send'),
      prog: document.getElementById('qd-progress-bar'),
      hdrName: document.getElementById('qd-hdr-name'),
      hdrStatus: document.getElementById('qd-hdr-status')
    };
    document.getElementById('qd-toggle').onclick = ()=> this.toggle();
    document.getElementById('qd-close').onclick = ()=> this.toggle();
    this.el.send.onclick = ()=> this.sendInput();
    this.el.input.onkeypress = e=>{ if(e.key==='Enter') this.sendInput(); };
    this.injectCSS();
  }

  injectCSS(){
    const s = document.createElement('style');
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
#qd-chat-root{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:'Tajawal',sans-serif;direction:rtl}
#qd-chat-window{width:380px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100vh - 100px);background:#080C14;border:1px solid rgba(94,234,212,0.12);border-radius:24px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6),0 0 40px rgba(13,148,136,0.08);transition:transform .35s cubic-bezier(.4,0,.2,1),opacity .35s}
#qd-chat-window.qd-hidden{transform:scale(.92) translateY(20px);opacity:0;pointer-events:none}
#qd-header{background:#0B1120;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(94,234,212,0.08)}
.qd-hdr-left{display:flex;align-items:center;gap:10px}
.qd-avatar{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#0D9488,#5EEAD4);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 12px rgba(13,148,136,0.3)}
.qd-hdr-text span{color:#F8FAFC;font-weight:700;font-size:14px;display:block}
.qd-hdr-text small{color:#5EEAD4;font-size:10px;display:flex;align-items:center;gap:4px}
.qd-hdr-text small::before{content:'';width:6px;height:6px;background:#5EEAD4;border-radius:50%;animation:qd-pulse 2s infinite}
@keyframes qd-pulse{0%,100%{opacity:1}50%{opacity:.4}}
#qd-close{background:none;border:none;color:#64748B;font-size:22px;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;transition:all .2s}
#qd-close:hover{background:rgba(148,163,184,0.1);color:#F8FAFC}
#qd-progress-wrap{height:3px;background:#1e293b;margin:0}
#qd-progress-bar{height:100%;background:linear-gradient(90deg,#0D9488,#5EEAD4);border-radius:999px;transition:width .5s ease;width:0}
#qd-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#0d1418}
#qd-messages::-webkit-scrollbar{width:4px}
#qd-messages::-webkit-scrollbar-thumb{background:#0D9488;border-radius:4px}
.qd-bubble{padding:12px 16px;border-radius:16px;max-width:85%;line-height:1.65;font-size:13px;white-space:pre-wrap;animation:qd-in .3s ease}
@keyframes qd-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.qd-bot{background:#1e293b;color:#F8FAFC;align-self:flex-start;border:1px solid rgba(94,234,212,0.12);border-radius:16px 16px 16px 4px}
.qd-user{background:linear-gradient(135deg,#0D9488,#0a7a70);color:white;align-self:flex-end;border-radius:16px 16px 4px 16px}
.qd-ts{font-size:9px;color:#475569;margin-top:4px}
.qd-user .qd-ts{color:rgba(255,255,255,0.5);text-align:left}
#qd-chips{padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px;min-height:20px;align-items:center;border-top:1px solid rgba(94,234,212,0.06);background:#0B1120}
.qd-chip{display:inline-block;padding:7px 14px;border-radius:999px;border:1px solid rgba(94,234,212,0.3);background:rgba(94,234,212,0.06);color:#5EEAD4;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap;font-family:'Tajawal',sans-serif}
.qd-chip:hover{background:rgba(94,234,212,0.15);border-color:#5EEAD4;transform:translateY(-1px)}
.qd-chip.used{opacity:.3;pointer-events:none}
#qd-input-bar{display:flex;padding:12px 16px;gap:8px;background:#0B1120;border-top:1px solid rgba(94,234,212,0.06)}
#qd-input{flex:1;background:#1e293b;border:1px solid rgba(94,234,212,0.15);border-radius:12px;padding:10px 14px;color:#F8FAFC;font-size:13px;font-family:'Tajawal',sans-serif;outline:none;transition:border-color .2s;direction:rtl;text-align:right}
#qd-input:focus{border-color:rgba(13,148,136,0.4)}
#qd-input::placeholder{color:#475569}
#qd-input:disabled{opacity:.4}
#qd-send{background:#0D9488;color:white;border:none;border-radius:12px;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
#qd-send:hover{background:#0F766E}
#qd-send:disabled{opacity:.3}
#qd-send svg{width:16px;height:16px;fill:white;transform:scaleX(-1)}
#qd-toggle{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#0D9488,#5EEAD4);color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 30px rgba(13,148,136,0.35);transition:transform .25s,box-shadow .25s}
#qd-toggle:hover{transform:scale(1.1);box-shadow:0 12px 40px rgba(13,148,136,0.5)}
#qd-toggle svg{width:26px;height:26px}
.qd-typing{display:flex;align-items:center;gap:3px;padding:10px 14px;background:#1e293b;border:1px solid rgba(94,234,212,0.1);border-radius:16px 16px 16px 4px;align-self:flex-start}
.qd-typing span{width:6px;height:6px;border-radius:50%;background:#5EEAD4;animation:qd-dot 1.2s infinite}
.qd-typing span:nth-child(2){animation-delay:.2s}
.qd-typing span:nth-child(3){animation-delay:.4s}
@keyframes qd-dot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
.qd-notice{background:linear-gradient(90deg,transparent,rgba(212,165,116,0.1),transparent);border-top:1px solid rgba(212,165,116,0.2);border-bottom:1px solid rgba(212,165,116,0.2);padding:6px 0;margin:6px 0;color:#D4A574;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;text-align:center}
@media(max-width:480px){
  #qd-chat-root{bottom:12px;right:12px;left:12px}
  #qd-chat-window{width:auto;height:calc(85vh - 20px);position:fixed;bottom:78px;left:12px;right:12px;border-radius:20px}
  #qd-toggle{width:52px;height:52px}
}`;
    document.head.appendChild(s);
  }

  toggle(){
    const opening = this.el.win.classList.contains('qd-hidden');
    this.el.win.classList.toggle('qd-hidden');
    if(opening){ this.log('widget_opened'); if(!this.started) this.start(); }
  }

  open(action=null){
    if(this.el.win.classList.contains('qd-hidden')) this.toggle();
    if(action) setTimeout(()=> this.handleAction(action), 400);
  }

  setProgress(n,total=5){ this.el.prog.style.width = ((n/total)*100)+'%'; }

  async addBot(text){
    const typing = document.createElement('div');
    typing.className = 'qd-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    this.el.msgs.appendChild(typing);
    this.scroll();
    await this.delay(500+Math.random()*400);
    if(typing.parentNode) typing.remove();
    const d = document.createElement('div');
    d.className = 'qd-bubble qd-bot';
    d.textContent = text;
    const ts = document.createElement('div');
    ts.className = 'qd-ts';
    ts.textContent = new Date().toLocaleTimeString(this.lang==='ar'?'ar-SA':'en-US',{hour:'2-digit',minute:'2-digit'});
    d.appendChild(ts);
    this.el.msgs.appendChild(d);
    this.scroll();
  }

  addUser(text){
    const d = document.createElement('div');
    d.className = 'qd-bubble qd-user';
    d.textContent = text;
    const ts = document.createElement('div');
    ts.className = 'qd-ts';
    ts.textContent = new Date().toLocaleTimeString(this.lang==='ar'?'ar-SA':'en-US',{hour:'2-digit',minute:'2-digit'});
    d.appendChild(ts);
    this.el.msgs.appendChild(d);
    this.scroll();
  }

  setChips(chips){
    this.el.chips.innerHTML = '';
    if(!chips||!chips.length){ this.el.chips.style.display='none'; return; }
    this.el.chips.style.display='flex';
    this.el.input.disabled = true;
    this.el.send.disabled = true;
    chips.forEach(({label,action})=>{
      const b = document.createElement('button');
      b.className = 'qd-chip';
      b.textContent = label;
      b.onclick = ()=>{
        document.querySelectorAll('.qd-chip').forEach(x=>x.classList.add('used'));
        this.addUser(label);
        setTimeout(()=> this.handleAction(action), 200);
      };
      this.el.chips.appendChild(b);
    });
  }

  enableInput(){
    this.el.chips.innerHTML='';
    this.el.chips.style.display='none';
    this.el.input.disabled=false;
    this.el.send.disabled=false;
    this.el.input.focus();
  }

  scroll(){ setTimeout(()=>{ this.el.msgs.scrollTop=this.el.msgs.scrollHeight; },60); }
  delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async start(){
    this.started = true;
    this.setProgress(1);
    const m = this.t();
    await this.addBot(m.greet(this.owner, this.clinic));
    this.showMainMenu();
  }

  showMainMenu(){
    const m = this.t();
    this.setChips([
      {label: m.demo, action:'demo'},
      {label: m.activate, action:'activate'},
      {label: m.pricing, action:'pricing'},
      {label: m.support, action:'support'}
    ]);
  }

  async handleAction(action){
    const m = this.t();
    if(action==='demo') return this.runDemo();
    if(action==='activate'||action==='trial') return this.activateTrial();
    if(action==='pricing') return this.showPricing();
    if(action==='support') return this.showSupport();
    if(action==='dashboard') return window.location.href='/dashboard';
    if(action==='menu'){ await this.addBot(m.greet(this.owner,this.clinic)); return this.showMainMenu(); }
  }

  async runDemo(){
    this.log('demo_started');
    const m = this.t();
    this.setProgress(2);
    await this.addBot(m.demoIntro);
    await this.delay(1200);

    this.setProgress(3);
    await this.addBot(m.demoBot1);
    await this.delay(800);
    this.addUser(m.demoUsr1);
    await this.delay(1000);

    await this.addBot(m.demoBot2);
    await this.delay(800);
    this.addUser(m.demoUsr2);
    await this.delay(1200);

    this.setProgress(4);
    await this.addBot(m.demoBot3);
    await this.delay(1500);

    // Autonomous notice
    const notice = document.createElement('div');
    notice.className = 'qd-notice';
    notice.textContent = this.lang==='ar'?'─── أتمتة النظام الذاتي ───':'─── Autonomous System ───';
    this.el.msgs.appendChild(notice);
    this.scroll();

    this.setProgress(5);
    await this.addBot(m.demoEnd);
    this.setChips([
      {label: m.activateNow, action:'activate'},
      {label: m.pricing, action:'pricing'},
      {label: m.backMenu, action:'menu'}
    ]);
  }

  async showPricing(){
    this.log('pricing_viewed');
    const m = this.t();
    this.setProgress(3);
    await this.addBot(m.pricingMsg);
    this.setChips([
      {label: m.activate, action:'activate'},
      {label: m.backMenu, action:'menu'}
    ]);
  }

  async activateTrial(){
    this.log('trial_clicked');
    const m = this.t();
    this.setProgress(4);
    await this.addBot(m.activateMsg);
    try {
      const res = await fetch('/api/start-trial',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({clinic_name:this.clinic,session_id:this.sid,lang:this.lang})
      });
      const data = await res.json();
      if(data.success){
        this.setProgress(5);
        await this.addBot(m.activateOk(data.username,data.password));
        this.setChips([{label:m.dashboard, action:'dashboard'}]);
      } else {
        await this.addBot(m.activateErr);
        this.setChips([{label:m.backMenu, action:'menu'}]);
      }
    } catch(e){
      await this.addBot(m.activateErr);
      this.setChips([{label:m.backMenu, action:'menu'}]);
    }
  }

  async showSupport(){
    this.log('support_clicked');
    const m = this.t();
    await this.addBot(m.supportMsg);
    this.enableInput();
  }

  async sendInput(){
    const text = this.el.input.value.trim();
    if(!text) return;
    this.el.input.value = '';
    this.addUser(text);
    this.el.input.disabled = true;
    this.el.send.disabled = true;

    // Detect language switch
    if(/[\u0600-\u06FF]/.test(text) && this.lang!=='ar'){ this.lang='ar'; sessionStorage.setItem('qd_lang','ar'); }
    else if(/^[a-zA-Z]/.test(text) && this.lang!=='en'){ this.lang='en'; sessionStorage.setItem('qd_lang','en'); }

    // Try server first
    try {
      const res = await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text,session_id:this.sid,clinic:this.clinic,lang:this.lang})
      });
      const data = await res.json();
      const msgs = data.messages||(data.reply?[{type:'text',content:data.reply}]:[]);
      for(const msg of msgs){
        if(msg.type==='text'||msg.content||msg.reply) await this.addBot(msg.content||msg.reply);
        else if(msg.type==='interactive'){ await this.addBot(msg.body); }
        if(msgs.length>1) await this.delay(400);
      }
      if(data.action) return this.handleAction(data.action);
      if(!msgs.length) await this.addBot(this.t().freeText);
    } catch(e){
      await this.addBot(this.t().freeText);
    }
    this.setChips([{label:this.t().backMenu, action:'menu'}]);
  }
}

window.QudozenChat = QudozenChat;
window.qdChat = new QudozenChat();
})();
