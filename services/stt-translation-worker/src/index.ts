import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import OpenAI from 'openai'; // Import OpenAI
import axios from 'axios'; // Import axios for downloading audio
import fs from 'fs'; // For file operations if saving audio temporarily
import path from 'path'; // For path operations
import os from 'os'; // For temporary directory
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Import Supabase
import { Readable } from 'stream'; // Import Readable

console.log('[GPWorker] Starting up...');

// Define the structure of the job received from ingestion-worker
interface GpuJob {
  streamId: string;
  audioPublicUrl: string; // URL to the audio file in Supabase Storage
  languageTarget: string;
  audioStoragePath?: string; // Optional storage path in Supabase
}

// Define the structure of the result to be sent back to websocket-server
interface TranslationResult {
  streamId: string;
  status: 'success' | 'error';
  translatedText?: string;
  sourceText?: string; // Added for debugging or more complete result
  finalAudioUrl?: string;
  errorMessage?: string;
}

const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
};
if (config.redis.password) redisOptions.password = config.redis.password;

if (config.redis.tlsEnabled) {
  redisOptions.tls = {}; // Just an empty object
}
const inputRedisClient = new Redis(redisOptions);
const outputRedisClient = new Redis(redisOptions); // Can use the same options if same Redis instance

let openai: OpenAI | null = null;
let supabase: SupabaseClient | null = null; // Declare Supabase client variable

let isShuttingDown = false;

/**
 * Initializes Redis, OpenAI, and Supabase clients for the STT worker service.
 *
 * Sets up event listeners for Redis client connections and errors, configures third-party service clients if credentials are provided, and establishes Redis connections.
 *
 * @throws {Error} If connecting to either Redis client fails.
 */
async function initializeClients() {
  console.log('[GPWorker] Initializing Redis clients...');
  inputRedisClient.on('connect', () => console.log('[GPWorker] Input Redis connected.'));
  inputRedisClient.on('error', (err) => console.error('[GPWorker] Input Redis error:', err));
  outputRedisClient.on('connect', () => console.log('[GPWorker] Output Redis connected.'));
  outputRedisClient.on('error', (err) => console.error('[GPWorker] Output Redis error:', err));

  if (config.openai.apiKey) {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
    console.log('[GPWorker] OpenAI client configured.');
  } else {
    console.warn('[GPWorker] OpenAI API Key not found. Transcription and Translation will fail.');
  }


  if (config.supabase.url && config.supabase.serviceRoleKey) {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    });
    console.log('[GPWorker] Supabase client configured.');
  } else {
    console.warn('[GPWorker] Supabase URL or Service Role Key not found. Audio upload will fail.');
  }

  await Promise.all([
    inputRedisClient.connect().catch(err => { console.error('[GPWorker] Failed to connect Input Redis:', err); throw err; }),
    outputRedisClient.connect().catch(err => { console.error('[GPWorker] Failed to connect Output Redis:', err); throw err; })
  ]);
  console.log('[GPWorker] All Redis clients initialized successfully.');
}

/**
 * Processes a GPU translation job by transcribing, translating, and synthesizing audio, then uploads the result and publishes the outcome.
 *
 * Downloads the source audio file, performs speech-to-text transcription using OpenAI Whisper, translates the transcription to the target language with OpenAI GPT, and synthesizes the translated text into speech using ElevenLabs TTS. The synthesized audio is uploaded to Supabase Storage, and a signed URL is generated for access. The function then publishes the processing result, including any errors, to the output Redis queue.
 *
 * @param job - The GPU job containing stream ID, source audio URL, and target language for translation.
 *
 * @remark
 * Throws an error if required clients (OpenAI, ElevenLabs, Supabase) are not initialized, or if any step in the processing pipeline fails. Cleans up temporary files and directories after processing.
 */
