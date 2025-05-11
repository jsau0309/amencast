// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "https://esm.sh/@upstash/redis@1.30.0"; // Direct import for Deno

// console.log("stream-insert-trigger function invoked"); // Moved

// Define the expected structure of the incoming webhook payload for a new stream record
interface NewStreamPayload {
  type: "INSERT";
  table: string;
  schema: string;
  record: {
    id: string; // streamId
    youtube_video_id: string;
    // Add other fields if needed by the worker, but keep payload minimal
  };
  old_record: null | any;
}

serve(async (req: Request) => {
  console.log(`--- stream-insert-trigger invoked at ${new Date().toISOString()} --- Method: ${req.method}`); // New very first log
  try {
    console.log("Request received by stream-insert-trigger");

    // 1. Ensure it's a POST request (webhooks are usually POST)
    if (req.method !== "POST") {
      console.warn(`Invalid method: ${req.method}`);
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 2. Parse the incoming JSON payload from the webhook
    const payload = (await req.json()) as NewStreamPayload;
    console.log("Webhook payload:", JSON.stringify(payload, null, 2));

    // 3. Validate payload structure (basic validation)
    if (payload.type !== "INSERT" || !payload.record || !payload.record.id || !payload.record.youtube_video_id) {
      console.error("Invalid payload structure:", payload);
      return new Response("Invalid payload structure", { status: 400 });
    }

    // 4. Extract necessary details
    const streamId = payload.record.id;
    const youtubeVideoId = payload.record.youtube_video_id;
    console.log(`Processing stream: ${streamId}, YouTube ID: ${youtubeVideoId}`);

    // 5. Retrieve Upstash Redis credentials from environment variables
    // These must be set in the Supabase Edge Function settings in the dashboard
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

    if (!redisUrl || !redisToken) {
      console.error("Upstash Redis environment variables not set.");
      return new Response("Redis configuration error in function environment", { status: 500 });
    }

    // 6. Initialize Upstash Redis client
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    // 7. Prepare the message to be published
    const message = {
      streamId: streamId,
      youtubeVideoId: youtubeVideoId,
      // Add any other relevant info for the worker, e.g., timestamp
      submittedAt: new Date().toISOString(),
    };
    const redisQueueName = "stream-processing-queue"; // Name of your Redis list

    // 8. Publish the message to the Redis list (LPUSH to use as a queue)
    // LPUSH adds to the head, RPUSH to the tail. Workers typically RPOP or BRPOP from the other end.
    await redis.lpush(redisQueueName, JSON.stringify(message));
    console.log(`Message for stream ${streamId} published to Redis queue: ${redisQueueName}`);

    // 9. Return a success response
    return new Response(JSON.stringify({ success: true, message: "Stream data sent to processing queue" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in stream-insert-trigger function:", error);
    let errorMessage = "Internal Server Error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/stream-insert-trigger' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
