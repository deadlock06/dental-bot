const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

// The second duplicate block starts around line 706-710 (enclosing div with perspective)
// and ends after line 758 (closing div after start button)
// Let's find the exact wrapping div for the second phone

// Find the start: look for the div with perspective:1000px near the second simStartBtn (line 754)
let blockStart = -1;
let blockEnd = -1;

for (let i = 700; i < 760; i++) {
  if (lines[i] && lines[i].includes('perspective:1000px')) {
    blockStart = i;
    break;
  }
}

// Find the closing div after simStartBtn (line 754)
// The structure ends with </div> after the start button p tag
for (let i = 758; i < 770; i++) {
  if (lines[i] && lines[i].trim() === '</div>' || 
      (lines[i] && lines[i].includes('</div>') && !lines[i].includes('<div'))) {
    blockEnd = i;
    break;
  }
}

console.log('Block to replace:', blockStart+1, 'to', blockEnd+1);
console.log('Start line:', lines[blockStart]);
console.log('End line:', lines[blockEnd]);

// Also check for containing div (one level up)
// The parent is: <div class="relative w-full max-w-[340px] flex-shrink-0" ...>
for (let i = blockStart; i >= 700; i--) {
  if (lines[i] && lines[i].includes('max-w-[340px]')) {
    console.log('Parent container at line:', i+1, ':', lines[i].substring(0, 80));
    break;
  }
}

// Now do the replacement: replace lines blockStart to blockEnd with feature cards
const replacement = [
  '          <!-- Features static showcase —- simulator is in #simulator section above -->',
  '          <div class="glass rounded-3xl p-6 border border-teal-500/20 space-y-3">',
  '            <div class="flex items-center gap-3 mb-3">',
  '              <div class="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl">🤖</div>',
  '              <div><div class="font-bold text-white text-sm">Jake — AI Receptionist</div><div class="text-[10px] text-teal-400 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-teal-400 rounded-full inline-block animate-pulse"></span> Live 24/7</div></div>',
  '            </div>',
  '            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">⚡</span><div><div class="text-white text-sm font-bold">Responds in &lt;3 seconds</div><div class="text-gray-500 text-xs">Any time, no human needed</div></div></div>',
  '            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">📅</span><div><div class="text-white text-sm font-bold">Books &amp; Confirms</div><div class="text-gray-500 text-xs">Syncs directly to your calendar</div></div></div>',
  '            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">🔔</span><div><div class="text-white text-sm font-bold">Auto-Reminders</div><div class="text-gray-500 text-xs">24h + 1h before every appointment</div></div></div>',
  '            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-gold mt-0.5">🌐</span><div><div class="text-white text-sm font-bold">Arabic &amp; English</div><div class="text-gray-500 text-xs">Instant language switching</div></div></div>',
  '            <div class="bg-white/5 rounded-xl p-3 flex items-start gap-3 border border-white/5"><span class="text-teal-400 mt-0.5">📊</span><div><div class="text-white text-sm font-bold">Live Dashboard</div><div class="text-gray-500 text-xs">Real-time clinic metrics</div></div></div>',
  '            <a href="#simulator" class="block w-full text-center bg-gradient-to-r from-teal-500 to-teal-700 text-white py-3 rounded-xl font-bold hover:shadow-lg transition mt-2">▶ Try the Live Simulator</a>',
  '          </div>'
];

// Replace the block
const newLines = [
  ...lines.slice(0, blockStart),
  ...replacement,
  ...lines.slice(blockEnd + 1)
];

html = newLines.join('\n');

const count = (html.match(/id="simChat"/g)||[]).length;
console.log('\nsimChat count after fix:', count);
fs.writeFileSync('public/index.html', html);
console.log(count === 1 ? '✅ Fixed!' : '❌ Still duplicated - manual check needed');
