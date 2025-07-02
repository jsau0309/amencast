console.log("--- Ingestion Worker: index.ts execution started ---");

import Redis from 'ioredis';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
// import prisma from '../../lib/prisma';
import { config } from './config';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import http from 'http';
import express, { Request, Response } from 'express';


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

interface InitiateStreamRequestBody {
  youtubeUrl: string;
  streamId: string;
}

let inputRedisClient: Redis | null = null;
let outputRedisClient: Redis | null = null; // Could be the same instance if connecting to the same Redis
let supabase: SupabaseClient | null = null; // Typed SupabaseClient

let isShuttingDown = false;

function streamYouTubeAudioAsPcm(youtubeUrl: string, streamId: string): Readable {
  console.log(`[IngestionWorker] Starting yt-dlp and ffmpeg pipe for streamId ${streamId}. URL: ${youtubeUrl}`);

  // Spawn yt-dlp to download and pipe to stdout
  const ytdlp = spawn('yt-dlp', [
    youtubeUrl,
    '-f', 'bestaudio', // Get the best audio-only format
    '-o', '-'          // Output to stdout
  ]);

  // Spawn ffmpeg to transcode from stdin
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',    // Input from stdin
    '-f', 's16le',     // Output format: signed 16-bit PCM, little-endian
    '-ar', '16000',    // Output sample rate: 16000 Hz
    '-ac', '1',        // Output audio channels: 1 (mono)
    '-'                // Output to stdout
  ]);

  // Pipe yt-dlp's output directly to ffmpeg's input
  ytdlp.stdout.pipe(ffmpeg.stdin);

  // Log errors from both processes for debugging
  ytdlp.stderr.on('data', (data) => {
    console.log(`[IngestionWorker] yt-dlp stderr for ${streamId}: ${data.toString()}`);
  });
  ytdlp.on('exit', (code) => {
    if (code !== 0) {
        console.error(`[IngestionWorker] yt-dlp process for ${streamId} exited with code ${code}.`);
    }
  });

  ffmpeg.stderr.on('data', (data) => {
    console.log(`[IngestionWorker] ffmpeg stderr for ${streamId}: ${data.toString()}`);
  });
  ffmpeg.on('exit', (code) => {
    if (code !== 0) {
        console.error(`[IngestionWorker] ffmpeg process for ${streamId} exited with code ${code}.`);
    }
  });

  // Handle errors during process spawning
  ytdlp.on('error', (err) => {
    console.error(`[IngestionWorker] Failed to start yt-dlp process for ${streamId}:`, err);
    ffmpeg.stdout.destroy(err);
  });
  ffmpeg.on('error', (err) => {
      console.error(`[IngestionWorker] Failed to start ffmpeg process for ${streamId}:`, err);
      ffmpeg.stdout.destroy(err);
  });

  return ffmpeg.stdout;
}

/**
 * Lazily initializes and returns the singleton Redis client for the input queue.
 *
 * @returns The Redis client instance used for polling ingestion jobs.
 *
 * @remark The client is initialized only once and reused for subsequent calls.
 */
