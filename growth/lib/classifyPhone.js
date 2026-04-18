/**
 * Saudi Phone Classifier
 * Distinguishes mobile (personal) from landline (clinic)
 */

function classifyPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  
  // Saudi mobile: +966 5X XXXX XXXX (10 digits after 966)
  if (/^9665[0-9]{8}$/.test(cleaned)) {
    return {
      type: 'mobile',
      isMobile: true,
      isLandline: false,
      isPersonal: true,      // Assumption: mobile = personal owner phone
      isClinicLine: false,
      provider: 'saudi_mobile',
      region: 'national',
      confidence: 0.95
    };
  }
  
  // Saudi landlines by region
  const landlineRegions = {
    '9661': { region: 'Riyadh', name: 'الرياض' },
    '9662': { region: 'Makkah', name: 'مكة المكرمة' },
    '9663': { region: 'Eastern', name: 'المنطقة الشرقية' },
    '9664': { region: 'Madinah', name: 'المدينة المنورة' },
    '9667': { region: 'Tabuk', name: 'تبوك' },
    '9668': { region: 'Northern', name: 'الحدود الشمالية' }
  };
  
  const prefix = cleaned.substring(0, 4);
  if (landlineRegions[prefix]) {
    return {
      type: 'landline',
      isMobile: false,
      isLandline: true,
      isPersonal: false,     // Landline = clinic reception
      isClinicLine: true,
      provider: 'saudi_landline',
      region: landlineRegions[prefix].region,
      regionName: landlineRegions[prefix].name,
      confidence: 0.90
    };
  }
  
  // Unknown pattern
  return {
    type: 'unknown',
    isMobile: false,
    isLandline: false,
    isPersonal: false,
    isClinicLine: false,
    provider: 'unknown',
    region: 'unknown',
    confidence: 0.50
  };
}

function isValidSaudiMobile(phone) {
  const classification = classifyPhone(phone);
  return classification.isMobile && classification.confidence > 0.90;
}

module.exports = { classifyPhone, isValidSaudiMobile };
