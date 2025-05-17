console.log("--- Ingestion Worker: index.ts execution started ---");

import Redis from 'ioredis';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import prisma from '@/lib/prisma'; // USE PATH ALIAS NOW
import { config } from './config';
import { Readable } from 'stream';

console.log("--- About to require ytdl-core ---");
const ytdl: any = require('ytdl-core');
console.log("--- Successfully required ytdl-core ---");


// Define the structure of the job received from the Supabase trigger
interface IngestionJob {
  streamId: string;
  youtubeVideoId: string;
  submittedAt?: string; // Optional, from Supabase trigger
  languageTarget?: string; // Optional, if Supabase trigger starts including it
}

// Define the structure of the job to be sent to the GPU worker
interface GpuJob {
  streamId: string;
  audioStoragePath: string;
  audioPublicUrl: string;
  languageTarget: string;
  // Add youtubeVideoId if gpu-worker needs it for context, though it processes the audio directly
  // youtubeVideoId: string;
}

let inputRedisClient: Redis | null = null;
let outputRedisClient: Redis | null = null; // Could be the same instance if connecting to the same Redis
let supabase: SupabaseClient | null = null; // Typed SupabaseClient

let isShuttingDown = false;

function getInputRedisClient(): Redis {
  if (!inputRedisClient) {
    console.log('[IngestionWorker] Initializing Input Redis client...');
    inputRedisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      keepAlive: 1000 * 60,
      connectTimeout: 10000, // 10 seconds
      lazyConnect: true, // Connect on first command
    });
    inputRedisClient.on('connect', () => console.log('[IngestionWorker] Input Redis client: Connection established'));
    inputRedisClient.on('ready', () => console.log('[IngestionWorker] Input Redis client: Ready'));
    inputRedisClient.on('error', (err: Error) => console.error('[IngestionWorker] Input Redis client error:', err));
    inputRedisClient.on('close', () => console.log('[IngestionWorker] Input Redis client: Connection closed'));
    inputRedisClient.on('reconnecting', () => console.log('[IngestionWorker] Input Redis client: Reconnecting...'));
  }
  return inputRedisClient;
}

function getOutputRedisClient(): Redis {
  // If using the same Redis instance for input and output queues, this can be simplified.
  // For now, assuming they could be different or managed separately for clarity.
  if (!outputRedisClient) {
    console.log('[IngestionWorker] Initializing Output Redis client...');
    outputRedisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      keepAlive: 1000 * 60,
      connectTimeout: 10000,
      lazyConnect: true,
    });
    outputRedisClient.on('connect', () => console.log('[IngestionWorker] Output Redis client: Connection established'));
    outputRedisClient.on('ready', () => console.log('[IngestionWorker] Output Redis client: Ready'));
    outputRedisClient.on('error', (err: Error) => console.error('[IngestionWorker] Output Redis client error:', err));
    outputRedisClient.on('close', () => console.log('[IngestionWorker] Output Redis client: Connection closed'));
    outputRedisClient.on('reconnecting', () => console.log('[IngestionWorker] Output Redis client: Reconnecting...'));
  }
  return outputRedisClient;
}

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    console.log('[IngestionWorker] Initializing Supabase client...');
    supabase = createSupabaseClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false, // No need to persist sessions for server-to-server
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    });
  }
  return supabase;
}

async function updateStreamStatusInDB(streamId: string, status: string, details?: string): Promise<void> {
    console.log(`[IngestionWorker] Updating stream ${streamId} status to: ${status}` + (details ? ` - ${details}` : ''));
    try {
        // const supabaseClient = getSupabaseClient(); // Not using Supabase client directly for this DB update
        const updateData: any = { status: status }; // Prisma types will catch issues
        if (details) {
            // Ensure your Prisma schema for Stream has a 'details' or 'errorMessage' field if you want to store this.
            // updateData.details = details; 
        }

        await prisma.stream.update({
            where: { id: streamId },
            data: updateData,
        });
        console.log(`[IngestionWorker] Successfully updated stream ${streamId} status to ${status} in DB.`);

    } catch (dbUpdateError) {
        console.error(`[IngestionWorker] Critical error in updateStreamStatusInDB for ${streamId} via Prisma:`, dbUpdateError);
    }
}

