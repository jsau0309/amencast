import Redis, { RedisOptions } from 'ioredis';
import { config } from './worker.config'; // Verified this path should be correct
import { promisify } from 'util';

let redisClient: Redis | null = null;
let isShuttingDown = false;
let pollingConnection: Redis | null = null; // Dedicated connection for BRPOP

export interface GpuJob {
  streamId: string;
  audioStoragePath: string; // Path in Supabase Storage, e.g., public/streamId.webm
  audioPublicUrl: string;   // Public URL to the audio file
  languageTarget: string;   // e.g., "es"
  // chunkId?: string; // Optional, if we implement chunking later
}

const redisOptions: RedisOptions = {
  // TLS is typically handled by the 'rediss://' protocol in the URL,
  // but adding an empty tls object can ensure it's considered.
  tls: {},
  // Keep alive settings
  keepAlive: 1000 * 30, // Send PING every 30 seconds
  // Retry strategy
  retryStrategy(times: number): number | null {
    if (isShuttingDown) {
      return null; // Don't retry if shutting down
    }
    const delay = Math.min(times * 100, 2000); // Exponential backoff up to 2 seconds
    console.log(`[RedisQueue] Retrying connection, attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 20, // Default, can be adjusted
  enableAutoPipelining: true, // Good for performance
  lazyConnect: true, // Connect only when a command is issued or .connect() is called
};

/**
 * Returns a singleton main Redis client, initializing or reinitializing the connection if necessary.
 *
 * @returns The main Redis client instance, ready for use.
 *
 * @remark If the client is not ready or does not exist, a new connection is established with event listeners for connection lifecycle events. Errors during connection are logged but not thrown.
 */
export async function getRedisClient(): Promise<Redis> {
  if (!redisClient || redisClient.status !== 'ready') {
    console.log('[RedisQueue] Initializing or re-initializing main Redis client...');
    if (redisClient && typeof redisClient.disconnect === 'function') {
      redisClient.disconnect();
    }
    redisClient = new Redis(config.redis.url, redisOptions);

    redisClient.on('connect', () => console.log('[RedisQueue] Main Redis client: Connection established'));
    redisClient.on('ready', () => console.log('[RedisQueue] Main Redis client: Ready'));
    redisClient.on('error', (err: Error) => console.error('[RedisQueue] Main Redis client error:', err));
    redisClient.on('close', () => console.log('[RedisQueue] Main Redis client: Connection closed'));
    redisClient.on('reconnecting', () => console.log('[RedisQueue] Main Redis client: Reconnecting...'));
    
    try {
      await redisClient.connect();
    } catch (err) {
      console.error('[RedisQueue] Failed to connect main Redis client during getRedisClient:', err);
      // Depending on desired behavior, you might throw here or let subsequent operations fail
    }
  }
  return redisClient;
}

/**
 * Returns a dedicated Redis client for blocking polling operations.
 *
 * Initializes or reinitializes the polling client if it does not exist or is not ready, attaching event listeners for connection lifecycle events. Throws an error if the client fails to connect.
 *
 * @returns The ready Redis client for polling.
 *
 * @throws {Error} If the polling Redis client fails to connect.
 */
async function getPollingRedisClient(): Promise<Redis> {
  if (!pollingConnection || pollingConnection.status !== 'ready') {
    console.log('[RedisQueue] Initializing or re-initializing polling Redis client...');
     if (pollingConnection && typeof pollingConnection.disconnect === 'function') {
      pollingConnection.disconnect();
    }
    pollingConnection = new Redis(config.redis.url, { ...redisOptions, connectionName: "gpu-worker-poller" }); // Separate connection for blocking

    pollingConnection.on('connect', () => console.log('[RedisQueue] Polling Redis client: Connection established'));
    pollingConnection.on('ready', () => console.log('[RedisQueue] Polling Redis client: Ready'));
    pollingConnection.on('error', (err: Error) => console.error('[RedisQueue] Polling Redis client error:', err));
    pollingConnection.on('close', () => console.log('[RedisQueue] Polling Redis client: Connection closed'));
    pollingConnection.on('reconnecting', () => console.log('[RedisQueue] Polling Redis client: Reconnecting...'));

    try {
      await pollingConnection.connect();
    } catch (err) {
      console.error('[RedisQueue] Failed to connect polling Redis client:', err);
      throw err; // Critical if polling client can't connect
    }
  }
  return pollingConnection;
}


/**
 * Continuously polls the Redis queue for GPU jobs and processes each job using the provided callback.
 *
 * @param processJobCallback - Asynchronous function to handle each valid {@link GpuJob} dequeued from Redis.
 *
 * @remark The polling loop runs until a shutdown signal is received. If a job is malformed or missing required fields, it is logged and not processed. Errors during polling or processing are logged, and the loop waits before retrying. The function exits cleanly on shutdown.
 */
export async function startPolling(processJobCallback: (job: GpuJob) => Promise<void>) {
  console.log(`[RedisQueue] Attempting to start polling on queue: ${config.redis.queueName}...`);
  
  const client = await getPollingRedisClient(); // Use dedicated polling client

  console.log(`[RedisQueue] Polling client status: ${client.status}. Polling on queue: ${config.redis.queueName}`);

  while (!isShuttingDown) {
    try {
      if (client.status !== 'ready') {
        console.warn(`[RedisQueue] Polling client not ready (status: ${client.status}). Waiting before next poll attempt...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s if not ready
        await client.connect().catch(err => console.error("[RedisQueue] Error reconnecting polling client:", err)); // Attempt to reconnect
        continue;
      }

      // BRPOP will wait for a job or timeout (0 means wait indefinitely)
      // Returns [queueName, jobString] or null if timeout (not applicable here with 0)
      const result = await client.brpop(config.redis.queueName, 0);

      if (result && result.length === 2) {
        const jobString = result[1];
        console.log(`[RedisQueue] Received job string from ${result[0]}: ${jobString.substring(0,200)}...`);
        try {
          const job = JSON.parse(jobString) as GpuJob;
          // Basic validation of the job structure
          if (job && job.streamId && job.audioStoragePath && job.audioPublicUrl && job.languageTarget) {
            await processJobCallback(job);
          } else {
            console.error('[RedisQueue] Invalid job structure received:', jobString);
            // Potentially move to a dead-letter queue or log for investigation
          }
        } catch (parseError) {
          console.error('[RedisQueue] Error parsing job JSON:', parseError, 'Job string:', jobString);
          // Potentially move to a dead-letter queue
        }
      } else if (isShuttingDown) {
        console.log('[RedisQueue] Polling loop interrupted by shutdown signal.');
        break;
      }
      // If brpop returns null and not shutting down, it's unexpected with timeout 0, but loop continues
    } catch (err) {
      console.error('[RedisQueue] Error during BRPOP or job processing:', err);
      if (isShuttingDown) {
        console.log('[RedisQueue] Error occurred during shutdown, breaking poll loop.');
        break;
      }
      // If Redis connection drops, client.status might not be 'ready'
      // The loop will check status and attempt reconnect/wait
      console.log('[RedisQueue] Waiting 5 seconds before retrying poll after error...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  console.log('[RedisQueue] Polling stopped.');
}

/**
 * Signals shutdown and disconnects both the polling and main Redis clients.
 *
 * Ensures that any ongoing blocking operations, such as BRPOP, are interrupted by disconnecting the polling client first. Clears client references after disconnecting.
 */
export async function signalShutdownAndDisconnect() {
  console.log('[RedisQueue] Shutdown signal received. Preparing to stop polling and disconnect clients...');
  isShuttingDown = true;

  // Attempt to disconnect the polling client first.
  // This might interrupt BRPOP if it's currently blocking.
  if (pollingConnection) {
    console.log('[RedisQueue] Disconnecting polling Redis client...');
    // Send a dummy command to interrupt BRPOP if necessary, or rely on disconnect.
    // Forcing an unblock can be tricky. `disconnect()` should eventually stop it.
    // Alternatively, publish a sentinel value to the queue.
    // Or, if ioredis supports it, a client.quit() on a duplicate connection.
    pollingConnection.disconnect();
    pollingConnection = null; // Clear reference
  }

  if (redisClient) {
    console.log('[RedisQueue] Disconnecting main Redis client...');
    redisClient.disconnect();
    redisClient = null; // Clear reference
  }
  console.log('[RedisQueue] Redis clients signaled to disconnect.');
}

// It might also be useful to have a function to enqueue jobs if this worker ever needs to do that,
// but for now, it's primarily a consumer.
// export async function enqueueGpuJob(job: GpuJob): Promise<void> {
//   const client = await getRedisClient(); // Use main client for writes
//   const jobString = JSON.stringify(job);
//   await client.lpush(config.redis.queueName, jobString); // Or your target queue for GPU jobs
//   console.log(`[RedisQueue] Enqueued job for stream ${job.streamId} to ${config.redis.queueName}`);
// }