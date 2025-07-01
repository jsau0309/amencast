import { AssemblyAI } from 'assemblyai';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'node:stream';
import { config } from './config'; // Use centralized config

// --- IMPORTANT ---
// Please replace this with the actual path to a test audio file (e.g., a .wav or .mp3)
// For best results with the real-time service, use a 16kHz mono WAV file.
const AUDIO_FILE_PATH = path.resolve(__dirname, './test-audio.wav'); 
// -----------------

if (!config.assemblyai.apiKey) {
  console.error('Error: ASSEMBLYAI_API_KEY is not set in the environment variables.');
  console.error('Please add it to your services/gpu-worker/.env file.');
  process.exit(1);
}

// After the check, TypeScript knows the key is a string.
const assemblyAiApiKey = config.assemblyai.apiKey;

if (!fs.existsSync(AUDIO_FILE_PATH)) {
    console.error(`Error: Audio file not found at: ${AUDIO_FILE_PATH}`);
    console.error('Please update the AUDIO_FILE_PATH variable in this script.');
    process.exit(1);
}

const main = async () => {
  const client = new AssemblyAI({
    apiKey: assemblyAiApiKey,
  });

  console.log('Attempting to connect to AssemblyAI...');

  const transcriber = client.realtime.transcriber({
    sampleRate: 16000, // The sample rate of your audio file
  });

  transcriber.on('open', ({ sessionId }) => {
    console.log(`[STATUS] Session opened with ID: ${sessionId}`);
  });

  transcriber.on('error', (error: Error) => {
    console.error('[ERROR]', error);
  });

  transcriber.on('close', (code: number, reason: string) => {
    console.log(`[STATUS] Session closed: ${code} ${reason}`);
  });

  // Listen for the final transcript
  transcriber.on('transcript.final', (transcript) => {
    if (transcript.text) {
        console.log(`[TRANSCRIPT] ${transcript.text}`);
    }
  });

  try {
    await transcriber.connect();
    console.log('[STATUS] Connection successful.');

    // Create a Node.js Readable stream from the file
    const nodeReadable = fs.createReadStream(AUDIO_FILE_PATH);
    
    // Convert the Node.js stream to a Web ReadableStream using the static method
    const webReadable = Readable.toWeb(nodeReadable);

    console.log(`[STATUS] Piping audio stream to AssemblyAI...`);

    // Pipe the web-compatible stream to the AssemblyAI transcriber's stream
    await webReadable.pipeTo(transcriber.stream());
    
    console.log('[STATUS] Audio stream sent completely.');
    await transcriber.close();

  } catch (error) {
    console.error('[ERROR] An error occurred:', error);
    // Attempt to close the connection on error
    if (transcriber) {
        await transcriber.close();
    }
  }
};

main(); 