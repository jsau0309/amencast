# AmenCast Real-Time Translation - Step-by-Step Implementation Plan

This document outlines a detailed, phased approach to implementing the real-time translation feature, with specific testing steps at each stage.

## Phase 0: Prerequisites & Setup

**Goal:** Prepare the development environment and foundational services.

1.  **Environment Setup:**
    *   Ensure all relevant services (`ingestion-worker`, `websocket-server`, `gpu-worker`) can be run locally.
    *   Verify access to necessary APIs: OpenAI (Whisper, GPT), ElevenLabs.
    *   Set up API keys and necessary environment variables in each service.
2.  **Redis Setup (Pub/Sub):**
    *   Ensure Redis is running and accessible by `websocket-server` and `gpu-worker`.
    *   Familiarize team with Redis Pub/Sub commands and client libraries (e.g., `ioredis` for Node.js).
    *   **Testing:**
        *   Manually publish a test message to a Redis channel from one terminal.
        *   Manually subscribe to that channel in another terminal and verify message receipt.

## Phase 1: Audio Ingestion & Raw Chunk Broadcasting

**Goal:** `ingestion-worker` extracts audio from YouTube, sends it to `websocket-server`, which then chunks it and publishes to Redis.

1.  **`ingestion-worker`: YouTube Audio Extraction & Streaming**
    *   **Task:** Modify/Ensure `ingestion-worker` can take a YouTube URL (livestream or VOD).
    *   Use `yt-dlp` to get the direct audio stream URL.
    *   Use `ffmpeg` to:
        *   Connect to the audio stream.
        *   Transcode to raw PCM format (`pcm_s16le`, 16000 Hz, 1 channel).
        *   Stream this raw PCM data to an HTTP endpoint on `websocket-server` (e.g., `POST /internal/audio-stream/<streamId>`). This might involve piping `ffmpeg` stdout.
    *   The `initiate_youtube_translation` event received by `websocket-server` (from frontend via `/api/streams`) should trigger the `ingestion-worker` to start this process for the given `streamId`. (Mechanism: `websocket-server` calls an internal API on `ingestion-worker`, or `ingestion-worker` listens to a Redis command).
    *   **Testing:**
        *   Manually trigger `ingestion-worker` with a YouTube URL.
        *   Verify `ffmpeg` starts without errors.
        *   Mock the `websocket-server` endpoint and verify it receives a stream of bytes. Log the first few bytes to confirm format if possible.
        *   Test with both VOD and a live YouTube stream if available.

2.  **`websocket-server`: Receive Raw Audio, Chunk, & Publish to Redis**
    *   **Task:**
        *   Create the internal HTTP endpoint (e.g., `/internal/audio-stream/<streamId>`) to receive raw PCM data from `ingestion-worker`.
        *   Buffer the incoming audio data.
        *   Implement chunking logic:
            *   Chunk size: 1.5 seconds of audio (1.5s * 16000Hz * 2 bytes/sample = 48000 bytes).
            *   Overlap: 0.5 seconds of audio (0.5s * 16000Hz * 2 bytes/sample = 16000 bytes).
            *   Each chunk sent to Redis should be 1.5s, with the subsequent chunk starting 1s after the previous one (due to 0.5s overlap).
        *   For each chunk, publish it to Redis Pub/Sub channel: `audio_chunks:<streamId>`. The message payload should be the raw audio bytes.
    *   **Testing:**
        *   Use a tool like `curl` or a simple script to send sample raw PCM data (can be a small local file) to the new endpoint on `websocket-server`.
        *   In a Redis client, subscribe to `audio_chunks:*` or a specific `audio_chunks:<test_streamId>`.
        *   Verify that audio chunks are being published to Redis.
        *   Verify the byte size of the published chunks (should be approx. 48000 bytes).
        *   Log timestamps of chunk creation to roughly verify timing.

## Phase 2: `gpu-worker` - Speech-to-Text (STT)

**Goal:** `gpu-worker` receives audio chunks from Redis and transcribes them using Whisper API.

1.  **`gpu-worker`: Subscribe to Redis & Basic Processing**
    *   **Task:** Modify `gpu-worker` to subscribe to Redis Pub/Sub channel pattern `audio_chunks:*`.
    *   On receiving a message, extract the `streamId` from the channel name and the audio data (raw bytes) from the message.
    *   **Testing:**
        *   Manually publish a sample audio chunk (as raw bytes) to an `audio_chunks:<test_streamId>` channel using a Redis client.
        *   Verify `gpu-worker` logs indicate it received the chunk and correctly identifies the `streamId` and audio data.

2.  **`gpu-worker`: STT with Whisper API**
    *   **Task:** For each received audio chunk:
        *   Send the audio data to OpenAI Whisper API for transcription. Ensure the API is called with appropriate parameters for raw PCM data if supported, or handle necessary format wrapping.
        *   Log the `streamId` and the transcribed text received from Whisper.
    *   **Testing:**
        *   Use the setup from Phase 1 to stream a short, clear audio clip from YouTube (e.g., a news report).
        *   Monitor `gpu-worker` logs.
        *   Verify that transcribed text appears in the logs for the correct `streamId`.
        *   Compare the logged transcription against the actual audio content for accuracy.
        *   Test with a silent audio portion to see Whisper's output (likely empty or minimal).

