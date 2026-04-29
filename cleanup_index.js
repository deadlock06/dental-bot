const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove ALL duplicate BENTO SIMULATOR ENGINE blocks
// We want to keep ONLY the one that has the correct BS_MSGS with phone_label etc.
const startMarker = '/* ═══════════════════════════════════════════════════════\n     BENTO SIMULATOR ENGINE';
const firstIndex = content.indexOf(startMarker);
const secondIndex = content.indexOf(startMarker, firstIndex + 1);

if (firstIndex !== -1 && secondIndex !== -1) {
    // Keep the second one, remove the first one?
    // Actually, let's just find the whole block from 1872 to 2131 and remove it
    const blockStart = content.indexOf('let bsStep = 0, bsFlow = \'\', bsRunning = false, bsIsInit = false;');
    const blockEnd = content.indexOf('/* ═══════════════════════════════════════════════════════\n     STEP 4: GHOST ROOM FOMO TICKER');
    
    if (blockStart !== -1 && blockEnd !== -1 && blockStart < blockEnd) {
        content = content.substring(0, blockStart) + content.substring(blockEnd);
        console.log('Removed first duplicate simulator engine');
    }
}

// 2. Ensure mobileMenu is closed
// Check if it's already closed from previous patch
if (!content.includes('</div>\n    </div>\n\n  <!-- ══════════════════════════════════════════════════ -->\n  <!-- HERO -->')) {
    // Re-apply the fix if it's missing
    const heroStart = '<!-- ══════════════════════════════════════════════════ -->\n  <!-- HERO -->';
    const heroIndex = content.indexOf(heroStart);
    if (heroIndex !== -1) {
        const patch = '      </div>\n    </div>\n\n  ';
        content = content.substring(0, heroIndex) + patch + content.substring(heroIndex);
        console.log('Re-applied mobileMenu fix');
    }
}

// 3. Remove Liquid Background for testing
content = content.replace(/class="liquid-bg/g, 'class="liquid-bg hidden');

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully cleaned public/index.html');
