const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Check where waRedirect and dashPreview are used
const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('waRedirect') || l.includes('dashPreview') || l.includes('dsPatientName') || l.includes('dsDoctor')) {
    console.log((i+1) + ':', l.trim().substring(0, 100));
  }
});