## Phase 3: `gpu-worker` - Translation (GPT API)

**Goal:** `gpu-worker` translates the transcribed text using GPT.

1.  **`gpu-worker`: Translate Transcribed Text**
    *   **Task:** Take the transcribed text (output from Whisper STT in Phase 2).
    *   Send this text to a GPT model (GPT-3.5-turbo or GPT-4) via API call for translation into the target language (specified in the initial `Stream` record, `gpu-worker` might need to fetch this or have it passed along).
    *   The prompt should be engineered for concise, chunk-level translation.
    *   Log the `streamId`, original transcribed text, and the translated text.
    *   **Testing:**
        *   Continue using the setup from Phase 2.
        *   Monitor `gpu-worker` logs.
        *   Verify that translated text appears in the logs alongside the original transcription.
        *   Check the quality of the translation for short phrases/sentences.
        *   Ensure the target language from the `Stream` record is respected.

## Phase 4: `gpu-worker` - Text-to-Speech (ElevenLabs Flash v2.5 Streaming)

**Goal:** `gpu-worker` synthesizes audio from translated text using ElevenLabs streaming API and publishes it to Redis.

1.  **`gpu-worker`: TTS with ElevenLabs Streaming API**
    *   **Task:** Take the translated text (output from GPT in Phase 3).
    *   Use the ElevenLabs Flash v2.5 Streaming API to synthesize audio.
    *   Handle the streaming audio output from ElevenLabs. This will likely involve receiving multiple small audio fragments for a single input text.
    *   As audio fragments are received from ElevenLabs, publish them immediately to a new Redis Pub/Sub channel: `translated_audio:<streamId>`. The payload should be the raw audio bytes from ElevenLabs.
    *   Log `streamId` and confirmation of TTS audio chunks being published.
    *   **Testing:**
        *   Continue using the setup from Phase 3.
        *   In a Redis client, subscribe to `translated_audio:*` or a specific `translated_audio:<test_streamId>`.
        *   Verify that small audio chunks/fragments are being published to this Redis channel.
        *   This is a critical step for latency. Monitor how quickly TTS audio appears in Redis after the translated text is ready.
        *   Initially, you might capture these fragments and try to play them locally to verify audio quality.

## Phase 5: `websocket-server` - Relay Translated Audio to Frontend

**Goal:** `websocket-server` receives translated audio chunks from Redis and emits them to the correct client via Socket.IO.

1.  **`websocket-server`: Subscribe to Translated Audio & Emit**
    *   **Task:**
        *   Modify `websocket-server` to subscribe to Redis Pub/Sub channel pattern `translated_audio:*`.
        *   On receiving a message (a translated audio fragment):
            *   Extract the `streamId` from the channel name and the audio data from the message.
            *   Find the corresponding client socket(s) associated with that `streamId` (this mapping should have been stored when the client initiated the translation).
            *   Emit a Socket.IO event (e.g., `translated_audio_chunk`) to the client, sending the audio data (as a Buffer or ArrayBuffer).
    *   **Testing:**
        *   Use a simple Socket.IO client (can be a Node.js script or a basic HTML page with Socket.IO client library) to connect to `websocket-server` and simulate the `initiate_youtube_translation` flow for a `<test_streamId>`.
        *   Manually publish sample translated audio fragments to `translated_audio:<test_streamId>` using a Redis client.
        *   Verify the Socket.IO client receives the `translated_audio_chunk` events with the audio data. Log the received data size on the client.

## Phase 6: Frontend (`/live/page.tsx`) - Basic Playback

**Goal:** Frontend receives translated audio chunks and plays them using `AudioContext`.

1.  **Frontend: Handle `translated_audio_chunk` Event**
    *   **Task:** In `/live/page.tsx`:
        *   Listen for the `translated_audio_chunk` Socket.IO event.
        *   On receiving an audio chunk (ArrayBuffer), add it to a queue.
    *   **Testing:**
        *   Use the full pipeline up to Phase 5.
        *   On the frontend, `console.log` when `translated_audio_chunk` is received and the size of the audio data.
        *   Verify chunks are arriving.

2.  **Frontend: Basic Playback with `AudioContext`**
    *   **Task:**
        *   Initialize an `AudioContext`.
        *   When audio chunks are in the queue:
            *   Take the next chunk.
            *   Decode it using `audioContext.decodeAudioData()`.
            *   Create an `AudioBufferSourceNode`, set its buffer to the decoded data, connect it to `audioContext.destination`, and call `start()`.
        *   This is a very basic playback; chunks will play one after another. Overlap/precise timing is not yet handled.
    *   **Testing:**
        *   Use the full pipeline.
        *   Listen for audio playback on the frontend. It might sound choppy or have gaps, but the goal is to hear the translated audio being played.
        *   Verify there are no major errors in the console related to `AudioContext`.

## Phase 7: Frontend - Synchronization & Advanced Playback

**Goal:** Implement robust audio buffering, playback, and synchronization with the video.

