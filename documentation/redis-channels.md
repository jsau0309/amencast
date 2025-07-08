# Redis Channel Structure

This document describes the standardized Redis channel structure for the AmenCast real-time translation pipeline.

## Channel Naming Convention

All channels follow a hierarchical naming pattern: `category:subcategory:identifier`

## Channel List

### Audio Channels
- **`audio:raw:{streamId}`** - Raw PCM audio chunks from ingestion
  - Publisher: WebSocket Server (via ingestion worker)
  - Subscriber: STT Worker
  - Data: Binary audio chunks (PCM 16kHz, 16-bit, mono)

- **`audio:synthesized:{streamId}`** - Synthesized audio from TTS
  - Publisher: TTS Worker
  - Subscriber: WebSocket Server
  - Data: Base64 encoded audio (MP3)

### Text Channels
- **`text:transcribed:{streamId}`** - Transcribed text from STT
  - Publisher: STT Worker
  - Subscriber: Translation Worker
  - Data: JSON with text, timestamp, confidence

- **`text:translated:{streamId}`** - Translated text
  - Publisher: Translation Worker
  - Subscriber: TTS Worker
  - Data: JSON with source text, translated text, language

### Control & Status Channels
- **`stream:control`** - Control commands for all workers
  - Publishers: WebSocket Server, Frontend
  - Subscribers: All Workers
  - Commands: start, stop, pause, resume, force_stop, ingestion_complete

- **`stream:status:{streamId}`** - Status updates from workers
  - Publishers: All Workers
  - Subscriber: WebSocket Server
  - Data: JSON with status, service name, timestamp, metadata

## Data Flow

```
1. WebSocket Server publishes audio to `audio:raw:{streamId}`
2. STT Worker subscribes to `audio:raw:*` and publishes to `text:transcribed:{streamId}`
3. Translation Worker subscribes to `text:transcribed:*` and publishes to `text:translated:{streamId}`
4. TTS Worker subscribes to `text:translated:*` and publishes to `audio:synthesized:{streamId}`
5. WebSocket Server subscribes to `audio:synthesized:{streamId}` and streams to clients
```

## Pattern Subscriptions

Workers use pattern subscriptions to handle multiple streams:
- STT Worker: `psubscribe('audio:raw:*')`
- Translation Worker: `psubscribe('text:transcribed:*')`
- TTS Worker: `psubscribe('text:translated:*')`

## Control Flow

All workers subscribe to `stream:control` for lifecycle management:
- `start` - Initialize stream processing
- `stop` - Graceful shutdown
- `force_stop` - Immediate termination
- `ingestion_complete` - Signal end of input

## Status Updates

Workers publish to `stream:status:{streamId}` for monitoring:
- `stt_complete` / `stt_error`
- `translation_complete` / `translation_error`
- `tts_complete` / `tts_error`