function getInputRedisClient(): Redis {
  if (!inputRedisClient) {
    console.log('[IngestionWorker] Initializing Input Redis client...');
    inputRedisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      username: 'default',
      password: config.redis.password,
      tls: config.redis.tlsEnabled ? {} : undefined,
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

/**
 * Lazily initializes and returns the singleton Redis client for the output queue.
 *
 * @returns The Redis client instance used for output queue operations.
 *
 * @remark The client is initialized only once and reused for subsequent calls.
 */
function getOutputRedisClient(): Redis {
  // If using the same Redis instance for input and output queues, this can be simplified.
  // For now, assuming they could be different or managed separately for clarity.
  if (!outputRedisClient) {
    console.log('[IngestionWorker] Initializing Output Redis client...');
    outputRedisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      username: 'default',
      password: config.redis.password,
      tls: config.redis.tlsEnabled ? {} : undefined,
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

/**
 * Lazily initializes and returns a singleton Supabase client configured for server-to-server operations.
 *
 * @returns The Supabase client instance.
 */
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

/**
 * Updates the status of a stream in the database.
 *
 * If provided, additional details may be included in the update, depending on schema support.
 *
 * @param streamId - The unique identifier of the stream to update.
 * @param status - The new status to set for the stream.
 * @param details - Optional additional information about the status update.
 */
async function updateStreamStatusInDB(streamId: string, status: string, details?: string): Promise<void> {
    console.log(`[IngestionWorker] Updating stream ${streamId} status to: ${status}` + (details ? ` - ${details}` : ''));
    try {
        // const supabaseClient = getSupabaseClient(); // Not using Supabase client directly for this DB update
        const updateData: any = { status: status }; // Prisma types will catch issues
        if (details) {
            // Ensure your Prisma schema for Stream has a 'details' or 'errorMessage' field if you want to store this.
            // updateData.details = details; 
        }

        // await prisma.stream.update({
        //     where: { id: streamId },
        //     data: updateData,
        // });
        console.log(`[IngestionWorker] Successfully updated stream ${streamId} status to ${status} in DB.`);

    } catch (dbUpdateError) {
        console.error(`[IngestionWorker] Critical error in updateStreamStatusInDB for ${streamId} via Prisma:`, dbUpdateError);
    }
}

/**
 * Processes an ingestion job by downloading audio from a YouTube video, uploading it to Supabase Storage, updating the stream status in the database, and enqueuing a GPU processing job.
 *
 * @param job - The ingestion job containing the stream ID, YouTube video ID or URL, and optional language target.
 *
 * @throws {Error} If the YouTube video ID or URL is invalid, if no suitable audio format is found, if uploading to Supabase Storage fails, or if generating a signed URL fails.
 */
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

/**
 * Continuously polls the Redis input queue for ingestion jobs, processes each job, and handles shutdown signals gracefully.
 *
 * Waits for the input Redis client to be ready, then enters a blocking loop using BRPOP to receive jobs. Each job is parsed and validated before being processed. Handles errors and shutdown events to ensure clean exit and robust operation.
 *
 * @remark Exits the polling loop immediately if a shutdown signal is received, even if a job is received during shutdown.
 */
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

/**
 * Handles process termination signals by initiating a graceful shutdown.
 *
 * Disconnects Redis clients, logs shutdown progress, and forces process exit if shutdown does not complete within 10 seconds.
 */
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

/**
 * Initializes clients and starts the ingestion worker polling loop.
 *
 * Sets up Redis and Supabase clients, then begins polling for ingestion jobs. Handles unhandled errors by triggering a graceful shutdown.
 */
async function main() {
  console.log('[IngestionWorker] Starting up...');
  getInputRedisClient();
  getOutputRedisClient();
  getSupabaseClient(); 
  // Prisma client is now globally available via import

  // Setup Express server
  const app = express();
  const PORT = process.env.INGESTION_WORKER_PORT || 3002; 
  app.use(express.json());

  app.post('/initiate-stream-processing', async (req: Request<{}, {}, InitiateStreamRequestBody>, res: Response): Promise<void> => {
    const { youtubeUrl, streamId } = req.body;

    if (!youtubeUrl || !streamId) {
      console.error('[IngestionWorker] /initiate-stream-processing: Missing youtubeUrl or streamId in request.');
      res.status(400).json({ error: 'Missing youtubeUrl or streamId' });
      return;
    }

    console.log(`[IngestionWorker] /initiate-stream-processing: Received request for streamId: ${streamId}, url: ${youtubeUrl}`);

    try {
      const pcmAudioStream = streamYouTubeAudioAsPcm(youtubeUrl, streamId);
      
      const websocketServerUrl = process.env.WEBSOCKET_SERVER_URL;
      if (!websocketServerUrl) {
        throw new Error("WEBSOCKET_SERVER_URL is not set in environment variables.");
      }
      
      const targetUrl = `${websocketServerUrl}/internal/audio-stream/${streamId}`;
      const parsedUrl = new URL(targetUrl);

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      };

      console.log(`[IngestionWorker] /initiate-stream-processing: Piping PCM audio for ${streamId} to ws-server at ${targetUrl}`);
      const upstreamHttpRequest = http.request(options, (upstreamRes) => {
        let responseBody = '';
        upstreamRes.on('data', (chunk) => responseBody += chunk);
        upstreamRes.on('end', () => {
          console.log(`[IngestionWorker] /initiate-stream-processing: Upstream POST to websocket-server for ${streamId} completed with status ${upstreamRes.statusCode}. Body: ${responseBody}`);
          if (upstreamRes.statusCode !== 200) {
            console.error(`[IngestionWorker] /initiate-stream-processing: Error response from websocket-server for ${streamId}: ${upstreamRes.statusCode}`);
            if (!pcmAudioStream.destroyed) {
              pcmAudioStream.destroy();
            }
          }
        });
      });
      upstreamHttpRequest.on('error', (e) => {
        console.error(`[IngestionWorker] /initiate-stream-processing: Problem with upstream HTTP POST for ${streamId}: ${e.message}`);
        if (!upstreamHttpRequest.destroyed) {
          upstreamHttpRequest.destroy(e);
        }
      });
      pcmAudioStream.pipe(upstreamHttpRequest);
      pcmAudioStream.on('end', () => {
        console.log(`[IngestionWorker] /initiate-stream-processing: pcmAudioStream for ${streamId} ended. Upstream HTTP request should complete.`);
      });
      pcmAudioStream.on('close', () => {
        console.log(`[IngestionWorker] /initiate-stream-processing: pcmAudioStream for ${streamId} has been closed.`);
        if(!upstreamHttpRequest.destroyed) {
            upstreamHttpRequest.end();
        }
      });
      res.status(202).json({ message: 'Stream processing initiated', streamId: streamId });
    } catch (error: any) {
      console.error(`[IngestionWorker] /initiate-stream-processing: Error processing stream ${streamId}:`, error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initiate stream processing', details: error.message });
        return;
      }
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // START THE HTTP SERVER *BEFORE* THE BLOCKING POLLING LOOP
  app.listen(PORT, () => {
    console.log(`[IngestionWorker] HTTP server listening on port ${PORT}`);
  });
  // END OF Express server setup

  // Now, decide on startPolling(). If it's for a different type of job, it can run.
  // If this HTTP endpoint is the new primary way, you might not need startPolling for this worker.
  try {
    // If startPolling is essential for other tasks and non-blocking, or you want it to run:
    // await startPolling(); 
    // OR if it's meant to run in parallel and is non-blocking, just call it:
    // startPolling(); 
    // For now, to ensure HTTP server starts, let's comment it out or make it non-blocking
    console.log('[IngestionWorker] Skipping startPolling() for now to ensure HTTP server is primary.');
    // await startPolling(); // Or simply remove if not needed for this new flow
  } catch (pollingError: any) {
    console.error('[IngestionWorker] Polling failed to start or unhandled error in polling loop:', pollingError);
    // signalShutdownHandler(); // Decide if this is fatal
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
