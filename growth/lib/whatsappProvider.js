/**
 * WhatsApp Provider Router
 * Switches between Twilio (free/sandbox) and 360dialog (Pro clients)
 */

const twilio = require('twilio');
const axios = require('axios');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Send WhatsApp message via appropriate provider
 * @param {string} phone - E.164 format (+9665XXXXXXXX)
 * @param {string} message - Message text
 * @param {Object} config - Clinic configuration
 * @param {string} config.whatsapp_provider - 'twilio' or '360dialog'
 * @param {string} config.dialog_api_key - 360dialog API key (if using)
 */
async function sendWhatsApp(phone, message, config = {}) {
  const provider = config.whatsapp_provider || 'twilio';
  
  // Validate phone format
  if (!phone.startsWith('+966')) {
    return {
      success: false,
      error: 'Invalid Saudi phone format. Must be +9665XXXXXXXX',
      provider: 'none'
    };
  }
  
  // Route to appropriate provider
  if (provider === '360dialog' && config.dialog_api_key) {
    return send360dialog(phone, message, config.dialog_api_key);
  }
  
  // Default: Twilio sandbox
  return sendTwilio(phone, message);
}

async function sendTwilio(phone, message) {
  try {
    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM, // whatsapp:+14155238886
      to: `whatsapp:${phone}`,
      body: message
    });
    
    return {
      success: true,
      provider: 'twilio',
      sid: result.sid,
      status: result.status,
      dateSent: result.dateCreated,
      cost: 'sandbox' // No cost in sandbox
    };
    
  } catch (error) {
    console.error('[Twilio] Send failed:', error.message);
    
    // Specific error handling
    if (error.code === 21608) {
      return {
        success: false,
        error: 'Sandbox limit reached (50 msg/day) or number not joined',
        provider: 'twilio',
        code: error.code
      };
    }
    
    if (error.code === 21211) {
      return {
        success: false,
        error: 'Invalid phone number format',
        provider: 'twilio',
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error.message,
      provider: 'twilio',
      code: error.code
    };
  }
}

async function send360dialog(phone, message, apiKey) {
  try {
    const response = await axios.post(
      'https://waba.360dialog.io/v1/messages',
      {
        to: phone.replace('+', ''), // 9665XXXXXXXX format
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'D360-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    return {
      success: true,
      provider: '360dialog',
      messageId: response.data.messages?.[0]?.id,
      status: 'sent',
      cost: 'included_in_plan' 
    };
    
  } catch (error) {
    console.error('[360dialog] Send failed:', error.response?.data || error.message);
    
    // Fallback to Twilio if 360dialog fails and fallback is enabled
    if (process.env.FALLBACK_TO_TWILIO === 'true') {
      console.log('[360dialog] Falling back to Twilio...');
      return sendTwilio(phone, message);
    }
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      provider: '360dialog',
      fallbackAttempted: process.env.FALLBACK_TO_TWILIO === 'true'
    };
  }
}

/**
 * Check if a phone is registered on WhatsApp (basic check)
 */
async function checkWhatsAppPresence(phone) {
  const isValidFormat = /^\+9665[0-9]{8}$/.test(phone);
  
  return {
    validFormat: isValidFormat,
    likelyActive: isValidFormat, 
    checkMethod: 'format_validation'
  };
}

module.exports = {
  sendWhatsApp,
  sendTwilio,
  send360dialog,
  checkWhatsAppPresence
};