async function processGpuJob(job: GpuJob): Promise<void> {
  console.log(`[GPWorker] Processing GpuJob for streamId: ${job.streamId}, audioUrl: ${job.audioPublicUrl}`);
  let processingResult: TranslationResult = {
    streamId: job.streamId,
    status: 'error', // Default to error
    errorMessage: 'Processing did not complete.'
  };
  let tempDir: string | null = null;
  let temporaryAudioPath: string | null = null;
  let temporaryTtsPath: string | null = null;

  try {
    if (!openai) throw new Error('OpenAI client not initialized.');
    if (!elevenlabs) throw new Error('ElevenLabs client not initialized.');
    if (!supabase) throw new Error('Supabase client not initialized. Cannot upload final audio.');

    // 1. Download audio
    console.log(`[GPWorker] Downloading audio from: ${job.audioPublicUrl}`);
    const audioResponse = await axios({ method: 'get', url: job.audioPublicUrl, responseType: 'stream' });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amencast-gpu-'));
    const inputAudioFileName = `input-${job.streamId}${path.extname(new URL(job.audioPublicUrl).pathname) || '.webm'}`;
    temporaryAudioPath = path.join(tempDir, inputAudioFileName);
    const writer = fs.createWriteStream(temporaryAudioPath);
    audioResponse.data.pipe(writer);
    await new Promise<void>((resolve, reject) => { 
      writer.on('finish', () => resolve()); 
      writer.on('error', reject); 
    });
    console.log(`[GPWorker] Audio downloaded to: ${temporaryAudioPath}`);

    // 2. STT
    console.log(`[GPWorker] Performing STT on: ${temporaryAudioPath}`);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(temporaryAudioPath),
      model: 'whisper-1',
    });
    const sourceText = transcription.text;
    console.log(`[GPWorker] STT successful for ${job.streamId}`);

    // 3. MT
    console.log(`[GPWorker] Translating text to ${job.languageTarget} for ${job.streamId}`);
    const translationResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `Translate to ${job.languageTarget}.` },
        { role: 'user', content: sourceText }
      ],
      temperature: 0.3,
    });
    const translatedText = translationResponse.choices[0]?.message?.content?.trim();
    if (!translatedText) throw new Error('OpenAI translation returned empty content.');
    console.log(`[GPWorker] Translation successful for ${job.streamId}`);

    // 4. TTS
    console.log(`[GPWorker] Performing TTS for ${job.streamId} with voice ${config.elevenlabs.voiceId}`);
    const outputTtsFileName = `translated-${job.streamId}.mp3`;
    temporaryTtsPath = path.join(tempDir!, outputTtsFileName);

    const ttsResponse = await elevenlabs!.textToSpeech.convertAsStream(config.elevenlabs.voiceId, {
        text: translatedText!,
        model_id: 'eleven_multilingual_v2',
    });
    console.log('[GPWorker] ElevenLabs TTS response received. Type:', typeof ttsResponse, 'Is it a stream?', ttsResponse instanceof Readable);
    
    const ttsFileWriter = fs.createWriteStream(temporaryTtsPath!);

    console.log('[GPWorker] Iterating ElevenLabs TTS response...');
    let chunkCount = 0;
    let successfullyWroteChunks = false;
    for await (const chunk of (ttsResponse as AsyncIterable<any>)) {
        chunkCount++;
        if (chunk instanceof Buffer || chunk instanceof Uint8Array) {
            ttsFileWriter.write(chunk);
            successfullyWroteChunks = true;
        } else {
            // Log the first unexpected chunk type once for diagnostics
            if (chunkCount === 1) { 
                console.warn(`[GPWorker] ElevenLabs TTS stream chunk type is unexpected (chunk #1 Type: ${typeof chunk}). Attempting Buffer.from(). Details:`, chunk);
            }
            try {
                ttsFileWriter.write(Buffer.from(chunk as any)); 
                successfullyWroteChunks = true;
            } catch (conversionError) {
                console.error(`[GPWorker] Failed to convert chunk to Buffer and write. Chunk #${chunkCount}. Skipping. Error:`, conversionError);
                // Decide if this should be a fatal error for the job
            }
        }
    }

    if (chunkCount === 0) {
        console.warn('[GPWorker] ElevenLabs TTS stream iterable was empty. No data written to file.');
        // Consider this an error if an audio file is expected
        throw new Error("ElevenLabs TTS returned no audio data."); 
    }
    if (!successfullyWroteChunks && chunkCount > 0) {
        // This means all chunks were of an unhandled type that also failed Buffer.from()
        throw new Error("ElevenLabs TTS data chunks could not be processed into a file.");
    }

    ttsFileWriter.end();

    await new Promise<void>((resolve, reject) => {
        ttsFileWriter.on('finish', resolve);
        ttsFileWriter.on('error', (err) => {
            console.error('[GPWorker] Error writing TTS file from iterated chunks:', err);
            reject(err);
        });
    });

    console.log(`[GPWorker] TTS successful. Synthesized audio at: ${temporaryTtsPath}`);

    // 5. Supabase Upload
    const supabaseFilePath = `translated-audio/${job.streamId}/${outputTtsFileName}`;
    if (!fs.existsSync(temporaryTtsPath)) {
        throw new Error(`TTS output file not found at ${temporaryTtsPath} before Supabase upload.`);
    }
    const audioFileBuffer = fs.readFileSync(temporaryTtsPath);
    console.log(`[GPWorker] Uploading translated audio to Supabase: ${config.supabase.translatedAudioBucket}/${supabaseFilePath}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(config.supabase.translatedAudioBucket)
      .upload(supabaseFilePath, audioFileBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });
    if (uploadError) throw new Error(`Supabase Storage upload error for translated audio: ${uploadError.message}`);
    if (!uploadData) throw new Error('Supabase Storage upload for translated audio returned no data.');
    console.log(`[GPWorker] Translated audio uploaded. Supabase path: ${uploadData.path}`);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(config.supabase.translatedAudioBucket)
      .createSignedUrl(supabaseFilePath, 60 * 60 * 24);
    if (signedUrlError) throw new Error(`Failed to create signed URL for translated audio: ${signedUrlError.message}`);
    if (!signedUrlData || !signedUrlData.signedUrl) throw new Error('Failed to get signed URL for translated audio.');
    const finalAudioUrl = signedUrlData.signedUrl;
    console.log(`[GPWorker] Translated audio available at signed URL: ${finalAudioUrl}`);

    processingResult = {
      streamId: job.streamId,
      status: 'success',
      sourceText: sourceText,
      translatedText: translatedText,
      finalAudioUrl: finalAudioUrl,
    };
    console.log(`[GPWorker] Successfully processed GpuJob for streamId: ${job.streamId}`);

  } catch (error: any) {
    console.error(`[GPWorker] Error processing GpuJob for streamId ${job.streamId}:`, error);
    processingResult.status = 'error'; 
    processingResult.errorMessage = error.message || 'Unknown error during GPU processing';
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[GPWorker] Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.error(`[GPWorker] Error cleaning up temporary directory ${tempDir} for stream ${job.streamId}:`, cleanupError);
      }
    }
  }

  try {
    await outputRedisClient.lpush(config.redis.outputQueueName, JSON.stringify(processingResult));
    console.log(`[GPWorker] Published result for streamId ${job.streamId} to queue: ${config.redis.outputQueueName}`);
  } catch (redisError) {
    console.error(`[GPWorker] CRITICAL: Failed to publish result for streamId ${job.streamId} to Redis:`, redisError);
  }
}

/**
 * Continuously polls the input Redis queue for audio translation jobs and processes each job sequentially.
 *
 * @remark Exits the polling loop gracefully when a shutdown is signaled.
 */
async function startPolling(): Promise<void> {
  console.log(`[GPWorker] Input Redis client ready. Starting BRPOP loop on queue: ${config.redis.inputQueueName}.`);
  while (!isShuttingDown) {
    try {
      const result = await inputRedisClient.brpop(config.redis.inputQueueName, 0); // 0 = block indefinitely
      if (isShuttingDown && !result) break; // Exit if shutting down and no job was popped
      if (result) {
        const jobString = result[1];
        console.log(`[GPWorker] Received job string from ${result[0]}: ${jobString.substring(0, 200)}...`);
        try {
          const job: GpuJob = JSON.parse(jobString);
          if (!job.streamId || !job.audioPublicUrl || !job.languageTarget) {
            console.error('[GPWorker] Invalid GpuJob format received:', job);
            throw new Error('Invalid GpuJob format.');
          }
          await processGpuJob(job); // Process one job at a time for now
        } catch (parseError) {
          console.error('[GPWorker] Failed to parse or validate GpuJob JSON:', jobString, parseError);
          // Consider sending an error result back if you can extract streamId, or to a dead-letter queue
        }
      }
    } catch (error: any) {
      if (isShuttingDown && error.message.includes('Connection is closed')) {
        console.log('[GPWorker] Redis connection closed during shutdown as expected.');
        break;
      }
      console.error('[GPWorker] Error during Redis BRPOP on input queue:', error);
      if (!isShuttingDown) {
        console.log('[GPWorker] Waiting 5 seconds before retrying BRPOP...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  console.log('[GPWorker] Polling loop stopped.');
}

/**
 * Handles graceful shutdown of the GPU worker service upon receiving a termination signal.
 *
 * Initiates disconnection of Redis clients, logs shutdown progress, and forces process exit if shutdown does not complete within 10 seconds.
 *
 * @remark If Redis clients are not disconnected within the timeout, the process exits with a nonzero status.
 */
function signalShutdownHandler() {
  if (isShuttingDown) return;
  console.log('[GPWorker] Shutdown signal received. Preparing to stop polling...');
  isShuttingDown = true;

  const disconnectPromises = [];
  if (inputRedisClient.status === 'ready' || inputRedisClient.status === 'connect') {
    disconnectPromises.push(inputRedisClient.disconnect());
  }
  if (outputRedisClient.status === 'ready' || outputRedisClient.status === 'connect') {
    if (outputRedisClient !== inputRedisClient) { // Avoid disconnecting same instance twice
        disconnectPromises.push(outputRedisClient.disconnect());
    }
  }
  
  Promise.all(disconnectPromises)
    .then(() => console.log('[GPWorker] Redis clients disconnected gracefully.'))
    .catch(err => console.error('[GPWorker] Error during Redis client disconnection:', err))
    .finally(() => {
      console.log('[GPWorker] Shutdown complete. Exiting.');
      process.exit(0);
    });

  setTimeout(() => {
    console.warn('[GPWorker] Graceful shutdown timeout. Forcing exit.');
    process.exit(1);
  }, 10000);
}

/**
 * Initializes all required clients and starts the GPU worker polling loop.
 *
 * Handles critical errors during startup or polling by triggering a graceful shutdown or forcing process exit if already shutting down.
 */
async function main() {
  try {
    await initializeClients();
    await startPolling();
  } catch (error) {
    console.error('[GPWorker] Critical error during startup or in main polling loop:', error);
    if (!isShuttingDown) signalShutdownHandler(); // Attempt graceful shutdown
    else process.exit(1);
  }
}

process.on('SIGINT', signalShutdownHandler);
process.on('SIGTERM', signalShutdownHandler);

main();