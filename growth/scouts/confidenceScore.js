function confidenceScore(lead) {
  let score = 50; 
  
  if (lead.phone && (lead.phone.startsWith('05') || lead.phone.startsWith('+9665') || lead.phone.startsWith('9665'))) {
    score += 20;
  }
  if (lead.business && lead.business.length > 3) {
    score += 10;
  }
  if (lead.city) {
    score += 8;
  }
  
  return Math.min(score, 100);
}

module.exports = { confidenceScore };
