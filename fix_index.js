const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove duplicate serviceDB at the top
// The first occurrence starts around line 5
const startMarker = 'const serviceDB = {';
const firstIndex = content.indexOf(startMarker);
const secondIndex = content.indexOf(startMarker, firstIndex + 1);

if (firstIndex !== -1 && secondIndex !== -1) {
  const firstEndIndex = content.indexOf('};', firstIndex) + 2;
  content = content.substring(0, firstIndex) + content.substring(firstEndIndex);
  console.log('Removed first duplicate serviceDB');
}

// 2. Wrap loadVerticalConfig in DOMContentLoaded
content = content.replace('loadVerticalConfig();', "window.addEventListener('DOMContentLoaded', loadVerticalConfig);");

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully patched public/index.html');
