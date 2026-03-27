const axios = require('axios');
const FormData = require('form-data');

const OPENAI_KEY = process.env.OPENAI_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Download audio file from WhatsApp media API, then transcribe via OpenAI Whisper
async function transcribeAudio(mediaId) {
  try {
    // Step 1: Get media URL from WhatsApp
    const mediaRes = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`
        }
      }
    );
    const mediaUrl = mediaRes.data.url;

    // Step 2: Download audio bytes
    const audioRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    // Step 3: Send to OpenAI Whisper
    const form = new FormData();
    form.append('file', Buffer.from(audioRes.data), {
      filename: 'audio.ogg',
      contentType: 'audio/ogg'
    });
    form.append('model', 'whisper-1');

    const whisperRes = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          ...form.getHeaders()
        }
      }
    );

    return whisperRes.data.text || null;
  } catch (err) {
    console.error('[Audio] transcribeAudio error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { transcribeAudio };
