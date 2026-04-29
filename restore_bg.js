const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/class="liquid-bg hidden"/g, 'class="liquid-bg"');
fs.writeFileSync(path, content, 'utf8');
console.log('Restored liquid-bg visibility');
