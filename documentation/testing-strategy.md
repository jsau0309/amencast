# AmenCast Testing Strategy

This document outlines the testing strategy for each phase of the AmenCast real-time translation pipeline.

## Overview

The testing strategy is divided into 5 phases, each corresponding to a microservice in the pipeline:

1. **Phase 1: STT Worker** - Speech-to-Text using AssemblyAI
2. **Phase 2: Translation Worker** - GPT-4 translation
3. **Phase 3: TTS Worker** - ElevenLabs synthesis  
4. **Phase 4: WebSocket Server** - Real-time communication
5. **Phase 5: End-to-End Pipeline** - Full integration

## Prerequisites

1. Redis running locally or connection to Redis instance
2. Environment variables configured for each worker (copy `.env.example` to `.env`)
3. Valid API keys for AssemblyAI, OpenAI, and ElevenLabs

## Phase 1: STT Worker Testing

### Objective
Verify that audio chunks are properly transcribed to text using AssemblyAI streaming.

### Setup
```bash
cd services/stt-worker
cp .env.example .env
# Add your ASSEMBLYAI_API_KEY to .env
npm install
```

### Test 1.1: Unit Test - AssemblyAI Connection
```bash
npm run test:connection
```
This should verify that the AssemblyAI client can connect successfully.

### Test 1.2: Integration Test - Audio to Text
```bash
# Terminal 1: Start STT worker
npm run dev

# Terminal 2: Run test script
cd services/shared
npm run test:stt
```

The test script should:
- Publish test audio chunks to `audio:raw:test-stream-1`
- Subscribe to `text:transcribed:test-stream-1`
- Verify transcripts are received

### Test 1.3: Redis Channel Test
```bash
# Use the shared test-pipeline.ts script
cd services/shared
ts-node test-pipeline.ts
```

### Expected Output
- Connection logs showing AssemblyAI initialization
- Transcript messages appearing in `text:transcribed:*` channels
- Proper error handling for malformed audio data

## Phase 2: Translation Worker Testing

### Objective
Verify that transcribed text is properly translated using GPT-4.

### Setup
```bash
cd services/translation-worker
cp .env.example .env
# Add your OPENAI_API_KEY and DATABASE_URL to .env
npm install
```

### Test 2.1: Unit Test - Translation Function
```bash
npm run test:translate
```
This should test the translation logic with sample texts.

### Test 2.2: Integration Test - Text to Translation
```bash
# Terminal 1: Start translation worker
npm run dev

# Terminal 2: Publish test transcript
redis-cli
PUBLISH text:transcribed:test-stream-1 '{"streamId":"test-stream-1","chunkId":"chunk-1","text":"Hello world, this is a test.","timestamp":1234567890}'
```

### Test 2.3: Context Window Test
```bash
# Send multiple sequential messages to test context preservation
cd services/shared
npm run test:translation-context
```

### Expected Output
- Translation logs showing GPT-4 processing
- Translated text in `text:translated:*` channels
- Proper context maintenance across messages

## Phase 3: TTS Worker Testing

### Objective
Verify that translated text is properly synthesized to audio using ElevenLabs.

### Setup
```bash
cd services/tts-worker
cp .env.example .env
# Add your ELEVENLABS_API_KEY to .env
npm install
```

### Test 3.1: Unit Test - ElevenLabs Connection
```bash
npm run test:elevenlabs
```
This should verify the ElevenLabs client can connect and list voices.

### Test 3.2: Integration Test - Text to Speech
```bash
# Terminal 1: Start TTS worker
npm run dev

# Terminal 2: Publish test translation
redis-cli
PUBLISH text:translated:test-stream-1 '{"streamId":"test-stream-1","chunkId":"chunk-1","sourceText":"Hello","translatedText":"Hola","languageTarget":"es","timestamp":1234567890}'
```

### Test 3.3: Audio Output Test
```bash
# Run test client to save audio to file
npm run test:client
```

### Expected Output
- TTS logs showing synthesis progress
- Base64 encoded audio in `audio:synthesized:*` channels
- Proper voice selection based on language

## Phase 4: WebSocket Server Testing

### Objective
Verify that the WebSocket server properly orchestrates the pipeline.

### Setup
```bash
cd services/websocket-server
cp .env.example .env
npm install
```

### Test 4.1: WebSocket Connection Test
```bash
# Terminal 1: Start WebSocket server
npm run dev

# Terminal 2: Run WebSocket test client
cd services/shared
npm run test:websocket-client
```

### Test 4.2: Stream Control Test
```bash
# Test start/stop commands
redis-cli
PUBLISH stream:control '{"action":"start","streamId":"test-stream-1","targetLanguage":"es"}'
# Wait a few seconds
PUBLISH stream:control '{"action":"stop","streamId":"test-stream-1"}'
```

### Expected Output
- WebSocket connection established
- Control messages propagated to all workers
- Audio chunks routed correctly

## Phase 5: End-to-End Pipeline Testing

### Objective
Verify the complete pipeline from audio input to synthesized output.

### Setup
Start all services:
```bash
# Terminal 1: Redis (if not running)
redis-server

# Terminal 2: STT Worker
cd services/stt-worker && npm run dev

# Terminal 3: Translation Worker
cd services/translation-worker && npm run dev

# Terminal 4: TTS Worker
cd services/tts-worker && npm run dev

# Terminal 5: WebSocket Server
cd services/websocket-server && npm run dev
```

### Test 5.1: Full Pipeline Test
```bash
# Terminal 6: Run end-to-end test
cd services/shared
npm run test:e2e
```

This test should:
1. Send a control message to start stream
2. Publish audio chunks
3. Monitor all intermediate channels
4. Verify synthesized audio is received
5. Send stop command

### Test 5.2: Performance Test
```bash
# Measure end-to-end latency
cd services/shared
npm run test:latency
```

### Test 5.3: Error Recovery Test
```bash
# Test pipeline resilience
cd services/shared
npm run test:resilience
```

This should test:
- Worker restart recovery
- Malformed data handling
- API failure scenarios

### Expected Output
- Complete flow from audio → transcript → translation → synthesis
- Latency under 3 seconds
- Proper error recovery

## Monitoring and Debugging

### Redis Monitoring
```bash
# Monitor all Redis activity
redis-cli MONITOR

# Monitor specific patterns
redis-cli PSUBSCRIBE 'audio:*' 'text:*' 'stream:*'
```

### Log Aggregation
Each worker prefixes logs with its name:
- `[STT-Worker]`
- `[Translation-Worker]`
- `[TTS-Worker]`
- `[WebSocket-Server]`

### Debug Mode
Set environment variable for verbose logging:
```bash
DEBUG=* npm run dev
```

## Common Issues and Solutions

1. **Audio Format Issues**
   - Ensure audio is PCM 16kHz, 16-bit, mono
   - Check base64 encoding/decoding

2. **API Rate Limits**
   - Implement exponential backoff
   - Monitor API usage

3. **Redis Connection**
   - Verify Redis is running
   - Check TLS settings if using Upstash

4. **Missing Transcripts**
   - Check AssemblyAI webhook configuration
   - Verify audio quality

5. **Translation Errors**
   - Monitor OpenAI API status
   - Check context window size

## Test Data

Sample test files are provided in `/services/shared/test-data/`:
- `sample-audio.pcm` - 5 second audio clip
- `sample-transcripts.json` - Test transcripts
- `sample-translations.json` - Expected translations

## CI/CD Integration

GitHub Actions workflow for automated testing:
```yaml
name: Test Pipeline
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:all
```