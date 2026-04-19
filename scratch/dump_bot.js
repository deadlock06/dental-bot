const fs = require('fs');
const buf = fs.readFileSync('bot.js');
console.log('Hex dump of first 50 bytes:');
console.log(buf.slice(0, 50).toString('hex'));
console.log('Text representation of first 50 bytes:');
console.log(buf.slice(0, 50).toString('utf8'));
