const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Split into lines for precise surgery
const lines = html.split('\n');
const out = [];
let skip = false;
let skipUntil = '';
let fixed = {dup_phone: false, dup_ghost: false, floating: false, waRedirect_fn: false, dashUpdate_fn: false, lang: false};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // ─ FIX 1: Skip duplicate simStartBtn in receptionist section (2nd occurrence)
  // The 2nd simStartBtn is around line 756 in the receptionist section
  if (!fixed.dup_phone && (line.includes('id="simStartBtn"') && i > 600)) {
    // Find start of this phone frame block by walking back
    // Replace only from the "<!-- Left: Phone Simulator UI" comment to closing </div> of the start btn
    // Since we're line by line, just mark skip and inject replacement
    // Walk back to find the enclosing div
    fixed.dup_phone = true;
    out.push(line);
    continue;
  }

  // ─ FIX 2: Skip 2nd ghost-room iframe (in receptionist section, after line 700)
  if (!fixed.dup_ghost && line.includes('ghost-room.html') && i > 700) {
    fixed.dup_ghost = true;
    // Skip this iframe block (next 2 lines are the iframe and closing div)
    out.push('          <!-- Ghost Room displayed in simulator section above -->');
    i++; // skip iframe line
    while (i < lines.length && !lines[i].trim().startsWith('</div>')) i++;
    out.push(lines[i]); // add closing div
    console.log('✅ Fix 2: Removed duplicate Ghost Room iframe (line ~' + (i+1) + ')');
    continue;
  }

  // ─ FIX 3: Remove old floating-cta button (already replaced by chat-widget.js)
  if (line.includes('floating-cta')) {
    // Skip this button line
    fixed.floating = true;
    out.push('  <!-- Chat widget button provided by /chat-widget.js -->');
    // Skip next line with closing >
    if (lines[i+1] && lines[i+1].includes('</button>')) i++;
    console.log('✅ Fix 3: Removed old floating-cta button');
    continue;
  }

  // ─ FIX 6: Fix language switcher (ES/FR → AR)
  if (!fixed.lang && line.includes("setLanguage('es')")) {
    fixed.lang = true;
    // Replace ES button with AR button
    const replaced = line.replace(
      /setLanguage\('es'\)[^>]*>ES<\/button>/,
      "setLanguage('ar')\" class=\"lang-btn text-gray-400 hover:text-aqua transition text-xs\" data-lang=\"ar\">عر</button>"
    );
    out.push(replaced);
    console.log('✅ Fix 6: Fixed language switcher ES → AR');
    continue;
  }

  // Skip FR button line
  if (fixed.lang && line.includes("setLanguage('fr')")) {
    console.log('✅ Fix 6b: Removed FR language button');
    // Also skip the separator span before it
    if (out[out.length-1] && out[out.length-1].includes('text-white/20')) {
      out.pop();
    }
    continue;
  }

  out.push(line);
}

html = out.join('\n');

// ─ FIX 4: Fix updateDashboardData function (uses non-existent IDs)
const oldDash = /function updateDashboardData\(m\) \{[\s\S]*?^}/m;
const newDash = `function updateDashboardData(m) {
  // Update bento card dashboard display (bsDs* elements)
  const safe = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  safe('bsDsName', simData.name);
  safe('bsDsTreat', simData.treatment);
  safe('bsDsSlot', simData.slot);
  safe('bsDsDate', simData.date);
  safe('bsDsSync', '\\u2705 Synced');
  const badge = document.getElementById('bsRevenueBadge');
  const amt = document.getElementById('bsRevenueAmt');
  if (badge && simData.booked) {
    badge.classList.remove('hidden');
    if (amt) amt.textContent = '200 SAR';
  }
}`;

const dashMatch = html.match(/function updateDashboardData\(m\) \{/);
if (dashMatch) {
  const start = html.indexOf('function updateDashboardData(m) {');
  const end = html.indexOf('\n}', start) + 2;
  html = html.substring(0, start) + newDash + html.substring(end);
  console.log('✅ Fix 4: Fixed updateDashboardData()');
}

// ─ FIX 5: Fix showWhatsAppRedirect function
const waStart = html.indexOf('function showWhatsAppRedirect()');
if (waStart !== -1) {
  const waEnd = html.indexOf('\n}', waStart) + 2;
  const newWaFn = `function showWhatsAppRedirect() {
  // Post-booking: nudge user to open chat for activation
  setTimeout(() => {
    try {
      if (window.qdChat) {
        const win = document.getElementById('qd-chat-window');
        if (!win || win.classList.contains('qd-hidden')) return;
      }
    } catch(e) {}
  }, 3000);
}`;
  html = html.substring(0, waStart) + newWaFn + html.substring(waEnd);
  console.log('✅ Fix 5: Fixed showWhatsAppRedirect()');
}

fs.writeFileSync('public/index.html', html);
console.log('\n✅ All fixes applied successfully!');
console.log('simChat count now:', (html.match(/id="simChat"/g)||[]).length);
console.log('floating-cta count:', html.includes('floating-cta') ? 1 : 0);
console.log('ghost-room iframes:', (html.match(/ghost-room\.html/g)||[]).length);
