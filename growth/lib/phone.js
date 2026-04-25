/**
 * Centralized utility for phone normalization
 */

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  let cleaned = rawPhone.replace(/\D/g, '');
  // Saudi specific standardizations
  if (cleaned.startsWith('05')) {
    cleaned = '966' + cleaned.substring(1);
  }
  // Guarantee leading +
  return '+' + cleaned;
}

function getAdminPhone() {
  const rawAdmin = process.env.ADMIN_PHONE || '966570733834';
  return normalizePhone(rawAdmin);
}

module.exports = {
  normalizePhone,
  getAdminPhone
};
