const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

// Lines are 1-indexed in our view, 0-indexed in array
// Duplicate simulator phone: lines 707-759 (0-indexed: 706-758)
// We know from diagnostics:
// - simChat at lines 603 and 732
// - simStartBtn at lines 625 and 754
// - simInput at lines 614 and 744

// Strategy: delete lines 706 to 758 (the second phone block in Receptionist section)
// and replace with a simple feature list

const newLines = [];
let skipping = false;
let skipEnd = -1;

for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1; // 1-indexed
  
  // Start skipping at line 707 (second phone block starts with Glass glow comment)
  if (lineNum === 707 && lines[i].includes('Glass glow')) {
    skipping = true;
    skipEnd = 759;
    newLines.push('          <!-- Features: Static showcase (live simulator is in the #simulator section above) -->');
    newLines.push('          <div class="glass rounded-3xl p-6 border border-teal-500/20 space-y-3">');
    newLines.push('            <div class="flex items-center gap-3 mb-3">');
    newLines.push('              <div class="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl">🤖</div>');
    newLines.push('              <div><div class="font-bold text-white text-sm">Jake — AI Receptionist</div><div class="text-[10px] text-teal-400 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-teal-400 rounded-full inline-block animate-pulse"></span> Live 24/7</div></div>');
    newLines.push('            </div>');
    newLines.push('            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">⚡</span><div><div class="text-white text-sm font-bold">Responds in &lt;3 seconds</div><div class="text-gray-500 text-xs">24/7 with no human needed</div></div></div>');
    newLines.push('            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">📅</span><div><div class="text-white text-sm font-bold">Books &amp; Confirms</div><div class="text-gray-500 text-xs">Syncs directly to your calendar</div></div></div>');
    newLines.push('            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">🔔</span><div><div class="text-white text-sm font-bold">Auto-Reminders</div><div class="text-gray-500 text-xs">24h + 1h before every appointment</div></div></div>');
    newLines.push('            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-gold mt-0.5">🌐</span><div><div class="text-white text-sm font-bold">Arabic &amp; English</div><div class="text-gray-500 text-xs">Instant language switching</div></div></div>');
    newLines.push('            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">📊</span><div><div class="text-white text-sm font-bold">Live Dashboard</div><div class="text-gray-500 text-xs">Real-time clinic metrics</div></div></div>');
    newLines.push('            <a href="#simulator" class="block w-full text-center bg-gradient-to-r from-teal-500 to-teal-700 text-white py-3 rounded-xl font-bold hover:shadow-lg transition mt-2">▶ Try the Live Simulator</a>');
    newLines.push('          </div>');
    continue;
  }
  
  // Skip until line 759
  if (skipping && lineNum <= skipEnd) {
    if (lineNum === skipEnd) skipping = false;
    continue;
  }
  
  // Remove the empty ghost room div wrapper (lines ~763-766)
  if (lineNum >= 761 && lineNum <= 766 && lines[i].includes('GHOST ROOM IFRAME')) {
    // Skip this and next 3 lines (the wrapper div)
    newLines.push('          <!-- Ghost Room shown in the #simulator section above -->');
    continue;
  }
  
  newLines.push(lines[i]);
}

html = newLines.join('\n');

// Verify fix
const simChatCount = (html.match(/id="simChat"/g)||[]).length;
const simStartCount = (html.match(/id="simStartBtn"/g)||[]).length;
console.log('simChat occurrences after fix:', simChatCount);
console.log('simStartBtn occurrences after fix:', simStartCount);

fs.writeFileSync('public/index.html', html);
console.log(simChatCount === 1 ? '✅ Duplicate IDs fixed!' : '❌ Still has duplicates');
