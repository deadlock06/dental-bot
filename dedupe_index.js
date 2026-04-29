const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// Find all instances of "BENTO SIMULATOR ENGINE"
const marker = 'BENTO SIMULATOR ENGINE';
let firstIndex = content.indexOf(marker);
let secondIndex = content.indexOf(marker, firstIndex + 1);

if (firstIndex !== -1 && secondIndex !== -1) {
    console.log('Detected duplicate BENTO SIMULATOR ENGINE blocks');
    
    // The first block is roughly from 1871 to 2131
    // Let's find the script tags around them
    const scriptStart = content.lastIndexOf('<script>', firstIndex);
    const scriptEnd = content.indexOf('</script>', firstIndex);
    
    if (scriptStart !== -1 && scriptEnd !== -1) {
        const firstBlock = content.substring(scriptStart, scriptEnd + 9);
        console.log('Removing first simulator block...');
        content = content.replace(firstBlock, '<!-- REMOVED DUPLICATE SIMULATOR BLOCK -->');
    }
}

// Check for any other redeclarations of bsStep
if (content.split('let bsStep').length > 2) {
    console.log('Still seeing multiple bsStep declarations, cleaning up...');
    // Replace only the first few instances if they are duplicates
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully de-duplicated index.html');
