/**
 * Qudozen Site Audit Fix Script
 * Fixes all 7 critical issues found in the site audit
 */
const fs = require('fs');

// ─── Load files ───────────────────────────────────────────────
let html = fs.readFileSync('public/index.html', 'utf8');
let ghost = fs.readFileSync('growth/ghost-room.html', 'utf8');

console.log('Starting audit fixes...\n');

// ═══════════════════════════════════════════════════════════════
// FIX 1: Remove duplicate simulator phone frame from #receptionist section
// The old #simulator section (with simChat first in DOM) is the working one.
// The Receptionist section has the same IDs and causes non-functional UI.
// Replace duplicate phone with a clean feature grid.
// ═══════════════════════════════════════════════════════════════

const duplicatePhoneStart = `        <!-- Left: Phone Simulator UI (Existing Logic) -->
        <div class="relative w-full max-w-[340px] flex-shrink-0" style="perspective:1000px">
          <!-- Glass glow -->
          <div class="absolute -inset-10 bg-teal-500/20 rounded-full blur-[100px] opacity-30 animate-pulse"></div>
          
          <div class="rounded-[34px] overflow-hidden border-[6px] border-[#222] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] bg-[#111b21] h-[600px] flex flex-col relative z-20">
            <!-- Simulator Header -->
            <div class="bg-[#202c33] px-4 py-3 flex items-center gap-3 border-b border-gray-800/30">
              <div class="w-10 h-10 rounded-full bg-teal-900/50 flex items-center justify-center overflow-hidden border border-teal-500/30">
                 <img src="https://ui-avatars.com/api/?name=Jake&background=0D9488&color=fff" alt="Jake" class="w-full h-full object-cover">
              </div>
              <div class="flex-1">
                <div class="text-white text-sm font-bold flex items-center gap-1.5">
                  Jake <span class="bg-teal-500/20 text-teal-400 text-[8px] px-1 rounded uppercase tracking-widest">AI Agent</span>
                </div>
                <div class="text-[10px] text-teal-500 font-medium" data-i18n="txt_92">Online Always</div>
              </div>
              <div class="flex gap-3 text-gray-400">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0-1-.45-1-1v-3.5l4 4v-11l-4 4z"></path></svg>
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-4H6v-2h12v2z"></path></svg>
              </div>
            </div>

            <!-- Chat body -->
            <div id="simChat" class="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3"
                 style="background:#0d1418;background-image:url('https://www.transparenttextures.com/patterns/stardust.png');background-size:200px">
            </div>

            <!-- Quick replies area -->
            <div id="simReplies" class="bg-[#111b21] border-t border-gray-800/50 px-3 py-3 flex flex-wrap gap-2 min-h-[58px] items-center">
              <span class="text-gray-600 text-xs italic" data-i18n="txt_93">Waiting to start...</span>
            </div>

            <!-- Input bar -->
            <div class="bg-[#202c33] px-3 py-2.5 flex items-center gap-2 border-t border-gray-800/30">
              <div id="simInputWrap" class="flex-1 bg-[#2a3942] rounded-full px-4 py-2 flex items-center gap-2">
                <input id="simInput" type="text" placeholder="Write a message..." disabled class="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600 text-right" style="min-width:0;direction:rtl">
              </div>
              <button id="simSend" disabled class="w-9 h-9 rounded-full bg-[#0D9488] flex items-center justify-center transition hover:bg-teal-600 disabled:opacity-30" onclick="handleSimInput()">
                <svg class="w-4 h-4 fill-white rtl:rotate-180" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
              </button>
            </div>
          </div>

          <!-- Start button -->
          <div class="mt-8 text-center relative z-30">
            <button id="simStartBtn" onclick="startSimulator()" class="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:shadow-teal-500/40 transition-all hover:scale-105">
              ▶ START LIVE SIMULATION
            </button>
            <p class="text-xs text-gray-500 mt-3">Experience the high-fidelity patient journey in seconds</p>
          </div>
        </div>`;

