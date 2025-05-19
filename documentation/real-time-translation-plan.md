# AmenCast Real-Time Translation - Implementation Plan

> **Goal:** Stream audio from YouTube livestreams or uploaded videos, translate it in real-time, and stream translated audio to the frontend for synchronized playback. MVP should support both `video+audio` and `audio-only` display modes.

---

## Phase 1: Real-Time Translation (Livestream-Compatible MVP)

### 🧩 Core Pipeline

```
[YouTube Livestream or Prerecorded Video]
     ↓ (audio extraction via ffmpeg/ytdl)
[websocket-server] → Redis Pub/Sub → [gpu-worker]
     ↓                                 ↓
   Socket.IO ←–––––– audio chunks ––––← Translated TTS (ElevenLabs)
     ↓
[Frontend Player: Video+Audio or Audio-only]
```

---

## 🔧 Component Changes

### 1. `websocket-server`

* **Add support for receiving raw audio chunks** from FFmpeg pipeline.
* **Broadcast `audio_chunk` events** via Redis Pub/Sub to `gpu-worker`.
* **Receive `translated_audio_chunk`** and emit it via `socket.emit('translated_audio_chunk', { streamId, buffer })`.
* Optional: Track `streamId` ↔ `socket.id` mappings for user sessions.

#### 🛠 Implementation Notes:

* Use FFmpeg to extract audio in raw PCM format (e.g., `pcm_s16le`).
* Chunk size: **1.5 seconds**, overlap: **0.5 seconds** (VAD-capable).

### 2. `gpu-worker`

* **Switch from full audio processing to chunked mode.**
* For each chunk:

  * Perform STT (initially with OpenAI Whisper API).
  * Translate result using GPT-4 or GPT-3.5.
  * Use ElevenLabs **Flash v2.5** Streaming API to synthesize translated audio.
  * Push output chunks back to Redis (`translated_audio_channel`).

#### 🔍 STT Alternatives:

* ✅ Start: Whisper API
* 🚀 Optional: Switch to `faster-whisper`, `whisper.cpp`, or `Deepgram` (lower latency)

### 3. Frontend (`/live/page.tsx`)

* **Handle Socket.IO event `translated_audio_chunk`.**
* Buffer and decode incoming audio using `AudioContext` or `MediaSource Extensions (MSE)`.
* Sync translated audio with `ReactPlayer`'s video timestamp.

#### ⏱ Playback Sync:

* Use `react-player`'s `getCurrentTime()` to sync video and translated audio.
* Add `latency compensation` logic (e.g., offset translated audio by 1s).

---

## 🔄 Redis Upgrade

### Switch from `BRPOP` queues → Redis Pub/Sub

* Create Redis channels:

  * `audio_chunks:<streamId>` → pub by `websocket-server`, sub by `gpu-worker`
  * `translated_audio:<streamId>` → pub by `gpu-worker`, sub by `websocket-server`
* Ensures **low-latency delivery** without polling.

---

## 🧪 Testing Plan

### 🧱 Dev Environment Setup

* Run FFmpeg to simulate livestream audio:
  `ffmpeg -i input.mp4 -f s16le -ar 16000 -ac 1 pipe:1`
* Pipe audio to websocket-server
* Log round-trip latency from chunk → TTS playback

### ✅ MVP Acceptance Criteria

* [ ] User hears translated audio with <2s delay from original speech
* [ ] Audio and video stay in sync for >30 seconds
* [ ] Socket reconnects gracefully on disconnect
* [ ] TTS fallback to full-sentence mode if ElevenLabs streaming fails

---

## 📦 Optional Future Enhancements

| Feature                        | Description                          |
| ------------------------------ | ------------------------------------ |
| Voice Activity Detection (VAD) | Skip silence for faster feedback     |
| Caption Overlay                | Show real-time translated text       |
| Voice Cloning per speaker      | Support custom ElevenLabs voices     |
| Audio Effects                  | Add background ambiance or smoothing |
| Real hardware ingestion        | Pipe from OBS / console in v2        |

---

## 📁 Storage Strategy

* No audio chunk storage in MVP.
* Store only:

  * `sourceText` and `translatedText` per chunk
  * Timestamp of chunk for syncing and QA

---

## 🌐 Deployment Considerations

| Component        | Platform              | Notes                                  |
| ---------------- | --------------------- | -------------------------------------- |
| Frontend         | Vercel                | No change                              |
| WebSocket Server | Fly.io                | Keep Socket.IO centralized             |
| GPU Worker       | RunPod                | Can stream TTS back via Redis          |
| Redis            | Upstash → Redis Cloud | Consider Redis Cloud if latency issues |

---

## ✅ Summary

With this plan, AmenCast will support live YouTube translation in real-time, enabling audio sync within 1–2 seconds using chunked Whisper + GPT + ElevenLabs Flash 2.5. The system avoids file storage, uses WebSocket + Redis Pub/Sub for streaming, and supports both video and audio modes.

---

> PM Note: Ready to start implementation. Can break this into tasks or write PR descriptions for each phase.
