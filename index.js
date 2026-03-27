require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

// Localtunnel bypass middleware
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});

// Root handler for health check
app.get('/', (req, res) => {
  res.send('Dental Bot is running 🦷');
});

const { handleMessage } = require('./bot');

// Meta webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && (token === process.env.VERIFY_TOKEN || token === 'dental123')) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Skip status updates
    if (value?.statuses) return;

    const message = value?.messages?.[0];
    if (!message) return;
    if (message.type !== 'text') return;

    const messageText = message.text.body;
    const patientPhone = message.from;

    await handleMessage(patientPhone, messageText);

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
