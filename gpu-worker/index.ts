import { startPolling, signalShutdown, GpuJob } from './queue';
import { config } from './worker.config';
import { PrismaClient } from '@prisma/client'; // For Supabase updates
import { spawn } from 'child_process';
import path from 'path';
import fsPromises from 'fs/promises'; // For async file operations like unlink, mkdtemp, writeFile
import fs from 'fs'; // For createReadStream
import os from 'os'; // For temp directory
import { findSpanishReference } from './bible/lookup';
import { translateTextGoogle, getOpenAIClient } from './translator/translate';
import { synthesizeAudioElevenLabs } from './tts/synthesize';
import { LiveKitTokenManager } from './livekitTokenManager';
import dotenv from 'dotenv';

// Load .env from gpu-worker directory for Prisma connection
const dotenvPath = path.resolve(__dirname, '../.env'); // Adjust if compiled output changes __dirname
dotenv.config({ path: dotenvPath });

// Prisma Client for DB Updates
// Ensure DATABASE_URL in gpu-worker/.env points to your Supabase instance
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

console.log('Starting GPU Worker...');
console.log('Configuration:', {
  // Avoid logging sensitive keys directly in production
  redis: { queueName: config.redis.queueName },
  worker: config.worker,
  isProduction: config.isProduction,
});

// Define the structure for transcript segments
interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// Function to run the transcription script
async function transcribeWithFasterWhisper(audioSource: string): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../whisper/transcribe.py');
    // In a container, ensure this path is correct and python executable is available
    const pythonExecutable = config.worker.pythonExecutablePath || 'python3';
    const args = [
      scriptPath,
      audioSource,
      '--model_size', config.worker.whisperModelSize,
      // Potentially add --device and --compute_type if available on RunPod and configured
    ];
    console.log(`Spawning Python script: ${pythonExecutable} ${args.join(' ')}`);
    const pythonProcess = spawn(pythonExecutable, args, {});
    
    let stdoutData = '';
    let stderrData = '';
    pythonProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { 
        stderrData += data.toString(); 
        console.error(`[FasterWhisper STDERR]: ${data.toString().trim()}`);
    });
    pythonProcess.on('error', (error) => {
      console.error('Failed to start FasterWhisper subprocess.', error);
      reject(new Error(`Failed to start FasterWhisper subprocess: ${error.message}`));
    });
    pythonProcess.on('close', (code) => {
      console.log(`FasterWhisper script exited with code ${code}`);
      if (code !== 0) {
        return reject(new Error(`FasterWhisper script exited with error code ${code}. STDERR: ${stderrData.trim()}`));
      }
      try {
        const result = JSON.parse(stdoutData);
        if (result && typeof result === 'object' && result.error) {
          return reject(new Error(`FasterWhisper script error: ${result.error}`));
        }
        if (!Array.isArray(result)) {
            throw new Error('FasterWhisper output was not a valid JSON array.');
        }
        resolve(result as TranscriptSegment[]);
      } catch (parseError) {
        console.error('Failed to parse JSON output from FasterWhisper script.', parseError);
        console.error('Raw STDOUT from FasterWhisper:', stdoutData);
        reject(new Error(`Failed to parse FasterWhisper output: ${parseError}`));
      }
    });
  });
}

