function smartParser(text) {
  if (!text) return {};
  
  // Extract phone
  const phoneMatch = text.match(/(?:05|5|\+9665)[0-9]{8}/);
  const phone = phoneMatch ? phoneMatch[0] : null;
  
  // Split using commas
  const parts = text.split(/,|،/).map(p => p.trim()).filter(Boolean);
  
  let business = null;
  let city = null;
  
  const knownCities = ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'خبر', 'ابها', 'تبوك'];
  
  parts.forEach(part => {
    if (part === phone) return;
    if (knownCities.some(c => part.includes(c))) {
      city = part;
    } else if (!business && (part.includes('عيادة') || part.includes('مجمع') || part.includes('مركز') || part.includes('مستشفى') || part.length > 5)) {
      business = part;
    }
  });

  if (!business && parts.length > 0 && parts[0] !== phone) {
    business = parts[0];
  }

  let pain = 'bad_reviews';
  if (text.includes('استقبال')) pain = 'hiring_receptionist';
  if (text.includes('رد')) pain = 'slow_response';

  return { phone, business, city, pain };
}

module.exports = { smartParser };
