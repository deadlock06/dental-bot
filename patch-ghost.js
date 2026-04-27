const fs = require('fs');
let ghost = fs.readFileSync('growth/ghost-room.html', 'utf8');
ghost = ghost.replace(/href="https:\/\/wa\.me\/[0-9]+"/g, 'href="#" onclick="parent.qdChat.toggle(); return false;"');
fs.writeFileSync('growth/ghost-room.html', ghost);
console.log('Fixed ghost-room.html');