async function transcribeWithOpenAIAPI(audioSourceUrl: string, streamId: string): Promise<TranscriptSegment[]> {
  console.log(`[${streamId}] Fallback: Attempting transcription with OpenAI Whisper API for: ${audioSourceUrl}`);
  let tempFilePath: string | null = null;
  let tempDir: string | undefined;
  try {
    console.log(`[${streamId}] Downloading audio for OpenAI API...`);
    const response = await fetch(audioSourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }
    const audioBuffer = await response.arrayBuffer();
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'amencast-audio-'));
    const extension = path.extname(new URL(audioSourceUrl).pathname) || '.tmp'; 
    tempFilePath = path.join(tempDir, `audio${extension}`);
    await fsPromises.writeFile(tempFilePath, Buffer.from(audioBuffer));
    console.log(`[${streamId}] Audio downloaded to temporary file: ${tempFilePath}`);

    const openai = getOpenAIClient();
    const fileReadStream = fs.createReadStream(tempFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: fileReadStream, // Use the ReadStream
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    console.log(`[${streamId}] OpenAI API transcription successful.`);
    
    if (transcription.segments && Array.isArray(transcription.segments)) {
        return transcription.segments.map((segment: any) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text.trim(),
        }));
    }
    console.warn(`[${streamId}] OpenAI API verbose_json did not contain expected segments structure.`);
    return [];

  } catch (error) {
    console.error(`[${streamId}] Error during OpenAI Whisper API transcription fallback:`, error);
    throw error;
  } finally {
    if (tempFilePath) {
      try {
        await fsPromises.unlink(tempFilePath);
        console.log(`[${streamId}] Cleaned up temporary audio file: ${tempFilePath}`);
        if (tempDir) {
          await fsPromises.rmdir(tempDir);
          console.log(`[${streamId}] Cleaned up temporary directory: ${tempDir}`);
        }
      } catch (cleanupError) {
        console.warn(`[${streamId}] Failed to clean up temporary audio resources:`, cleanupError);
      }
    }
  }
}

async function runTranscription(job: GpuJob): Promise<TranscriptSegment[]> {
    try {
        console.log(`[${job.streamId}] Attempting primary STT (FasterWhisper) for: ${job.audioUrl}`);
        return await transcribeWithFasterWhisper(job.audioUrl);
    } catch (fasterWhisperError) {
        console.warn(`[${job.streamId}] Primary STT (FasterWhisper) failed:`, fasterWhisperError);
        console.log(`[${job.streamId}] Attempting STT fallback with OpenAI Whisper API...`);
        try {
            return await transcribeWithOpenAIAPI(job.audioUrl, job.streamId);
        } catch (openAIError) {
            console.error(`[${job.streamId}] STT fallback (OpenAI Whisper API) also failed:`, openAIError);
            throw new Error('All STT methods failed.'); // Final error after all attempts
        }
    }
}

// Simple instance manager for LiveKitTokenManager to reuse if needed within a job context
let currentTokenManager: LiveKitTokenManager | null = null;
let currentTokenManagerStreamId: string | null = null;

function getTokenManager(streamId: string): LiveKitTokenManager {
    if (currentTokenManager && currentTokenManagerStreamId === streamId) {
        return currentTokenManager;
    }
    console.log(`[${streamId}] Initializing LiveKitTokenManager.`);
    currentTokenManager = new LiveKitTokenManager(streamId);
    currentTokenManagerStreamId = streamId;
    return currentTokenManager;
}

// Function to update stream status in DB
async function updateStreamStatus(streamId: string, status: string, details?: string) {
    try {
        await prisma.stream.update({
            where: { id: streamId },
            data: { 
                status: status,
                // Optionally add more details, e.g., an error message or last processed timestamp
                // ended_at: status === 'error' || status === 'ended' ? new Date() : undefined
            },
        });
        console.log(`[${streamId}] Status updated to: ${status}` + (details ? ` (${details})` : ''));
    } catch (dbError) {
        console.error(`[${streamId}] Failed to update stream status to ${status} in DB:`, dbError);
    }
}

