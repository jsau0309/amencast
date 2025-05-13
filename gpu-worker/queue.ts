import Redis from 'ioredis';
import { config } from './worker.config';
import { promisify } from 'util';

let redisClient: Redis | null = null;
let isShuttingDown = false; // Flag to signal shutdown

// Interface for the job payload (align with the plan)
export interface GpuJob {
  streamId: string;
  audioUrl: string;
  languageTarget: string;
  chunkId?: string; // Optional based on plan
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    console.log('Initializing Redis client...');
    try {
      // ioredis automatically handles the username/password in the URL
      redisClient = new Redis(config.redis.url, {
        // Add other ioredis options here if needed, e.g.:
        // maxRetriesPerRequest: 3,
        // enableReadyCheck: true,
        // Keep alive settings can be important for long-running workers
        keepAlive: 1000 * 60, // Send ping every 60 seconds
        // TLS configuration might be needed depending on Upstash setup, but often handled by 'rediss://' protocol
        // tls: {
        //   rejectUnauthorized: false // Use cautiously, investigate proper CA validation
        // }
      });

      redisClient.on('connect', () => {
        console.log('Redis client connected');
      });

      redisClient.on('ready', () => {
        console.log('Redis client ready');
      });

      redisClient.on('error', (err) => {
        console.error('Redis client error:', err);
        // Optionally implement reconnection logic or shutdown
      });

      redisClient.on('close', () => {
        console.log('Redis client connection closed');
      });

      redisClient.on('reconnecting', () => {
        console.log('Redis client reconnecting...');
      });

      redisClient.on('end', () => {
        console.log('Redis client connection ended');
      });

    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      process.exit(1); // Exit if Redis connection fails initially
    }
  }
  return redisClient;
}

// Function to start polling the queue
export async function startPolling(processJobCallback: (job: GpuJob) => Promise<void>) {
  console.log(`Starting polling on queue: ${config.redis.queueName}...`);
  const client = getRedisClient();

  // Ensure client is ready before starting to poll
  await new Promise<void>((resolve) => {
    if (client.status === 'ready') {
      resolve();
    } else {
      client.once('ready', resolve);
    }
  });
  console.log('Redis client ready, starting BRPOP loop.');

  while (!isShuttingDown) {
    try {
      // Use BRPOP to wait for a job. Timeout 0 means wait indefinitely.
      // BRPOP returns an array [queueName, jobString] or null on timeout (if > 0)
      const result = await client.brpop(config.redis.queueName, 0);

      if (result && !isShuttingDown) {
        const jobString = result[1];
        console.log(`Received job string: ${jobString}`);
        try {
          const job: GpuJob = JSON.parse(jobString);
          // Basic validation
          if (!job.streamId || !job.audioUrl || !job.languageTarget) {
            throw new Error('Invalid job format received');
          }
          console.log('Parsed job:', job);
          // Call the provided callback to process the job
          await processJobCallback(job);
        } catch (parseError) {
          console.error('Failed to parse or validate job:', jobString, parseError);
          // Decide how to handle bad jobs (e.g., move to a dead-letter queue)
        }
      } else if (isShuttingDown) {
        console.log('Shutdown signal received during brpop, exiting loop.');
        break;
      }
    } catch (error) {
      console.error('Error during Redis BRPOP:', error);
      // Implement backoff strategy before retrying
      if (!isShuttingDown) {
        console.log('Waiting 5 seconds before retrying BRPOP...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  console.log('Polling loop stopped.');
}

// Function to signal shutdown
export function signalShutdown() {
  console.log('Received shutdown signal.');
  isShuttingDown = true;
  // Attempt to break the BRPOP loop if possible
  // This might require a separate connection to push a dummy message or closing the connection
  if (redisClient && redisClient.status !== 'end') {
    console.log('Disconnecting Redis client to interrupt BRPOP...');
    // Disconnecting might abruptly end the brpop
    redisClient.disconnect(); 
  }
}

// Optional: Function to gracefully disconnect
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis client disconnected gracefully');
  }
}

// Optional: Promisify commands if needed, though ioredis often returns promises
// export const brpopAsync = promisify(getRedisClient().brpop).bind(getRedisClient());
// export const blpopAsync = promisify(getRedisClient().blpop).bind(getRedisClient());
