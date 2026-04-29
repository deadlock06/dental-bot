const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// Fix BS_MSGS property names to match the logic
content = content.replace(/phone_label:/g, 'phone:');
content = content.replace(/date_label:/g, 'date:');
content = content.replace(/slot_label:/g, 'slot:');

// Ensure b.phone, b.date, b.slot are called correctly in the switch block
// They seem to be called as b.phone(bsData.phone) etc. already.

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully fixed BS_MSGS property names');