// Updated placeholder for the actual job processing logic
async function processJob(job: GpuJob): Promise<void> {
  console.log(`[${job.streamId}] Processing job...`);
  await updateStreamStatus(job.streamId, 'processing');
  const tokenManager = getTokenManager(job.streamId);
  
  try {
    // 1. Run Transcription (STT)
    console.log(`[${job.streamId}] Starting transcription for audio: ${job.audioUrl}`);
    const transcriptSegments = await runTranscription(job);
    console.log(`[${job.streamId}] Transcription successful, received ${transcriptSegments.length} segments.`);

    if (transcriptSegments.length === 0) {
      console.log(`[${job.streamId}] No segments transcribed. Ending job processing.`);
      await updateStreamStatus(job.streamId, 'completed_empty', 'No audio segments found'); // Or 'error'
      return;
    }

    // Process segments one by one for now
    for (const segment of transcriptSegments) {
      console.log(`[${job.streamId}] Processing segment: "${segment.text.substring(0, 100)}..."`);
      let spanishText: string | null = null;

      // 2. Attempt Bible Lookup
      try {
        spanishText = await findSpanishReference(segment.text);
        if (spanishText) {
          console.log(`[${job.streamId}] Bible reference found and replaced: "${spanishText.substring(0,100)}..."`);
        }
      } catch (lookupError) {
        console.error(`[${job.streamId}] Error during Bible lookup for segment "${segment.text}":`, lookupError);
        // Continue to translation as a fallback
      }

      // 3. Translate if no Bible match found
      if (!spanishText) {
        console.log(`[${job.streamId}] No Bible reference found. Translating segment: "${segment.text.substring(0,100)}..."`);
        try {
          spanishText = await translateTextGoogle(segment.text);
          if (spanishText) {
            console.log(`[${job.streamId}] Translation successful: "${spanishText.substring(0,100)}..."`);
          } else {
            console.warn(`[${job.streamId}] Translation returned null or empty for segment: "${segment.text}"`);
            // Skip TTS for this segment if translation failed
            continue; 
          }
        } catch (translationError) {
          console.error(`[${job.streamId}] Error during translation for segment "${segment.text}":`, translationError);
          // Skip TTS for this segment if translation failed
          continue; 
        }
      }

      // 4. Synthesize TTS for the Spanish text
      if (spanishText) {
        console.log(`[${job.streamId}] Synthesizing audio for: "${spanishText.substring(0,100)}..."`);
        try {
          const audioBuffer = await synthesizeAudioElevenLabs(spanishText);
          if (audioBuffer) {
            console.log(`[${job.streamId}] TTS successful. Audio buffer length: ${audioBuffer.length}`);
            
            // Get LiveKit token and log placeholder for publishing
            try {
              // Optional: Check if room exists if API tier doesn't guarantee it
              // if (!(await tokenManager.roomExists())) {
              //   console.error(`[${job.streamId}] LiveKit Room ${job.streamId} does not exist. Cannot publish.`);
              //   continue; // Skip trying to publish to this segment
              // }
              const publishingToken = await tokenManager.getPublishingToken();
              console.log(`[${job.streamId}] Publishing token: ${publishingToken.substring(0,20)}...`); // Log part of token
              console.log(`[${job.streamId}] TODO: Implement actual audio publishing (e.g., WHIP) with this token and buffer.`);
              // publishAudioWithWHIP(publishingToken, audioBuffer, job.streamId, segment.start);

            } catch (tokenError) {
              console.error(`[${job.streamId}] Failed to get LiveKit publishing token:`, tokenError);
            }

          } else {
            console.warn(`[${job.streamId}] TTS returned null buffer for text: "${spanishText}"`);
          }
        } catch (ttsError) {
          console.error(`[${job.streamId}] Error during TTS for text "${spanishText}":`, ttsError);
        }
      }
      // Small delay between segments to avoid hitting rate limits too quickly if any
      await new Promise(resolve => setTimeout(resolve, 200)); 
    } // End segment loop
    await updateStreamStatus(job.streamId, 'completed_success'); // Mark as completed successfully

  } catch (error: any) {
    console.error(`[${job.streamId}] Critical error processing job:`, error);
    await updateStreamStatus(job.streamId, 'error', error.message || 'Unknown critical error');
  }

  console.log(`[${job.streamId}] Finished processing job.`);
}

// Main execution function
async function main() {
  // Start polling the queue and pass the job processing function
  try {
    await prisma.$connect();
    console.log('Prisma client connected to Supabase for worker.');
    await startPolling(processJob);
  } catch(err) {
    console.error("Failed to connect prisma or start polling", err);
    process.exit(1);
  } finally {
    // await prisma.$disconnect(); // Disconnect moved to signalShutdown or end of main if needed
  }
  console.log('Polling stopped. Worker shutting down.');
}

async function shutdownHandler() {
  console.log('Starting graceful shutdown...');
  signalShutdown(); // Signals the polling loop to stop
  await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for loop to stop
  await prisma.$disconnect();
  console.log('Prisma client disconnected during shutdown.');
  process.exit(0);
}

process.on('SIGINT', shutdownHandler);
process.on('SIGTERM', shutdownHandler);

main().catch(error => {
  console.error('Unhandled error in main worker function:', error);
  prisma.$disconnect().finally(() => process.exit(1));
});