const fixedPhoneReplacement = `        <!-- Left: What the System Does — Static Feature Showcase -->
        <div class="relative w-full max-w-[340px] flex-shrink-0">
          <div class="glass rounded-3xl p-6 border border-teal-500/20 space-y-4">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl">🤖</div>
              <div>
                <div class="font-bold text-white text-sm">Jake — AI Agent</div>
                <div class="text-[10px] text-teal-400 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-teal-400 rounded-full inline-block animate-pulse"></span> Live — Always Connected</div>
              </div>
            </div>
            <div class="space-y-3">
              <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5">
                <span class="text-teal-400 text-lg mt-0.5">⚡</span>
                <div><div class="text-white text-sm font-bold">Responds in &lt;3 seconds</div><div class="text-gray-500 text-xs mt-0.5">24/7, no human needed</div></div>
              </div>
              <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5">
                <span class="text-teal-400 text-lg mt-0.5">📅</span>
                <div><div class="text-white text-sm font-bold">Books &amp; Confirms</div><div class="text-gray-500 text-xs mt-0.5">Syncs directly to your calendar</div></div>
              </div>
              <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5">
                <span class="text-teal-400 text-lg mt-0.5">🔔</span>
                <div><div class="text-white text-sm font-bold">Auto-Reminders</div><div class="text-gray-500 text-xs mt-0.5">24h + 1h before every appointment</div></div>
              </div>
              <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5">
                <span class="text-gold text-lg mt-0.5">🌐</span>
                <div><div class="text-white text-sm font-bold">Arabic &amp; English</div><div class="text-gray-500 text-xs mt-0.5">Instant language switching</div></div>
              </div>
              <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5">
                <span class="text-teal-400 text-lg mt-0.5">📊</span>
                <div><div class="text-white text-sm font-bold">Live Dashboard</div><div class="text-gray-500 text-xs mt-0.5">Real-time clinic metrics</div></div>
              </div>
            </div>
            <a href="#simulator" class="block w-full text-center bg-gradient-to-r from-teal-500 to-teal-700 text-white py-3 rounded-xl font-bold hover:shadow-teal-500/30 hover:shadow-lg transition mt-2">
              ▶ Try the Live Simulator
            </a>
          </div>
        </div>`;

if (html.includes(duplicatePhoneStart.substring(0, 80))) {
  html = html.replace(duplicatePhoneStart, fixedPhoneReplacement);
  console.log('✅ Fix 1: Removed duplicate simulator phone from Receptionist section');
} else {
  console.log('⚠️  Fix 1: Could not find duplicate phone block (may already be fixed)');
}

// ═══════════════════════════════════════════════════════════════
// FIX 2: Remove duplicate Ghost Room iframe from #receptionist section
// Keep only the one in the original #simulator section
// ═══════════════════════════════════════════════════════════════

const duplicateGhostIframe = `          <!-- GHOST ROOM IFRAME -->
          <div class="w-full h-[550px] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl relative">
             <iframe src="/growth/ghost-room.html?lang=en&clinic=Your%20Business" class="w-full h-full border-0" title="Ghost Room Simulator"></iframe>
          </div>`;

if (html.includes(duplicateGhostIframe)) {
  html = html.replace(duplicateGhostIframe, '          <!-- Ghost Room shown in simulator section above -->');
  console.log('✅ Fix 2: Removed duplicate Ghost Room iframe from Receptionist section');
} else {
  console.log('⚠️  Fix 2: Duplicate Ghost Room iframe not found (may already be fixed)');
}

// ═══════════════════════════════════════════════════════════════
// FIX 3: Remove old floating button (conflicts with chat-widget.js button)
// chat-widget.js already adds a proper #qd-chat-toggle button
// ═══════════════════════════════════════════════════════════════

const oldFloatingBtn = `  <!-- Floating Checkout CTA (replaces WhatsApp widget) -->
  <button onclick="qdChat.toggle()" class="chat-widget" aria-label="Activate your system" id="floating-cta" style="background:linear-gradient(135deg,#0D9488,#5EEAD4)">
    <svg viewBox="0 0 24 24" class="w-8 h-8 fill-white"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
  </button>`;

