const fs = require('fs');
const buf = fs.readFileSync('bot.js');
let firstByte = -1;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] !== 0 && buf[i] !== 32) { // Not null, not space
    firstByte = i;
    break;
  }
}

if (firstByte === -1) {
  console.log('File is completely empty or nulls/spaces.');
} else {
  console.log('First non-null byte at index:', firstByte);
  console.log('Snippet of code starting there:');
  console.log(buf.slice(firstByte, firstByte + 100).toString('utf8'));
  
  // Create the cleaned version
  const cleaned = buf.slice(firstByte);
  fs.writeFileSync('bot_cleaned.js', cleaned);
  console.log('Saved cleaned version to bot_cleaned.js');
}
