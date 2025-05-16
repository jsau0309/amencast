        // websocket-server/src/config.ts
        import dotenv from 'dotenv';
        dotenv.config();

        export const config = {
          port: parseInt(process.env.PORT || '3000', 10),
          redis: {
            host: process.env.REDIS_HOST || 'localhost', // <-- Make sure this line exists
            port: parseInt(process.env.REDIS_PORT || '6379', 10), // <-- Make sure this line exists
            password: process.env.REDIS_PASSWORD || undefined, // <-- Make sure this line exists
            tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true', // <-- Make sure this line exists
            // url: process.env.REDIS_URL || 'redis://localhost:6379', // Old way, should be commented out or removed if you made the .env changes
            ingestionQueueName: process.env.REDIS_INGESTION_QUEUE_NAME || 'ingestion_jobs_queue',
            resultsQueueName: process.env.REDIS_RESULTS_QUEUE_NAME || 'translation_results_queue'
          }
        };

        