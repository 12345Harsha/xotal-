require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');

const PORT = process.env.PORT || 10000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const server = new WebSocket.Server({ port: PORT });
console.log(`🚀 Exotel ↔ ElevenLabs bridge listening on ws://0.0.0.0:${PORT}`);

server.on('connection', (ws) => {
  console.log('✅ Connected to Exotel');

  ws.on('message', async (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.warn('⚠️ Non-JSON message received:', message.toString());
      return;
    }

    switch (data.event) {
      case 'connected':
        console.log('🔌 WebSocket connected');
        break;

      case 'start':
        console.log('🔔 Call started. From:', data.start?.from, '→ To:', data.start?.to);
        break;

      case 'media':
        console.log('🎙 Received audio chunk');
        const audioBuffer = Buffer.from(data.media.payload, 'base64');

        // Optional: Save or forward this buffer to ElevenLabs
        // Placeholder: Respond back with static voice (fake flow for now)
        const ttsBuffer = await generateSpeechFromElevenLabs("Hello, how can I help you?");
        const base64TTS = ttsBuffer.toString('base64');

        ws.send(JSON.stringify({
          event: 'media',
          stream_sid: data.stream_sid,
          media: {
            payload: base64TTS,
            chunk: data.media.chunk,
            timestamp: data.media.timestamp
          }
        }));
        break;

      case 'dtmf':
        console.log('🎹 DTMF input:', data.dtmf?.digit);
        break;

      case 'stop':
        console.log('🛑 Call stopped. Reason:', data.stop?.reason);
        break;

      default:
        console.log('📩 Unknown event received:', data.event);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Exotel connection closed');
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err);
  });
});

// 🔊 ElevenLabs TTS: Generate speech audio buffer
async function generateSpeechFromElevenLabs(text) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    return Buffer.from(response.data);
  } catch (err) {
    console.error('❌ ElevenLabs TTS error:', err.message || err);
    return Buffer.alloc(0);
  }
}
