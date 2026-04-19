function classifyPhone(phone) {
  if (!phone) return { isValid: false, isMobile: false, normalized: null };
  const cleaned = phone.replace(/\D/g, '');
  let normalized = cleaned;
  if (cleaned.startsWith('0')) normalized = '966' + cleaned.substring(1);
  if (!normalized.startsWith('966')) normalized = '966' + cleaned;

  const isMobile = /^9665[0-9]{8}$/.test(normalized);
  const isLandline = /^9661[0-9]{8}$/.test(normalized);

  return {
    isValid: isMobile || isLandline,
    isMobile,
    isLandline,
    normalized: '+' + normalized
  };
}

module.exports = { classifyPhone };
