require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');

const SERVER_PORT = process.env.PORT || 10000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

console.log(`Exotel ↔ ElevenLabs bridge listening on ws://0.0.0.0:${SERVER_PORT}`);

async function textToSpeech(text) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    console.error('ElevenLabs TTS error:', error.message);
    return null;
  }
}

const wss = new WebSocket.Server({ port: SERVER_PORT });

wss.on('connection', (ws) => {
  console.log('Connected to Exotel');

  ws.on('message', async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.warn('Non-JSON message received:', msg.toString());
      return;
    }

    if (!data.event) return;

    switch (data.event) {
      case 'connected':
        console.log(' Exotel WebSocket connected');
        break;

      case 'start':
        console.log('Call started:', data.start.call_sid);
        break;

      case 'media':
        console.log(`Received audio chunk ${data.media.chunk}`);
        const audioBase64 = await textToSpeech('Hello, how can I assist you today?');
        if (audioBase64) {
          const response = {
            event: "media",
            stream_sid: data.stream_sid,
            sequence_number: data.sequence_number + 1,
            media: {
              chunk: data.media.chunk + 1,
              timestamp: `${parseInt(data.media.timestamp) + 100}`,
              payload: audioBase64
            }
          };
          ws.send(JSON.stringify(response));
          console.log('Sent response audio to Exotel');
        }
        break;

      case 'dtmf':
        console.log(`DTMF received: ${data.dtmf.digit}`);
        break;

      case 'stop':
        console.log('Call ended');
        break;

      default:
        console.log('Unknown event:', data.event);
    }
  });

  ws.on('close', () => {
    console.log('Exotel WebSocket disconnected');
  });

  ws.on('error', (err) => {
    console.error(' WebSocket error:', err);
  });
});