async function processIngestionJob(job: IngestionJob): Promise<void> {
  console.log(`[IngestionWorker] Processing job for streamId: ${job.streamId}, youtubeVideoId: ${job.youtubeVideoId}`);
  await updateStreamStatusInDB(job.streamId, 'ingestion_started');

  try {
    console.log(`[IngestionWorker] Validating YouTube ID/URL: ${job.youtubeVideoId}`);
    if (!ytdl.validateID(job.youtubeVideoId) && !ytdl.validateURL(job.youtubeVideoId)) {
        throw new Error(`Invalid YouTube Video ID or URL provided: ${job.youtubeVideoId}`);
    }
    const videoId = ytdl.getVideoID(job.youtubeVideoId);
    console.log(`[IngestionWorker] Extracted YouTube Video ID: ${videoId}`);

    console.log(`[IngestionWorker] Fetching video info for ID: ${videoId}...`);
    const videoInfo = await ytdl.getInfo(videoId);
    const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
        quality: config.youtube.audioQuality as any, 
        filter: 'audioonly' as any
    });

    if (!audioFormat) {
      throw new Error('No suitable audio-only format found for the YouTube video.');
    }
    console.log(`[IngestionWorker] Chosen audio format:itag ${audioFormat.itag}, container ${audioFormat.container || 'unknown'}, mimeType ${audioFormat.mimeType}, approx duration ${videoInfo.videoDetails.lengthSeconds}s`);

    const supabaseClientInst = getSupabaseClient();
    const fileExtension = audioFormat.container || 'mp3'; // Default to mp3 if container is unknown
    const filePathInBucket = `public/${job.streamId}.${fileExtension}`;
    
    console.log(`[IngestionWorker] Starting audio download. Will buffer then upload to Supabase Storage: ${config.supabase.audioBucket}/${filePathInBucket}`);

    const audioReadableStream: Readable = ytdl(videoId, { format: audioFormat });

    const chunks: Buffer[] = [];
    for await (const chunk of audioReadableStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);
    console.log(`[IngestionWorker] Audio stream buffered. Total size: ${audioBuffer.length} bytes.`);

    const { data: uploadData, error: uploadError } = await supabaseClientInst.storage
      .from(config.supabase.audioBucket)
      .upload(filePathInBucket, audioBuffer, { 
        contentType: audioFormat.mimeType || 'audio/mpeg',
        upsert: true, 
      });

    if (uploadError) {
      throw new Error(`Supabase Storage upload error: ${uploadError.message}`);
    }
    if (!uploadData) {
        throw new Error('Supabase Storage upload returned no data.');
    }
    console.log(`[IngestionWorker] Audio uploaded successfully. Supabase path: ${uploadData.path}`);

    const expiresInSeconds = 60 * 60 * 24 * 7; // 7 days
    const { data: signedUrlData, error: signedUrlError } = await supabaseClientInst.storage
      .from(config.supabase.audioBucket)
      .createSignedUrl(filePathInBucket, expiresInSeconds);

    if (signedUrlError) {
      throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
    }
    if (!signedUrlData || !signedUrlData.signedUrl) {
        throw new Error('Failed to get signed URL for the uploaded audio (no data returned).');
    }
    const audioUrl = signedUrlData.signedUrl;
    console.log(`[IngestionWorker] Audio available at signed public URL (expires in 7 days): ${audioUrl}`);

    await updateStreamStatusInDB(job.streamId, 'ingestion_complete_audio_ready');

    const languageTarget = job.languageTarget || config.language.defaultTarget;

    const gpuJob: GpuJob = {
      streamId: job.streamId,
      audioStoragePath: filePathInBucket, // Ensure GpuJob interface in gpu-worker expects this
      audioPublicUrl: audioUrl,
      languageTarget: languageTarget,
      // youtubeVideoId: videoId, // Optionally pass videoId if gpu-worker needs it
    };

    const outputRedis = getOutputRedisClient();
    await outputRedis.lpush(config.redis.outputQueueName, JSON.stringify(gpuJob));
    console.log(`[IngestionWorker] Job for stream ${job.streamId} successfully published to GPU worker queue: ${config.redis.outputQueueName}`);

  } catch (error) {
    let errorMessage = 'Unknown error during ingestion process';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(`[IngestionWorker] Error processing ingestion job for stream ${job.streamId}:`, error);
    await updateStreamStatusInDB(job.streamId, 'ingestion_error', errorMessage);
  }
}

