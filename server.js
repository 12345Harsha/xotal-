require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 9000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

let sequence = 1;

const wss = new WebSocket.Server({ port: PORT }, () =>
  console.log(`🚀 Exotel ↔ ElevenLabs bridge listening on ws://0.0.0.0:${PORT}`)
);

wss.on('connection', (ws) => {
  console.log('✅ Connected to Exotel');

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.event === 'media') {
      const audioRaw = Buffer.from(msg.media.payload, 'base64');

      // Save audio chunk to file
      const rawPath = `/tmp/in_audio_${Date.now()}.raw`;
      const wavPath = `/tmp/in_audio_${Date.now()}.wav`;

      fs.writeFileSync(rawPath, audioRaw);

      // Convert raw to wav using ffmpeg
      await new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
          '-f', 's16le',
          '-ar', '8000',
          '-ac', '1',
          '-i', rawPath,
          wavPath
        ]);
        ffmpeg.on('close', resolve);
      });

      const speechResponse = await axios({
        method: 'POST',
        url: `https://api.elevenlabs.io/v1/speech-to-speech/${ELEVENLABS_VOICE_ID}`,
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'audio/wav'
        },
        data: fs.readFileSync(wavPath),
        responseType: 'arraybuffer'
      });

      const resRaw = Buffer.from(speechResponse.data);

      // Convert ElevenLabs audio to 8kHz SLIN for Exotel
      const outputPath = `/tmp/out_${Date.now()}.raw`;

      await new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', '-',
          '-f', 's16le',
          '-ar', '8000',
          '-ac', '1',
          '-acodec', 'pcm_s16le',
          outputPath
        ]);
        ffmpeg.stdin.write(resRaw);
        ffmpeg.stdin.end();
        ffmpeg.on('close', resolve);
      });

      const finalRaw = fs.readFileSync(outputPath);
      const base64Out = finalRaw.toString('base64');

      ws.send(JSON.stringify({
        event: 'media',
        sequence_number: sequence++,
        stream_sid: msg.stream_sid,
        media: {
          chunk: msg.media.chunk + 1,
          timestamp: msg.media.timestamp + 100,
          payload: base64Out
        }
      }));

      console.log('📤 Sent audio back to Exotel');
    }
  });

  ws.on('close', () => {
    console.log('🔌 Exotel connection closed');
  });
});