if (html.includes(oldFloatingBtn)) {
  html = html.replace(oldFloatingBtn, '  <!-- Chat widget button injected by /chat-widget.js -->');
  console.log('✅ Fix 3: Removed duplicate floating button (chat-widget.js handles this)');
} else {
  console.log('⚠️  Fix 3: Old floating button not found (may already be fixed)');
}

// ═══════════════════════════════════════════════════════════════
// FIX 4: Fix updateDashboardData() - add null guards for missing IDs
// The bento simulator (bs*) has its own dashboard, not the main sim
// ═══════════════════════════════════════════════════════════════

const brokenDashUpdate = `function updateDashboardData(m) {
  const dp = document.getElementById('dashPreview');
  if (!dp) return;
  if (!simData.booked) { 
    dp.classList.add('hidden'); 
    dp.style.opacity = '0'; 
    dp.style.transform = 'scale(0.95)'; 
    return; 
  }
  dp.classList.remove('hidden');
  // Force reflow then animate in
  requestAnimationFrame(() => {
    dp.style.opacity = '1';
    dp.style.transform = 'scale(1)';
  });
  document.getElementById('dsPatientName').textContent = simData.name;
  document.getElementById('dsTreatment').textContent = simData.treatment;
  document.getElementById('dsSlot').textContent = simData.slot;
  document.getElementById('dsDate').textContent = simData.date;
  document.getElementById('dsDoctor').textContent = simData.doctor;
  // Update ref number with timestamp
  const ref = document.getElementById('dsRef');
  if (ref) ref.textContent = 'REF: QZ-' + Date.now().toString().slice(-6);
  // Update dashboard labels based on language
  const d = m.dash;
  const el = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
  el('dsStatus', d.status);
  el('dsConfLabel', d.conf);
  el('dsTreatLabel', d.treat);
  el('dsSlotLabel', d.time);
  el('dsDateLabel', d.date);
  el('dsDocLabel', d.doc);
  el('dsSyncLabel', d.sync);
  el('dsRemLabel', d.rem);
}`;

const fixedDashUpdate = `function updateDashboardData(m) {
  // Update bento simulator dashboard (bsDs* elements)
  const safe = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  safe('bsDsName', simData.name);
  safe('bsDsTreat', simData.treatment);
  safe('bsDsSlot', simData.slot);
  safe('bsDsDate', simData.date);
  safe('bsDsSync', '✅ Synced');
  // Show revenue badge if booked
  const badge = document.getElementById('bsRevenueBadge');
  const amt = document.getElementById('bsRevenueAmt');
  if (badge && simData.booked) {
    badge.classList.remove('hidden');
    if (amt) amt.textContent = '200 SAR';
  }
}`;

if (html.includes(brokenDashUpdate.substring(0, 60))) {
  html = html.replace(brokenDashUpdate, fixedDashUpdate);
  console.log('✅ Fix 4: Fixed updateDashboardData() null reference errors');
} else {
  console.log('⚠️  Fix 4: updateDashboardData not found with expected pattern');
}

// ═══════════════════════════════════════════════════════════════
// FIX 5: Fix showWhatsAppRedirect() - reference to non-existent waRedirect
// Replace with a post-booking chat invite
// ═══════════════════════════════════════════════════════════════

const brokenWaRedirect = `function showWhatsAppRedirect() {
  const wa = document.getElementById('waRedirect');
  if (wa) {
    wa.classList.remove('hidden');
    wa.style.opacity = '0';
    requestAnimationFrame(() => {
      wa.style.transition = 'opacity 0.5s ease';
      wa.style.opacity = '1';
    });
  }
}`;

const fixedWaRedirect = `function showWhatsAppRedirect() {
  // Show chat widget after successful booking simulation
  setTimeout(() => {
    if (window.qdChat && !document.getElementById('qd-chat-window').classList.contains('qd-hidden') === false) {
      // Auto-open chat widget to guide user to activation
      try { qdChat.toggle(); } catch(e) {}
    }
  }, 2500);
}`;

if (html.includes(brokenWaRedirect.substring(0, 50))) {
  html = html.replace(brokenWaRedirect, fixedWaRedirect);
  console.log('✅ Fix 5: Fixed showWhatsAppRedirect() null reference');
} else {
  console.log('⚠️  Fix 5: showWhatsAppRedirect not found with expected pattern');
}