async function startPolling(): Promise<void> {
  const inputRedis = getInputRedisClient();
  console.log(`[IngestionWorker] Attempting to connect input Redis client for polling...`);
  await inputRedis.connect().catch(err => { 
      console.error("[IngestionWorker] Failed to connect input Redis for polling explicitly:", err);
  });

  if (inputRedis.status !== 'ready' && inputRedis.status !== 'connect') {
      console.log(`[IngestionWorker] Input Redis client not ready (status: ${inputRedis.status}). Waiting for ready event...`);
      await new Promise<void>((resolve, reject) => {
        inputRedis.once('ready', resolve);
        inputRedis.once('error', (err) => reject(new Error(`Input Redis client connection error before polling: ${err.message}`)) );
        setTimeout(() => reject(new Error('Timeout waiting for input Redis client to be ready')), 15000);
      }).catch(err => {
          console.error(err.message);
          process.exit(1); 
      });
  }
  console.log(`[IngestionWorker] Input Redis client ready (status: ${inputRedis.status}). Starting BRPOP loop on queue: ${config.redis.inputQueueName}.`);

  while (!isShuttingDown) {
    try {
      const result = await inputRedis.brpop(config.redis.inputQueueName, 0);
      if (isShuttingDown) {
        console.log('[IngestionWorker] Shutdown signal received during brpop wait, exiting loop.');
        if (result) { 
            console.log('[IngestionWorker] A job was popped during shutdown, it will not be processed by this instance.');
        }
        break;
      }
      if (result) {
        const jobString = result[1];
        console.log(`[IngestionWorker] Received job string from ${result[0]}: ${jobString.substring(0,200)}...`);
        try {
          const job: IngestionJob = JSON.parse(jobString);
          if (!job.streamId || !job.youtubeVideoId) {
            console.error('[IngestionWorker] Invalid ingestion job format received:', job);
            throw new Error('Invalid ingestion job format (missing streamId or youtubeVideoId).');
          }
          await processIngestionJob(job);
        } catch (parseError) {
          console.error('[IngestionWorker] Failed to parse or validate ingestion job JSON:', jobString, parseError);
        }
      }
    } catch (error) {
      if (isShuttingDown && (error as Error).message.includes('Connection is closed')) {
        console.log('[IngestionWorker] Redis connection closed during shutdown as expected.');
        break;
      }
      console.error('[IngestionWorker] Error during Redis BRPOP on input queue:', error);
      if (!isShuttingDown) {
        console.log(`[IngestionWorker] Waiting ${config.worker.pollingIntervalMs}ms before retrying BRPOP...`);
        await new Promise(resolve => setTimeout(resolve, config.worker.pollingIntervalMs));
      }
    }
  }
  console.log('[IngestionWorker] Polling loop stopped.');
}

function signalShutdownHandler() {
  if (isShuttingDown) return; 
  console.log('[IngestionWorker] Shutdown signal received. Preparing to stop polling...');
  isShuttingDown = true;

  const inputDisconnectPromise = inputRedisClient?.disconnect() || Promise.resolve();
  const outputDisconnectPromise = (outputRedisClient && outputRedisClient !== inputRedisClient)
    ? outputRedisClient.disconnect()
    : Promise.resolve();

  Promise.all([inputDisconnectPromise, outputDisconnectPromise])
    .then(() => console.log('[IngestionWorker] Redis clients disconnected gracefully.'))
    .catch(err => console.error('[IngestionWorker] Error during Redis client disconnection:', err))
    .finally(() => {
        console.log('[IngestionWorker] Shutdown complete. Exiting.');
        process.exit(0);
    });

  setTimeout(() => {
    console.warn('[IngestionWorker] Graceful shutdown timeout. Forcing exit.');
    process.exit(1);
  }, 10000); 
}

async function main() {
  console.log('[IngestionWorker] Starting up...');
  getInputRedisClient();
  getOutputRedisClient();
  getSupabaseClient(); 
  // Prisma client is now globally available via import

  try {
    await startPolling();
  } catch (pollingError) {
    console.error('[IngestionWorker] Polling failed to start or unhandled error in polling loop:', pollingError);
    signalShutdownHandler(); 
  }
}

process.on('SIGINT', signalShutdownHandler);
process.on('SIGTERM', signalShutdownHandler);

main().catch(err => {
  console.error('[IngestionWorker] Unhandled critical error in main execution:', err);
  if (!isShuttingDown) {
      signalShutdownHandler();
  } else {
      process.exit(1); 
  }
});
