const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Diagnostics
console.log('simChat occurrences:', (html.match(/id="simChat"/g)||[]).length);
console.log('simStartBtn occurrences:', (html.match(/id="simStartBtn"/g)||[]).length);
console.log('simInput occurrences:', (html.match(/id="simInput"/g)||[]).length);
console.log('floating-cta:', html.includes('floating-cta'));
console.log('waRedirect:', html.includes('waRedirect'));
console.log('dashPreview:', html.includes('dashPreview'));
console.log('setLanguage es:', html.includes("setLanguage('es')"));
console.log('ghost iframe count:', (html.match(/ghost-room\.html/g)||[]).length);
console.log('chat-widget.js:', html.includes('chat-widget.js'));
console.log('AR fallback:', html.includes('AR language support'));
