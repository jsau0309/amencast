import axios, { AxiosError } from 'axios';
import { config } from '../worker.config';

const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * Converts Spanish text to speech using the ElevenLabs API.
 *
 * @param text - The Spanish text to synthesize.
 * @returns A Buffer containing the synthesized audio data, or null if synthesis fails.
 *
 * @throws {Error} If the ElevenLabs API key or voice ID is not configured.
 *
 * @remark Returns null if the input text is empty or if the API request fails.
 */
export async function synthesizeAudioElevenLabs(text: string): Promise<Buffer | null> {
  if (!text || text.trim() === '') {
    console.warn('Synthesize audio: called with empty text.');
    return null; // Or return an empty buffer if that's more appropriate downstream
  }

  if (!config.elevenlabs.apiKey || !config.elevenlabs.voiceId) {
    console.error('ElevenLabs API key or Voice ID is not configured.');
    throw new Error('ElevenLabs API key or Voice ID is not configured.');
  }

  const ttsUrl = `${ELEVENLABS_API_BASE_URL}/text-to-speech/${config.elevenlabs.voiceId}/stream`;
  // const ttsUrl = `${ELEVENLABS_API_BASE_URL}/text-to-speech/${config.elevenlabs.voiceId}`; // Non-streaming endpoint

  const requestBody = {
    text: text,
    model_id: 'eleven_multilingual_v2', // Or your preferred model
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0, // Set to a value between 0 and 1 for style exaggeration if using eleven_v2_turbo
      use_speaker_boost: true,
    },
    // Optimize for streaming latency, if using the /stream endpoint
    // optimize_streaming_latency: 4, // 0-4, 0 is default. Higher values for lower latency but potentially lower quality.
    // output_format: "mp3_44100_128" // default is mp3_44100_128. Other options: pcm_16000, etc.
  };

  try {
    console.log(`Requesting TTS from ElevenLabs for text: "${text.substring(0, 50)}..."`);
    const response = await axios.post(ttsUrl, requestBody, {
      headers: {
        'Accept': 'audio/mpeg', // Or other desired audio format
        'Content-Type': 'application/json',
        'xi-api-key': config.elevenlabs.apiKey,
      },
      responseType: 'arraybuffer', // Crucial for receiving audio data as a Buffer
    });

    if (response.status === 200 && response.data) {
      console.log('TTS audio received from ElevenLabs.');
      return Buffer.from(response.data);
    } else {
      console.warn(`ElevenLabs TTS request failed with status: ${response.status}, data: ${response.data}`);
      return null;
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      console.error(
        `ElevenLabs TTS API error: ${axiosError.response.status} - ` +
        `${JSON.stringify(axiosError.response.data, null, 2)}`
      );
    } else if (axiosError.request) {
      console.error('ElevenLabs TTS API error: No response received', axiosError.request);
    } else {
      console.error('ElevenLabs TTS API error: Request setup failed', axiosError.message);
    }
    return null;
  }
}

// Example Usage (for testing directly):
/*
async function testTTS() {
  console.log("Testing ElevenLabs TTS...");
  // Ensure your .env file in gpu-worker has ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID
  const textsToSynthesize = [
    "Hola Mundo. Esta es una prueba de la síntesis de voz.",
    "Porque de tal manera amó Dios al mundo, que ha dado á su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna."
  ];

  for (const text of textsToSynthesize) {
    const audioBuffer = await synthesizeAudioElevenLabs(text);
    if (audioBuffer) {
      console.log(`[TEXT]: ${text}
[AUDIO]: Received buffer of length ${audioBuffer.length}
---
`);
      // To save and play, you'd need fs operations, e.g.:
      // import fs from 'fs';
      // fs.writeFileSync(`test_tts_${Date.now()}.mp3`, audioBuffer);
    } else {
      console.log(`[TEXT]: ${text}
[AUDIO]: TTS failed.
---
`);
    }
  }
}

// testTTS();
*/
