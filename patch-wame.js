const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
// Replace the startCheckout function entirely
const funcStart = html.indexOf('async function startCheckout(plan');
if (funcStart !== -1) {
  const funcEnd = html.indexOf('async function requestSupport()');
  html = html.substring(0, funcStart) + 
         'async function startCheckout(plan = \'system\') {\n  if (window.qdChat) qdChat.toggle();\n}\n\n' + 
         html.substring(funcEnd);
  fs.writeFileSync('public/index.html', html);
  console.log('Fixed startCheckout');
}
