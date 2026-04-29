const fs = require('fs');
const path = require('path');

const filePath = 'd:\\Downloads\\antigravity\\dental-bot (2)\\dental-bot\\public\\index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Fix the Bento Grid to include the Embedded Simulator in the first card
// We'll replace the existing "reception" card with the "reception-simulator" card.

const oldBentoStart = '<!-- 1. AI Receptionist (Spans 2 cols, 2 rows on lg) -->';
const newBentoContent = `<!-- 1. AI Receptionist - REAL SIMULATOR EMBEDDED -->
        <div id="reception-simulator" class="bento-card group glass rounded-3xl relative z-10 md:col-span-2 lg:row-span-2 overflow-hidden" style="background:linear-gradient(135deg,rgba(13,148,136,0.1),rgba(11,17,32,0.8));border-color:rgba(13,148,136,0.4)">
          <div class="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-[#0D9488]/20 to-transparent pointer-events-none z-0"></div>
          <div class="p-5 pb-2 relative z-10">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-teal-900 border border-teal-500 flex items-center justify-center text-xl shadow-[0_0_12px_rgba(13,148,136,0.4)]">🤖</div>
                <div>
                  <div class="font-bold text-white text-sm" data-i18n="txt_54">Smart Receptionist</div>
                  <div class="text-[11px] text-teal-400 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-teal-400 rounded-full inline-block animate-pulse"></span>
                    <span data-i18n="txt_55">Live System — Try Now</span>
                  </div>
                </div>
              </div>
              <button onclick="openModal('reception')" class="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full transition">Details</button>
            </div>
          </div>
          <div class="flex flex-col lg:flex-row gap-3 px-3 pb-4 relative z-10" onclick="event.stopPropagation()">
            <!-- Phone Mockup Container -->
            <div class="flex-shrink-0 mx-auto" style="width:240px; position:relative;">
              <div class="relative" style="width:240px">
                <div class="absolute inset-0 rounded-[28px] border-2 border-gray-700 pointer-events-none z-20" style="box-shadow:0 0 30px rgba(13,148,136,0.2)"></div>
                <div id="bsPhoneShell" class="rounded-[26px] overflow-hidden bg-[#111b21]" style="height:400px; display:flex; flex-direction:column;">
                  <!-- Top Bar -->
                  <div class="bg-[#111b21] px-4 pt-2 pb-1 flex justify-between items-center text-[10px] text-gray-400">
                    <span>9:41</span>
                    <div class="flex gap-1">
                      <svg class="w-2.5 h-2.5 fill-gray-400" viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"></path></svg>
                    </div>
                  </div>
                  <!-- Chat Header -->
                  <div class="bg-[#202c33] px-3 py-2 flex items-center gap-2 border-b border-gray-800/50">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-white text-xs" data-i18n="txt_56">The Intelligent System</div>
                      <div class="text-[10px] text-[#5EEAD4]" data-i18n="txt_57">Always Connected</div>
                    </div>
                    <button onclick="bsReset()" class="text-gray-500 hover:text-rose-400 transition text-sm">↺</button>
                  </div>
                  <!-- Progress Bar -->
                  <div class="bg-[#111b21] px-3 py-1">
                    <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div id="bsProgress" class="h-full bg-teal-500 transition-all duration-300" style="width:0%"></div>
                    </div>
                    <div class="text-[9px] text-gray-600 mt-0.5 text-right" id="bsStepLabel" style="direction:rtl" data-i18n="txt_58">Step 0 of 10</div>
                  </div>
                  <!-- Chat Body -->
                  <div id="bsChat" class="overflow-y-auto px-2.5 py-3 flex flex-col gap-2 flex-1" style="background:#0d1418;"></div>
                  <!-- Chips Area -->
                  <div id="bsReplies" class="bg-[#111b21] border-t border-gray-800/50 px-2 py-2 flex flex-wrap gap-1.5 min-h-[44px] items-center">
                    <span class="text-gray-600 text-[10px] italic" data-i18n="txt_59">Waiting to start...</span>
                  </div>
                  <!-- Input Bar -->
                  <div class="bg-[#202c33] px-2 py-2 flex items-center gap-1.5 border-t border-gray-800/30">
                    <div class="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5">
                      <input id="bsInput" type="text" placeholder="Write a message..." disabled class="w-full bg-transparent text-white text-xs outline-none placeholder-gray-600 text-right" style="direction:rtl" data-i18n-placeholder="txt_194">
                    </div>
                    <button id="bsSend" disabled onclick="bsHandleInput()" class="w-7 h-7 rounded-full bg-[#0D9488] flex items-center justify-center transition hover:bg-teal-600 disabled:opacity-30">
                      <svg class="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
              <div class="mt-3 text-center">
                <button id="bsStartBtn" onclick="bsStart()" class="bg-gold text-gray-900 px-6 py-2 rounded-xl font-black text-sm hover:shadow-[0_0_16px_rgba(212,165,116,0.5)] transition" data-i18n="txt_60">▶ Start the experience</button>
              </div>
              <!-- Floating ROI Ticker -->
              <div id="roiTicker" class="hidden absolute bottom-[-5px] left-0 right-0 glass border border-teal-500/50 rounded-xl p-2 shadow-[0_0_15px_rgba(94,234,212,0.3)] z-50 transform translate-y-full transition-transform duration-500">
                <div class="text-[10px] text-gray-300 text-center font-bold" id="roiLabel">Appointments Secured This Session</div>
                <div class="text-lg font-black text-aqua text-center text-glow" id="roiValue">0 SAR</div>
              </div>
            </div>
            <!-- Dashboard Info -->
            <div class="flex-1 min-w-0">
              <div class="glass rounded-2xl p-4 border border-white/5" style="min-height:200px">
                <div class="flex items-center gap-2 mb-3">
                  <div class="status-dot"></div>
                  <span class="text-[10px] font-bold text-[#22c55e] uppercase tracking-wider" data-i18n="txt_61">Dashboard — Live</span>
                </div>
                <div class="space-y-2">
                  <div class="bg-[#0f1b2d] rounded-xl p-3 border border-teal-500/20 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-1 h-full bg-teal-500"></div>
                    <div class="text-[9px] text-gray-500 mb-1" data-i18n="txt_62">Last operation</div>
                    <div id="bsDsName" class="bs-dash-field text-xs font-bold text-white" data-i18n="txt_63">-- Waiting to start --</div>
                  </div>
                  <div class="grid grid-cols-2 gap-1.5">
                    <div class="bg-[#0f1b2d] rounded-lg p-2 border border-white/5">
                      <div class="text-[9px] text-gray-500" data-i18n="txt_64">Treatment</div>
                      <div id="bsDsTreat" class="bs-dash-field text-xs font-bold text-white mt-0.5">--</div>
                    </div>
                    <div class="bg-[#0f1b2d] rounded-lg p-2 border border-white/5">
                      <div class="text-[9px] text-gray-500" data-i18n="txt_65">Time</div>
                      <div id="bsDsSlot" class="bs-dash-field text-xs font-bold text-aqua mt-0.5">--</div>
                    </div>
                    <div class="bg-[#0f1b2d] rounded-lg p-2 border border-white/5">
                      <div class="text-[9px] text-gray-500" data-i18n="txt_66">Date</div>
                      <div id="bsDsDate" class="bs-dash-field text-xs font-bold text-white mt-0.5">--</div>
                    </div>
                    <div class="bg-[#0f1b2d] rounded-lg p-2 border border-white/5">
                      <div class="text-[9px] text-gray-500" data-i18n="txt_67">Synchronization</div>
                      <div id="bsDsSync" class="bs-dash-field text-xs font-bold text-aqua mt-0.5">--</div>
                    </div>
                  </div>
                  <div id="bsRevenueBadge" class="hidden bs-revenue-badge">
                    <div class="text-[9px] text-teal-400 font-bold mb-1" data-i18n="txt_68">💰 Realized profits</div>
                    <div id="bsRevenueAmt" class="text-lg font-black text-white">--</div>
                    <div class="text-[9px] text-gray-400 mt-0.5" data-i18n="txt_69">Cuduzn works while you sleep</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;

// Find where to inject the new bento card
const bentoCardRegex = /<div onclick="openModal\('reception'\)" class="bento-card[\s\S]*?<\/div>[\s\S]*?<\/div>/;
html = html.replace(bentoCardRegex, newBentoContent);

// 2. Add the Missing logic for the Bento Simulator
const bentoSimLogic = `
  /* ═══════════════════════════════════════════════════════
     BENTO SIMULATOR ENGINE (bs = bento sim)
  ═══════════════════════════════════════════════════════ */
  let bsStep = 0, bsFlow = '', bsRunning = false, bsIsInit = false;
  let bsData = { name:'Visitor', treatment:'Consultation', date:'Tomorrow', slot:'10:00 AM', doctor:'Dr. Ahmed', lang:'ar', phone:'+96657436016', booked:false };

  const BS_MSGS = {
    ar: {
      langSelect: \`🌐 أهلاً! أنا جيك.\\nاختر لغتك:\\n1️⃣ English\\n2️⃣ العربية\`,
      menu: \`Welcome! 🤖\\nI'm *Jake*, your AI Business Operating System.\\nHow can I help you today?\\n\\n1️⃣ Book Appointment 📅\\n2️⃣ Pricing 💰\\n3️⃣ Location 📍\`,
      book: { 
        name:"رائع! ما اسمك؟", 
        phone:(p)=>\`رقمك: *\${p}*\\nصحيح؟\\n1️⃣ نعم\\n2️⃣ لا\`, 
        treat:"اختر الخدمة:\\n1️⃣ تنظيف 🦷\\n2️⃣ حشوات\\n3️⃣ تقويم 📐\\n4️⃣ زراعة 🔬", 
        doc:"الفريق المفضل:\\n1️⃣ د. أحمد\\n2️⃣ د. سارة\\n3️⃣ أي فريق", 
        date:(d)=>\`الوقت المناسب مع \${d}؟\\n1️⃣ غداً\\n2️⃣ الأربعاء\`, 
        slot:(d)=>\`الأوقات المتاحة (\${d}):\\n1️⃣ 10:00 ص\\n2️⃣ 4:00 م\`, 
        securing:"🔒 جاري تأمين موعدك...", 
        confirmed:"✅ *تم الحجز!* 🎉", 
        summary:(d)=>\`📋 *تفاصيل موعدك:*\\n👤 \${d.name}\\n🦷 \${d.treatment}\\n📅 \${d.date}\\n⏰ \${d.slot}\\n👨‍⚕️ \${d.doctor}\\n\\n📅 مزامنة تقويم: ناجحة ✅\\n🔔 تذكيرات مجدولة\` 
      },
      reminder:(n,date,slot,treat)=>\`🔔 *تذكير تلقائي (24 ساعة)*\\nمرحباً \${n}، موعدك غداً:\\n📅 \${date} ⏰ \${slot}\\n🦷 \${treat}\\n\\nنراك قريباً! 😊\`,
      prices:\`💰 *Prices:*\n• Standard Plan: 80 USD / 299 SAR\n• System Plan: 133 USD / 499 SAR\n• Swarm: Custom\`,
      location:\`📍 *Location:*\nCloud-First Operations.\nWe serve businesses worldwide 🌍\`
    },
    en: {
      langSelect: \`🌐 Hi! I'm Jake.\\nChoose language:\\n1️⃣ English\\n2️⃣ العربية\`,
      menu: \`Welcome! 🦷\\nI'm *Jake*, your AI assistant.\\nHow can I help?\\n\\n1️⃣ Book Appointment 📅\\n2️⃣ Prices 💰\\n3️⃣ Location 📍\`,
      book: { 
        name:"Great! What's your name?", 
        phone:(p)=>\`Your number: *\${p}*\\nCorrect?\\n1️⃣ Yes\\n2️⃣ No\`, 
        treat:"Select service:\\n1️⃣ Cleaning 🦷\\n2️⃣ Fillings\\n3️⃣ Braces 📐\\n4️⃣ Implants 🔬", 
        doc:"Preferred doctor:\\n1️⃣ Dr. Ahmed\\n2️⃣ Dr. Sarah\\n3️⃣ Any available", 
        date:(d)=>\`When for \${d}?\\n1️⃣ Tomorrow\\n2️⃣ Wednesday\`, 
        slot:(d)=>\`Available slots (\${d}):\\n1️⃣ 10:00 AM\\n2️⃣ 4:00 PM\`, 
        securing:"🔒 Securing your slot...", 
        confirmed:"✅ *Booking Successful!* 🎉", 
        summary:(d)=>\`📋 *Your Details:*\\n👤 \${d.name}\\n🦷 \${d.treatment}\\n📅 \${d.date}\\n⏰ \${d.slot}\\n👨‍⚕️ \${d.doctor}\\n\\n📅 Calendar sync: ✅\\n🔔 Reminders scheduled\` 
      },
      reminder:(n,date,slot,treat)=>\`🔔 *Auto-Reminder (24h)*\\nHi \${n}, your appointment tomorrow:\\n📅 \${date} ⏰ \${slot}\\n🦷 \${treat}\\n\\nSee you! 😊\`,
      prices:\`💰 *Prices:*\\n• Cleaning: 200 SAR\\n• Fillings: 350 SAR\\n• Braces: 3000+ SAR\\n• Implants: 4500+ SAR\`,
      location:\`📍 *Location:*\\nKhobar, Prince Turki St.\\n🗺️ maps.google.com\`
    }
  };

  const bsGet = () => ({
    chat: document.getElementById('bsChat'),
    replies: document.getElementById('bsReplies'),
    input: document.getElementById('bsInput'),
    send: document.getElementById('bsSend'),
    progress: document.getElementById('bsProgress'),
    label: document.getElementById('bsStepLabel'),
    startBtn: document.getElementById('bsStartBtn')
  });

  function bsSetProgress(n) {
    const {progress, label} = bsGet();
    if(progress) progress.style.width = ((n/10)*100)+'%';
    if(label) label.textContent = (bsData.lang==='ar'?'المرحلة ':'Phase ')+Math.min(n,10)+' / 10';
  }

  function bsScrollChat() {
    const {chat}=bsGet(); if(chat) setTimeout(()=>{ chat.scrollTop=chat.scrollHeight; },60);
  }

  async function bsAddBot(html) {
    const {chat}=bsGet(); if(!chat) return;
    const t=document.createElement('div');
    t.className='bs-typing flex items-center gap-1 px-3 py-2 rounded-xl self-start mb-1.5';
    t.style.cssText='background:#1e293b;border:1px solid rgba(94,234,212,0.1)';
    t.innerHTML='<span></span><span></span><span></span>';
    chat.appendChild(t); bsScrollChat();
    await new Promise(r=>setTimeout(r,600+Math.random()*300));
    if(t.parentNode===chat) chat.removeChild(t);
    const b=document.createElement('div');
    b.className='bs-bubble-bot mb-1.5 whitespace-pre-wrap text-right';
    b.innerHTML=html;
    const ts=document.createElement('div');
    ts.className='text-[9px] text-gray-600 mt-1';
    ts.textContent=new Date().toLocaleTimeString(bsData.lang==='ar'?'ar-SA':'en-US',{hour:'2-digit',minute:'2-digit'});
    b.appendChild(ts); chat.appendChild(b); bsScrollChat();
  }

  function bsAddUser(text) {
    const {chat}=bsGet(); if(!chat) return;
    const b=document.createElement('div');
    b.className='bs-bubble-user mb-1.5 text-right';
    b.innerHTML=text;
    const ts=document.createElement('div');
    ts.className='text-[9px] text-teal-200/60 mt-1 text-left';
    ts.innerHTML=new Date().toLocaleTimeString(bsData.lang==='ar'?'ar-SA':'en-US',{hour:'2-digit',minute:'2-digit'})+' <span class="text-teal-400">✓✓</span>';
    b.appendChild(ts); chat.appendChild(b); bsScrollChat();
  }

  function bsSetChips(chips) {
    const {replies}=bsGet(); if(!replies) return;
    replies.innerHTML='';
    if(!chips||chips.length===0){ bsEnableInput(); return; }
    bsDisableInput();
    chips.forEach(({label,value})=>{
      const btn=document.createElement('button');
      btn.className='bs-qr-chip';
      btn.textContent=label;
      btn.onclick=()=>{ document.querySelectorAll('.bs-qr-chip').forEach(b=>b.classList.add('used')); bsAddUser(btn.textContent); bsNext(value||label); };
      replies.appendChild(btn);
    });
  }

  function bsEnableInput(){const {input,send,replies}=bsGet();if(!input)return;input.disabled=false;send.disabled=false;input.focus();replies.innerHTML='';}
  function bsDisableInput(){const {input,send}=bsGet();if(!input)return;input.disabled=true;send.disabled=true;}

  function bsHandleInput(){
    const {input}=bsGet(); if(!input) return;
    const val=input.value.trim(); if(!val||input.disabled) return;
    input.value=''; bsAddUser(val); bsNext(val);
  }

  function bsUpdateDash() {
    const set=(id,val)=>{const e=document.getElementById(id);if(e){e.textContent=val;e.style.animation='none';void e.offsetWidth;e.style.animation='bsDashPulse 0.6s ease 2';}};
    set('bsDsName', bsData.name||'--');
    set('bsDsTreat', bsData.treatment||'--');
    set('bsDsSlot', bsData.slot||'--');
    set('bsDsDate', bsData.date||'--');
    if(bsData.booked){
      set('bsDsSync', bsData.lang === 'ar' ? 'مزامنة ✅' : 'Sync ✅');
      const badge=document.getElementById('bsRevenueBadge');
      const amtEl=document.getElementById('bsRevenueAmt');
      if(badge && amtEl){
        const rev=window._qzRevenue||0;
        if(rev>0){
          amtEl.textContent = rev+' ريال';
          badge.classList.remove('hidden');
          badge.style.animation='revenueGlow 2s ease-in-out infinite';
        }
      }
    }
  }

  async function bsNext(ui) {
    bsDisableInput();
    let m=BS_MSGS[bsData.lang];
    const u=ui.toLowerCase();
    if(/[\u0600-\u06FF]/.test(ui) && bsData.lang!=='ar'){bsData.lang='ar';m=BS_MSGS.ar;}

    const isZero=(u==='0'||u.includes('menu')||u.includes('القائمة'));
    if(isZero){bsFlow='';bsStep=1;await bsAddBot(m.menu);return bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'حجز موعد':'Book'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'الأسعار':'Prices'),value:'2'},{label:'3️⃣ '+(bsData.lang==='ar'?'الموقع':'Location'),value:'3'}]);}

    if(!bsFlow||bsStep===0){
      if(bsStep===0){bsData.lang=(u==='en'||u.includes('1')||u.includes('en'))?'en':'ar';m=BS_MSGS[bsData.lang];bsStep=1;bsSetProgress(2);await bsAddBot(m.menu);return bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'حجز موعد':'Book Appt'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'الأسعار':'Prices'),value:'2'},{label:'3️⃣ '+(bsData.lang==='ar'?'الموقع':'Location'),value:'3'}]);}
      if(u==='1'||u.includes('book')||u.includes('حجز')){bsFlow='booking';bsStep=2;return bsProcessBooking(u,m);}
      if(u==='2'||u.includes('price')||u.includes('سعر')){await bsAddBot(m.prices);return bsSetChips([{label:'0️⃣ '+(bsData.lang==='ar'?'القائمة':'Menu'),value:'0'}]);}
      if(u==='3'||u.includes('location')||u.includes('موقع')){await bsAddBot(m.location);return bsSetChips([{label:'0️⃣ '+(bsData.lang==='ar'?'القائمة':'Menu'),value:'0'}]);}
    }
    if(bsFlow==='booking') return bsProcessBooking(ui,m);
  }

  async function bsProcessBooking(ui,m){
    const b=m.book;
    switch(bsStep){
      case 2:bsStep=3;bsSetProgress(3);await bsAddBot(b.name);bsEnableInput();break;
      case 3:bsData.name=ui;bsStep=4;bsSetProgress(4);bsUpdateDash();await bsAddBot(b.phone(bsData.phone));bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'نعم':'Yes'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'لا':'No'),value:'2'}]);break;
      case 4:bsStep=5;bsSetProgress(5);await bsAddBot(b.treat);bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'تنظيف':'Cleaning'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'حشوات':'Fillings'),value:'2'},{label:'3️⃣ '+(bsData.lang==='ar'?'تقويم':'Braces'),value:'3'}]);break;
      case 5:bsData.treatment=ui==='1'?(bsData.lang==='ar'?'تنظيف':'Cleaning'):ui==='2'?(bsData.lang==='ar'?'حشوات':'Fillings'):ui==='3'?(bsData.lang==='ar'?'تقويم':'Braces'):ui;bsStep=7;bsSetProgress(6);bsUpdateDash();await bsAddBot(b.doc);bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'د. أحمد':'Dr. Ahmed'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'د. سارة':'Dr. Sarah'),value:'2'},{label:'3️⃣ '+(bsData.lang==='ar'?'أي فريق':'Any'),value:'3'}]);break;
      case 7:bsData.doctor=ui==='1'?(bsData.lang==='ar'?'د. أحمد':'Dr. Ahmed'):ui==='2'?(bsData.lang==='ar'?'د. سارة':'Dr. Sarah'):(bsData.lang==='ar'?'أي فريق متاح':'Any doctor');bsStep=8;bsSetProgress(7);await bsAddBot(b.date(bsData.doctor));bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'غداً':'Tomorrow'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'الأربعاء':'Wednesday'),value:'2'}]);break;
      case 8:bsData.date=ui==='1'?(bsData.lang==='ar'?'غداً':'Tomorrow'):(bsData.lang==='ar'?'الأربعاء':'Wednesday');bsStep=9;bsSetProgress(8);bsUpdateDash();await bsAddBot(b.slot(bsData.date));bsSetChips([{label:'1️⃣ '+(bsData.lang==='ar'?'10:00 ص':'10:00 AM'),value:'1'},{label:'2️⃣ '+(bsData.lang==='ar'?'4:00 م':'4:00 PM'),value:'2'}]);break;
      case 9:
        bsData.slot=ui==='1'?(bsData.lang==='ar'?'10:00 صباحاً':'10:00 AM'):(bsData.lang==='ar'?'4:00 مساءً':'4:00 PM');
        bsData.booked=true;bsStep=10;bsSetProgress(10);
        await bsAddBot(b.securing);
        await bsAddBot(b.confirmed+'\\n\\n'+b.summary(bsData));
        bsUpdateDash();
        bsFlow='';
        bsSetChips([{label:'0️⃣ '+(bsData.lang==='ar'?'القائمة الرئيسية':'Main Menu'),value:'0'}]);
        setTimeout(()=>bsTriggerReminder(m),3500);
        break;
    }
  }

  async function bsTriggerReminder(m){
    const {chat}=bsGet(); if(!chat) return;
    const notice=document.createElement('div');
    notice.className='bs-autonomous-notice';
    notice.textContent=(bsData.lang==='ar'?'─── أتمتة النظام الذاتي ───':'─── Autonomous System ───');
    chat.appendChild(notice);
    await bsAddBot(m.reminder(bsData.name,bsData.date,bsData.slot,bsData.treatment));
  }

  async function bsStart(){
    if(bsIsInit) return;
    bsIsInit=true;
    const {chat,replies,startBtn}=bsGet();
    bsStep=0;bsFlow='';
    bsData={name:'Visitor',treatment:'Consultation',date:'Tomorrow',slot:'10:00 AM',doctor:'Dr. Ahmed',lang:'ar',phone:'+96657436016',booked:false};
    if(chat) chat.innerHTML='';
    if(replies) replies.innerHTML='';
    if(startBtn) startBtn.style.display='none';
    bsSetProgress(1);
    try{
      await bsAddBot(BS_MSGS.ar.langSelect);
      bsSetChips([{label:'1️⃣ English',value:'en'},{label:'2️⃣ العربية',value:'ar'}]);
    }catch(e){console.error('[BS] Start error:',e);}
    finally{bsIsInit=false;}
  }

  function bsReset(){
    const {chat,replies,startBtn}=bsGet();
    bsStep=0;bsFlow='';
    bsData={name:'Visitor',treatment:'Consultation',date:'Tomorrow',slot:'10:00 AM',doctor:'Dr. Ahmed',lang:'ar',phone:'+96657436016',booked:false};
    if(chat) chat.innerHTML='';
    if(replies) replies.innerHTML='<span class="text-gray-600 text-[10px] italic">في انتظار البدء...</span>';
    if(startBtn){startBtn.style.display='block';}
    bsDisableInput();bsSetProgress(0);
    const badge=document.getElementById('bsRevenueBadge');
    if(badge) badge.classList.add('hidden');
    const ids=['bsDsName','bsDsTreat','bsDsSlot','bsDsDate','bsDsSync'];
    ids.forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='--';});
    document.getElementById('bsDsName').textContent='-- في انتظار البدء --';
  }
`;

// Find where to inject the logic (before </body>)
html = html.replace('</body>', `<script>${bentoSimLogic}</script>\n</body>`);

// 3. Fix the "openModal" and "serviceDB"
const serviceDB = `
const serviceDB = {
  "reception": {
    "icon": "🤖",
    "ar": {
      "title": "موظف الاستقبال الذكي",
      "desc": "نظام استقبال ذاتي متكامل عبر الواتساب يدير المرضى من الطلب حتى الحضور.",
      "flow": ["استلام الطلب وتحليله", "تنسيق الوقت مع التقويم", "تأكيد وحجز الموعد آلياً"],
      "benefits": ["حجز آلي بنسبة 100%", "تذكيرات تقلل الغياب 80%", "دعم ثنائي اللغة", "مزامنة تقويم جوجل"]
    },
    "en": {
      "title": "Smart Receptionist",
      "desc": "Autonomous system that manages patients via WhatsApp from initial request to booking.",
      "flow": ["Inquiry analysis", "Calendar coordination", "Automated confirmation"],
      "benefits": ["100% Automated booking", "Reduce no-shows by 80%", "Bilingual support", "Google Calendar sync"]
    }
  },
  "growth": {
    "icon": "🎯",
    "ar": {
      "title": "محرك النمو التلقائي",
      "desc": "وكالة تسويق رقمية في نظام واحد للبحث عن العملاء وبناء الثقة.",
      "flow": ["استخراج بيانات الجمهور", "إرسال رسائل مخصصة AI", "متابعة العملاء المترددين"],
      "benefits": ["استهداف جغرافي دقيق", "رسائل AI عالية التحويل", "متابعة آلية ذكية", "تقارير أداء حية"]
    },
    "en": {
      "title": "Automatic Growth Engine",
      "desc": "A digital marketing agency in one system to find customers and build trust.",
      "flow": ["Audience data extraction", "Personalized AI outreach", "Automated follow-ups"],
      "benefits": ["Precise geo-targeting", "High-conversion AI copy", "Smart persistent follow-up", "Live ROI dashboard"]
    }
  },
  "realestate": {
    "icon": "🏢",
    "ar": {
      "title": "المساعد العقاري",
      "desc": "تأهيل العملاء وجدولة المعاينات وتوزيع الفرص على الوكلاء.",
      "flow": ["تأهيل ميزانية العميل", "عرض الوحدات المناسبة", "جدولة المعاينة للوكيل"],
      "benefits": ["تأهيل فوري للمشترين", "فرز الطلبات العقارية", "مزامنة معاينات حية", "تنبيهات مبيعات ساخنة"]
    },
    "en": {
      "title": "Real Estate Assistant",
      "desc": "Qualifying leads, scheduling viewings, and distributing opportunities to agents.",
      "flow": ["Budget qualification", "Property matching", "Viewing coordination"],
      "benefits": ["Instant buyer qualification", "Property requirement filtering", "Live viewing sync", "Hot lead alerts"]
    }
  },
  "web": {
    "icon": "🌐",
    "ar": {
      "title": "أنظمة ويب للتحويل",
      "desc": "مسارات بيع (Funnels) سريعة تربط العميل مباشرة بنظام الواتساب.",
      "flow": ["تصميم واجهة تحويل", "تحميل فائق السرعة", "ربط زر العمل بالبوت"],
      "benefits": ["تحويل زوار لعملاء", "سرعة تحميل < 1.5ث", "تحسين محركات البحث", "تصميم عصري متجاوب"]
    },
    "en": {
      "title": "Conversion Web Systems",
      "desc": "High-speed sales funnels that link visitors directly to the WhatsApp system.",
      "flow": ["Conversion UI design", "Ultra-fast performance", "Direct bot integration"],
      "benefits": ["Visitor-to-lead conversion", "Load speed < 1.5s", "SEO optimization", "Premium responsive design"]
    }
  }
};

function openModal(id) {
  const d = serviceDB[id];
  if(!d) return;
  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const content = d[lang] || d['en'];

  document.getElementById('smIcon').textContent = d.icon;
  document.getElementById('smTitle').textContent = content.title;
  document.getElementById('smDesc').textContent = content.desc;
  
  const fDiv = document.getElementById('smFlow');
  if(fDiv) {
    fDiv.innerHTML = '';
    content.flow.forEach((step, idx) => {
      fDiv.innerHTML += \`<div class="bg-white/5 p-3 rounded-xl border border-white/5 text-center"><div class="text-aqua font-bold mb-1 text-xs">\${lang==='ar'?'خطوة':'Step'} \${idx+1}</div><div class="text-[10px] text-gray-400">\${step}</div></div>\`;
    });
  }

  const bDiv = document.getElementById('smBenefits');
  if(bDiv) {
    bDiv.innerHTML = '';
    content.benefits.forEach(b => {
      bDiv.innerHTML += \`<div class="flex items-start gap-3 bg-white/5 rounded-lg p-4 border border-white/5"><span class="text-[#5EEAD4]">✓</span> <span class="text-gray-300 font-medium">\${b}</span></div>\`;
    });
  }
  const ov = document.getElementById('smOverlay');
  const ct = document.getElementById('smContent');
  ov.classList.remove('hidden');
  ov.classList.add('flex');
  void ov.offsetWidth;
  ov.classList.remove('opacity-0');
  ct.classList.remove('opacity-0','scale-95');
  document.body.style.overflow='hidden';
}

function closeModal() {
  const ov = document.getElementById('smOverlay');
  const ct = document.getElementById('smContent');
  if(!ov || !ct) return;
  ov.classList.add('opacity-0');
  ct.classList.add('opacity-0','scale-95');
  document.body.style.overflow='';
  setTimeout(()=> { ov.classList.remove('flex'); ov.classList.add('hidden'); }, 300);
}
`;

// Inject serviceDB and modal logic
html = html.replace('</head>', `<script>${serviceDB}</script>\n</head>`);

// 4. Fix the MESSAGES object for the bottom simulator
const mainSimulatorMessages = `
const MESSAGES = {
  ar: {
    langSelect: \`🌐 أهلاً! أنا جيك، مساعدك الذكي.\\nاختر لغتك:\\n1️⃣ English\\n2️⃣ العربية\\n\\n💡 اضغط 1 للإنجليزية، 2 للعربية\`,
    menu: \`أهلاً بك! 🦷\\nأنا *جيك*، مساعدك في المنشأة.\\nكيف يمكنني مساعدتك اليوم؟\\n\\n1️⃣ حجز موعد جديد 📅\\n2️⃣ الأسعار 💰\\n3️⃣ الموقع 📍\`,
    book: {
      name: \`رائع! لنبدأ حجز موعدك.\\nما هو اسمك الكريم؟\`,
      phone: (p) => \`رقمك المسجل لدينا هو: *\${p}*\\nهل تريد الاستمرار بهذا الرقم؟\\n\\n1️⃣ نعم، أكمل الحجز\\n2️⃣ لا، استخدم رقم آخر\`,
      treat: \`اختر الخدمة المطلوبة:\\n1️⃣ تنظيف وتلميع 🦷\\n2️⃣ حشوات تجميلية\\n3️⃣ تقويم أسنان 📐\\n4️⃣ زراعة أسنان 🔬\`,
      doc: \`اختر الفريق الطبي المفضل:\\n1️⃣ د. أحمد (أخصائي)\\n2️⃣ د. سارة (استشارية)\\n3️⃣ أي فريق متاح الآن\`,
      date: (d) => \`الوقت المتاح مع \${d}:\\n1️⃣ غداً\\n2️⃣ الأربعاء القادم\\n3️⃣ اختر تاريخ آخر\`,
      slot: (d) => \`الأوقات المتاحة ليوم (\${d}):\\n1️⃣ 10:00 صباحاً\\n2️⃣ 04:00 مساءً\`,
      securing: \`🔒 جاري تأمين موعدك في النظام...\\nيرجى الانتظار ثانية.\`,
      confirmed: \`✅ *تم تأكيد موعدك بنجاح!* 🎉\`,
      summary: (d) => \`📋 *تفاصيل الحجز:*\\n👤 الاسم: \${d.name}\\n🦷 الخدمة: \${d.treatment}\\n📅 التاريخ: \${d.date}\\n⏰ الوقت: \${d.slot}\\n👨‍⚕️ الفريق: \${d.doctor}\\n\\n📅 تمت المزامنة مع التقويم ✅\\n🔔 سيتم إرسال تذكير قبل 24 ساعة.\`
    }
  },
  en: {
    langSelect: \`🌐 Welcome! I am Jake, your autonomous assistant.\\nPlease choose your language / اختر لغتك:\\n1️⃣ English\\n2️⃣ العربية\\n\\n💡 Tap 1 for English, 2 for Arabic\`,
    menu: \`Welcome! 🦷\\nI'm *Jake*, your facility assistant.\\nHow can I help you today?\\n\\n1️⃣ Book Appointment 📅\\n2️⃣ Prices 💰\\n3️⃣ Location 📍\`,
    book: {
      name: \`Great! Let's start your booking.\\nWhat is your full name?\`,
      phone: (p) => \`Your registered number is: *\${p}*\\nWould you like to use this number?\\n\\n1️⃣ Yes, continue\\n2️⃣ No, use another\`,
      treat: \`Select required service:\\n1️⃣ Cleaning & Polish 🦷\\n2️⃣ Aesthetic Fillings\\n3️⃣ Braces 📐\\n4️⃣ Dental Implants 🔬\`,
      doc: \`Choose preferred team:\\n1️⃣ Dr. Ahmed (Specialist)\\n2️⃣ Dr. Sarah (Consultant)\\n3️⃣ Any available team\`,
      date: (d) => \`Available dates with \${d}:\\n1️⃣ Tomorrow\\n2️⃣ Next Wednesday\\n3️⃣ Pick another date\`,
      slot: (d) => \`Available slots for (\${d}):\\n1️⃣ 10:00 AM\\n2️⃣ 04:00 PM\`,
      securing: \`🔒 Securing your slot in the system...\\nPlease wait a moment.\`,
      confirmed: \`✅ *Appointment Confirmed!* 🎉\`,
      summary: (d) => \`📋 *Booking Details:*\\n👤 Name: \${d.name}\\n🦷 Service: \${d.treatment}\\n📅 Date: \${d.date}\\n⏰ Time: \${d.slot}\\n👨‍⚕️ Team: \${d.doctor}\\n\\n📅 Calendar synced ✅\\n🔔 Reminder will be sent 24h before.\`
    }
  }
};
`;

// Inject MESSAGES object
html = html.replace('const MESSAGES = {', mainSimulatorMessages + '\n// Old MESSAGES was replaced');

// 5. Ensure the "Details" buttons work
html = html.replace(/<button onclick="openModal\('reception'\)"/g, '<button onclick="openModal(\'reception\')"');

// Write the final HTML
fs.writeFileSync(filePath, html);
console.log('index.html reconstructed and fixed.');
