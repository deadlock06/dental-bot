const axios = require('axios');
const FormData = require('form-data');

const OPENAI_KEY = process.env.OPENAI_KEY;

// Supported audio formats by Whisper
const SUPPORTED_FORMATS = ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav',
  'audio/webm', 'audio/x-m4a', 'audio/flac', 'audio/opus', 'audio/aac',
  'audio/ogg; codecs=opus', 'video/ogg'];

// Max audio size: 25MB (Whisper limit)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

// Max retries for transient errors
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────
// Download audio from Twilio with retry
// ─────────────────────────────────────────────
async function downloadAudio(mediaUrl, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Audio] Download attempt ${attempt + 1}/${retries + 1}: ${mediaUrl}`);
      const res = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      });
      return res;
    } catch (err) {
      console.error(`[Audio] Download attempt ${attempt + 1} failed:`, err.message);
      if (attempt < retries) {
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        throw err;
      }
    }
  }
}

// ─────────────────────────────────────────────
// Transcribe audio via OpenAI Whisper with retry
// ─────────────────────────────────────────────
async function transcribeAudio(mediaUrl) {
  try {
    console.log('[Audio] Starting transcription for:', mediaUrl);

    // Step 1: Download audio bytes from Twilio
    const audioRes = await downloadAudio(mediaUrl);
    const audioBytes = audioRes.data.byteLength;
    const contentType = audioRes.headers['content-type'] || 'audio/ogg';
    console.log(`[Audio] Downloaded: ${audioBytes} bytes, type: ${contentType}`);

    // Step 2: Validate audio
    if (audioBytes === 0) {
      console.error('[Audio] Empty audio file — skipping');
      return null;
    }

    if (audioBytes > MAX_AUDIO_SIZE) {
      console.error(`[Audio] File too large (${(audioBytes / 1024 / 1024).toFixed(1)}MB > 25MB limit) — skipping`);
      return null;
    }

    // Determine file extension from content type
    const extMap = {
      'audio/ogg': 'ogg', 'audio/ogg; codecs=opus': 'ogg', 'video/ogg': 'ogg',
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4',
      'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/x-m4a': 'm4a',
      'audio/flac': 'flac', 'audio/opus': 'opus', 'audio/aac': 'aac'
    };
    const ext = extMap[contentType] || 'ogg';

    // Step 3: Send to OpenAI Whisper with retry
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const form = new FormData();
        form.append('file', Buffer.from(audioRes.data), {
          filename: `voice_note.${ext}`,
          contentType: contentType
        });
        form.append('model', 'whisper-1');
        // Hint both Arabic and English for bilingual support
        form.append('language', '');

        const whisperRes = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          form,
          {
            headers: {
              Authorization: `Bearer ${OPENAI_KEY}`,
              ...form.getHeaders()
            },
            timeout: 30000,
            maxContentLength: MAX_AUDIO_SIZE
          }
        );

        const text = whisperRes.data.text || null;
        console.log('[Audio] Transcription result:', text ? `"${text}" (${text.length} chars)` : 'null');

        // Filter out very short or meaningless transcriptions
        if (text && text.trim().length < 2) {
          console.log('[Audio] Transcription too short — ignoring');
          return null;
        }

        return text;
      } catch (err) {
        console.error(`[Audio] Whisper attempt ${attempt + 1} failed:`, err.response?.data || err.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    console.error('[Audio] All Whisper attempts failed');
    return null;
  } catch (err) {
    console.error('[Audio] transcribeAudio error:', err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Check if a content type is a supported audio format
// ─────────────────────────────────────────────
function isSupportedAudioFormat(contentType) {
  if (!contentType) return false;
  return SUPPORTED_FORMATS.some(fmt => contentType.startsWith(fmt.split(';')[0]));
}

module.exports = { transcribeAudio, isSupportedAudioFormat };
