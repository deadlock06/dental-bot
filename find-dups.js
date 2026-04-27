const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

// Find exact lines for second occurrence of simChat
let simChatFirst = -1, simChatSecond = -1;
let simStartFirst = -1, simStartSecond = -1;

lines.forEach((l, i) => {
  if (l.includes('id="simChat"')) {
    if (simChatFirst === -1) simChatFirst = i+1;
    else simChatSecond = i+1;
  }
  if (l.includes('id="simStartBtn"')) {
    if (simStartFirst === -1) simStartFirst = i+1;
    else simStartSecond = i+1;
  }
});

console.log('First simChat:', simChatFirst);
console.log('Second simChat:', simChatSecond);
console.log('First simStartBtn:', simStartFirst);
console.log('Second simStartBtn:', simStartSecond);

// Show 5 lines of context around 2nd simChat
const ctx = simChatSecond - 1;
console.log('\nContext around second simChat:');
for (let i = Math.max(0, ctx-15); i < Math.min(lines.length, ctx+10); i++) {
  console.log((i+1) + ': ' + lines[i].substring(0, 80));
}
