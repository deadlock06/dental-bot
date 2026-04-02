const axios = require('axios');
const FormData = require('form-data');

const OPENAI_KEY = process.env.OPENAI_KEY;

// Twilio sends MediaUrl0 — a direct HTTPS URL (basic-auth protected with Twilio credentials)
async function transcribeAudio(mediaUrl) {
  try {
    console.log('[Audio] Downloading from Twilio URL:', mediaUrl);

    // Step 1: Download audio bytes (Twilio requires basic auth)
    const audioRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    });

    console.log('[Audio] Downloaded bytes:', audioRes.data.byteLength);

    // Step 2: Send to OpenAI Whisper
    const form = new FormData();
    form.append('file', Buffer.from(audioRes.data), {
      filename: 'audio.ogg',
      contentType: audioRes.headers['content-type'] || 'audio/ogg'
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

    const text = whisperRes.data.text || null;
    console.log('[Audio] Transcription:', text);
    return text;
  } catch (err) {
    console.error('[Audio] transcribeAudio error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { transcribeAudio };