1.  **Frontend: `MediaSource Extensions (MSE)` for Playback (Optional but Recommended)**
    *   **Task:**
        *   Replace the basic `AudioContext` playback with MSE if smoother playback and better control over buffering are needed.
        *   Create a `MediaSource` object and an `<audio>` element.
        *   Add a `SourceBuffer` to the `MediaSource`.
        *   Append incoming `translated_audio_chunk` data to the `SourceBuffer`.
    *   **Testing:**
        *   Test playback smoothness. Compare with `AudioContext` basic playback.
        *   Verify that audio plays continuously as chunks arrive.

2.  **Frontend: Synchronization with `ReactPlayer`**
    *   **Task:**
        *   If displaying video (`video+audio` mode):
            *   Get the current video time from `ReactPlayer` using `player.getCurrentTime()`.
            *   Attempt to align the start of translated audio playback with the video. This is complex.
            *   Implement the initial `latency compensation` logic (e.g., offset translated audio by a configurable amount, starting with the planned 1s).
        *   For `audio-only` mode, ensure audio plays smoothly without needing video sync.
    *   **Testing:**
        *   Use a video with clear speech.
        *   Observe lip-sync (for `video+audio`). It won't be perfect initially.
        *   Adjust the latency compensation offset and observe its effect.
        *   Test if audio stays reasonably in sync for >30 seconds.
        *   Test pausing/resuming the `ReactPlayer` and see how the translated audio behaves. (This might require more advanced logic to pause/resume the audio queue).

## Phase 8: Error Handling & Fallbacks

**Goal:** Implement robust error handling and the TTS fallback mechanism.

1.  **`gpu-worker`: TTS Fallback Mode**
    *   **Task:**
        *   Implement the logic to detect ElevenLabs streaming API failures.
        *   If streaming fails, set `useStreamingTTS = false`.
        *   Accumulate translated text until a sentence boundary (., !, ?).
        *   Send the full sentence to ElevenLabs non-streaming endpoint.
        *   Publish the entire resulting audio file as a single chunk to `translated_audio:<streamId>`.
    *   **Testing:**
        *   Simulate an ElevenLabs streaming API failure (e.g., by temporarily pointing to a wrong URL or using invalid API key for the streaming endpoint only).
        *   Verify that the `gpu-worker` switches to full-sentence mode.
        *   Verify that larger audio chunks (full sentences) are now being sent via Redis and played on the frontend.
        *   Measure the increased latency.

2.  **Error Propagation & Frontend Display**
    *   **Task:**
        *   Ensure `gpu-worker` publishes `translation_error` events to Redis (e.g., on a channel like `stream_errors:<streamId>`) or directly to `websocket-server` if that's simpler.
        *   `websocket-server` relays these errors to the appropriate frontend client.
        *   Frontend listens for these error events and displays a user-friendly message/toast (e.g., "Translation failed at [stage]. Reason: [errorMessage]").
    *   **Testing:**
        *   Induce errors at different stages (e.g., invalid Whisper API key, GPT API failure, invalid ElevenLabs API key for all TTS).
        *   Verify the correct error message (including stage) is shown on the frontend.

## Phase 9: End-to-End Testing & Refinement

**Goal:** Ensure the entire system meets MVP criteria and refine performance.

1.  **MVP Acceptance Criteria Testing:**
    *   **Task:** Systematically test against all defined MVP criteria:
        *   User hears translated audio with <2s delay from original speech (measure this carefully).
        *   Audio and video stay in sync for >30 seconds (observe for `video+audio` mode).
        *   Socket reconnects gracefully on disconnect (simulate network interruptions for the client).
        *   TTS fallback to full-sentence mode if ElevenLabs streaming fails (already tested in Phase 8, re-verify).
    *   **Testing:**
        *   Use a stopwatch or browser developer tools to measure perceived end-to-end latency.
        *   Conduct longer test sessions (>1 minute) to check for sync drift or accumulating delays.
        *   Test with various YouTube videos (different lengths, accents, background noise if possible).

2.  **Performance Profiling & Optimization:**
    *   **Task:** Identify bottlenecks in the pipeline.
        *   Log timestamps at each major step (audio received by `websocket-server`, chunk published, chunk received by `gpu-worker`, STT complete, Translate complete, TTS first byte received, TTS chunk published, chunk received by `websocket-server`, chunk sent to client, chunk played).
        *   Analyze these logs to find where most time is spent.
        *   Optimize critical sections (e.g., prompt engineering for GPT, faster Whisper model if viable, efficient data handling).
    *   **Testing:** Re-run latency and sync tests after optimizations.

3.  **Load Testing (Basic):**
    *   **Task:** Simulate a few concurrent users (e.g., 3-5) initiating translations.
    *   Monitor system resource usage (CPU, memory on `gpu-worker`, `websocket-server`).
    *   Check if latency significantly degrades.
    *   **Testing:** Observe if all streams operate correctly and if latency remains acceptable for each.

---

This step-by-step plan provides a structured approach to building and testing the real-time translation feature. Each phase builds upon the previous one, allowing for incremental development and continuous validation.
Remember to adapt this plan as needed based on discoveries made during implementation. Good luck!