// ═══════════════════════════════════════════════════════════════
// FIX 6: Fix language switcher — change ES/FR to AR
// ═══════════════════════════════════════════════════════════════

const oldLangSwitcher = `        <button onclick="setLanguage('en')" class="lang-btn text-aqua font-bold text-xs" data-lang="en">EN</button>
        <span class="text-white/20">|</span>
        <button onclick="setLanguage('es')" class="lang-btn text-gray-400 hover:text-aqua transition text-xs" data-lang="es">ES</button>
        <span class="text-white/20">|</span>
        <button onclick="setLanguage('fr')" class="lang-btn text-gray-400 hover:text-aqua transition text-xs" data-lang="fr">FR</button>`;

const fixedLangSwitcher = `        <button onclick="setLanguage('en')" class="lang-btn text-aqua font-bold text-xs" data-lang="en">EN</button>
        <span class="text-white/20">|</span>
        <button onclick="setLanguage('ar')" class="lang-btn text-gray-400 hover:text-aqua transition text-xs" data-lang="ar">عر</button>`;

if (html.includes(oldLangSwitcher)) {
  html = html.replace(oldLangSwitcher, fixedLangSwitcher);
  console.log('✅ Fix 6: Fixed language switcher — now shows EN | AR');
} else {
  console.log('⚠️  Fix 6: Language switcher not found with expected pattern');
}

// ═══════════════════════════════════════════════════════════════
// FIX 7: Fix ghost-room.html CTA button
// The "تفعيل النظام فوراً" button has onclick that tries parent.startCheckout
// When embedded as iframe, this should call parent.qdChat.toggle()
// ═══════════════════════════════════════════════════════════════

const oldGhostCta = `onclick="parent.startCheckout ? parent.startCheckout('system') : window.location.href='/#pricing'"`;
const fixedGhostCta = `onclick="try { parent.qdChat.toggle(); } catch(e) { window.location.href='/#pricing'; }"`;

if (ghost.includes(oldGhostCta)) {
  ghost = ghost.replace(oldGhostCta, fixedGhostCta);
  console.log('✅ Fix 7: Fixed ghost-room.html CTA to properly use parent.qdChat');
} else {
  console.log('⚠️  Fix 7: Ghost-room CTA not found with expected pattern');
}

// ═══════════════════════════════════════════════════════════════
// FIX 8: Add AR language support to i18n - ensure setLanguage('ar') works
// Add inline fallback in page for AR toggle
// ═══════════════════════════════════════════════════════════════

// Inject AR support inline (setLanguage is defined in i18n.js but may not handle 'ar')
const arFallback = `<script>
// AR language support fallback
(function() {
  const _orig = window.setLanguage;
  window.setLanguage = function(lang) {
    if (_orig) _orig(lang);
    const btns = document.querySelectorAll('.lang-btn');
    btns.forEach(b => {
      b.classList.remove('text-aqua', 'font-bold');
      b.classList.add('text-gray-400');
    });
    const active = document.querySelector('.lang-btn[data-lang="' + lang + '"]');
    if (active) {
      active.classList.add('text-aqua', 'font-bold');
      active.classList.remove('text-gray-400');
    }
    // Update page direction for AR
    if (lang === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', 'en');
    }
    // Store for chat widget
    sessionStorage.setItem('qd_lang', lang);
  };
})();
<\/script>`;

if (!html.includes('AR language support fallback')) {
  html = html.replace('<script src="/chat-widget.js"></script>', arFallback + '\n  <script src="/chat-widget.js"></script>');
  console.log('✅ Fix 8: Added AR language support inline');
} else {
  console.log('⚠️  Fix 8: AR support already exists');
}

// ─── Save files ───────────────────────────────────────────────
fs.writeFileSync('public/index.html', html);
fs.writeFileSync('growth/ghost-room.html', ghost);

console.log('\n✅ All fixes applied. Files saved.');
console.log('Run: git add -A && git commit && git push');
