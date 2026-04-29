const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// The problematic area around line 532
// <div id="mobileMenu" ...>
//   <a ...>خدماتنا</a>
//   <div class="flex ...">
// <!-- HERO -->

// We need to close those two divs before the HERO section
const mobileMenuStart = '<div id="mobileMenu"';
const heroStart = '<!-- HERO -->';

const startIndex = content.indexOf(mobileMenuStart);
const heroIndex = content.indexOf(heroStart);

if (startIndex !== -1 && heroIndex !== -1 && startIndex < heroIndex) {
    // Find where the mobile menu items end
    // It seems it ends right before the HERO comment
    const patch = '      </div>\n    </div>\n\n  ';
    content = content.substring(0, heroIndex) + patch + content.substring(heroIndex);
    console.log('Closed mobileMenu divs before HERO section');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully patched public/index.html');
