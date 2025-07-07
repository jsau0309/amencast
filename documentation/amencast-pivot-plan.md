# AmenCast Real-Time Translation Pipeline - Implementation Plan v2.0

## 📌 Overview

This document outlines the implementation plan for AmenCast's real-time translation service that:
- Translates YouTube videos (live or recorded) from English to Spanish, Italian, and German
- Achieves ≤3 second end-to-end latency using streaming architecture
- Supports both YouTube content (V1) and direct audio input (V2)
- Provides 60 minutes free per user with donation-based extensions
- Uses sentence-boundary detection for optimal accuracy/speed balance

---

## 🔧 Core Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 15 + Web Audio API | Real-time audio playback |
| Auth | Clerk | User authentication & waitlist |
| Ingestion | ytdl-core + FFmpeg | YouTube audio extraction |
| STT | AssemblyAI Streaming | Real-time transcription |
| Translation | OpenAI GPT-4 | Context-aware translation |
| TTS | ElevenLabs Streaming v2.5 | Low-latency synthesis |
| Queue/Streaming | Redis Pub/Sub + Streams | Real-time data flow |
| WebSocket | Socket.IO | Client-server communication |
| Workers | Node.js services | Modular processing |
| Database | PostgreSQL (Prisma) | User data & metrics |

---

## 🏗️ Architecture

```text
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   YouTube   │────▶│ Ingestion Worker│────▶│ Audio Chunks    │
│   Stream    │     │ (Extract Audio) │     │ (Redis Stream)  │
└─────────────┘     └─────────────────┘     └────────┬────────┘
                                                      │
                    ┌─────────────────┐               ▼
                    │ Translation     │     ┌─────────────────┐
                    │ Worker          │◀────│ STT Worker      │
                    │ (GPT-4)         │     │ (AssemblyAI)    │
                    └────────┬────────┘     └─────────────────┘
                             │                        │
                             ▼                        │
                    ┌─────────────────┐               │
                    │ TTS Worker      │               │
                    │ (ElevenLabs)    │               │
                    └────────┬────────┘               │
                             │                        │
                             ▼                        ▼
                    ┌─────────────────────────────────────┐
                    │     Redis Pub/Sub Channels         │
                    │  • audio:synthesized:${streamId}   │
                    │  • stream:status:${streamId}       │
                    │  • stream:control:${streamId}      │
                    └────────────┬───────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────┐     ┌─────────────┐
                    │ WebSocket Server│────▶│   Browser   │
                    │ (Socket.IO)     │     │ (Web Audio) │
                    └─────────────────┘     └─────────────┘
```

---

## 📋 Implementation Phases

### Phase 0: Foundation & Cleanup ✅

**Goals:**
- Clean codebase from LiveKit dependencies
- Establish proper worker separation
- Set up development environment

**Tasks:**
1. ✅ Remove all LiveKit-related code
2. ✅ Remove Cartesia TTS implementation  
3. ✅ Clean duplicate code between workers
4. ✅ Update package.json dependencies

**Status:** COMPLETED

---

### Phase 1: Worker Separation & Queue Structure

**Goals:**
- Separate STT and TTS functionality into distinct workers
- Implement proper Redis queue/channel structure
- Establish clear data flow between services

**Tasks:**

#### 1.1 Refactor STT Worker
```bash
# Location: services/stt-translation-worker/
```
- Remove all TTS functionality (ElevenLabs code)
- Focus only on STT using AssemblyAI
- Implement sentence boundary detection
- Output to Redis: `text:transcribed:${streamId}`

#### 1.2 Create Translation Worker (NEW)
```bash
# Location: services/translation-worker/
```
- Separate translation logic from STT
- Implement rolling context (last 2-3 sentences)
- Use GPT-4 with optimized prompts for each language
- Bible verse substitution logic
- Output to Redis: `text:translated:${streamId}`

#### 1.3 Refactor TTS Worker
```bash
# Location: services/tts-worker/
```
- Remove STT/translation code
- Focus only on ElevenLabs synthesis
- Implement streaming TTS with chunking
- Output to Redis: `audio:synthesized:${streamId}`

#### 1.4 Update Redis Structure
```javascript
// Streaming channels
const CHANNELS = {
  RAW_AUDIO: `audio:raw:${streamId}`,
  TRANSCRIBED_TEXT: `text:transcribed:${streamId}`,
  TRANSLATED_TEXT: `text:translated:${streamId}`,
  SYNTHESIZED_AUDIO: `audio:synthesized:${streamId}`,
  STREAM_CONTROL: `stream:control:${streamId}`,
  STREAM_STATUS: `stream:status:${streamId}`
};

// Control messages
const CONTROL_MESSAGES = {
  START: { action: 'start', streamId, targetLanguage },
  STOP: { action: 'stop', streamId },
  PAUSE: { action: 'pause', streamId },
  RESUME: { action: 'resume', streamId }
};
```

**Testing:**
- Unit test each worker independently
- Test Redis pub/sub communication
- Verify data flow: Audio → STT → Translation → TTS

---

### Phase 2: Smart Chunking & Sentence Detection

**Goals:**
- Implement intelligent audio chunking
- Add sentence boundary detection
- Optimize for accuracy while maintaining low latency

**Tasks:**

#### 2.1 Implement Sentence Boundary Detection
```javascript
// In STT Worker
class SentenceBoundaryDetector {
  detectBoundary(text, confidence) {
    // Detect sentence endings: . ! ? 
    // Consider confidence scores
    // Handle edge cases (Dr., Mr., etc.)
  }
}
```

#### 2.2 Dynamic Chunk Sizing
- Minimum chunk: 0.5 seconds
- Maximum chunk: 3 seconds
- Buffer until sentence completion
- Forward only complete sentences

#### 2.3 Add Punctuation Enhancement
```javascript
// Use GPT-3.5 for fast punctuation if needed
async function enhancePunctuation(text) {
  // Quick API call to add missing punctuation
  // Cache common patterns
}
```

**Testing:**
- Test with various speech patterns
- Measure latency vs accuracy trade-offs
- Test with different languages

---

### Phase 3: Real-time Streaming Pipeline

**Goals:**
- Implement end-to-end streaming
- Optimize for minimal latency
- Handle backpressure and buffering

**Tasks:**

#### 3.1 Update Ingestion Worker
```javascript
// Stream audio in real-time
const CHUNK_SIZE = 16000; // 1 second at 16kHz
stream.on('data', (chunk) => {
  redis.xadd(`audio:raw:${streamId}`, '*', 
    'data', chunk.toString('base64'),
    'timestamp', Date.now()
  );
});
```

#### 3.2 Implement AssemblyAI Streaming
```javascript
// In STT Worker
const assemblyAI = new AssemblyAIStreamManager();
assemblyAI.on('transcript', (data) => {
  if (data.message_type === 'FinalTranscript') {
    processSentence(data.text);
  }
});
```

#### 3.3 ElevenLabs Streaming Integration
```javascript
// In TTS Worker
const stream = await elevenlabs.textToSpeech.stream(voiceId, {
  text: translatedText,
  model_id: "eleven_turbo_v2_5",
  voice_settings: { stability: 0.5, similarity_boost: 0.75 }
});
```

**Testing:**
- End-to-end latency measurement
- Stream stability under load
- Reconnection handling

---

### Phase 4: Language-Specific Optimizations

**Goals:**
- Optimize for Spanish, Italian, German translations
- Implement language-specific prompt engineering
- Add cultural context handling

**Tasks:**

#### 4.1 Language Configuration
```javascript
const LANGUAGE_CONFIGS = {
  'es': {
    voice: 'flq6f7yk4E4fJM5XTYuZ', // Pedro
    model: 'eleven_multilingual_v2',
    translationPrompt: `Translate to Spanish. Context: Christian sermon.
    Rules:
    - Keep biblical references exact (use RVR-60)
    - Maintain formal tone (usted)
    - Preserve emphasis and emotion`,
    glossary: ['Amen', 'Hallelujah', 'Selah']
  },
  'it': {
    voice: 'AZnzlk1XvdvUeBnXmlld', // Giuseppe
    model: 'eleven_multilingual_v2',
    translationPrompt: `Translate to Italian...`
  },
  'de': {
    voice: 'ErXwobaYiN019PkySvjV', // Antoni
    model: 'eleven_multilingual_v2',
    translationPrompt: `Translate to German...`
  }
};
```

#### 4.2 Context-Aware Translation
- Implement rolling context window
- Add speaker identification
- Handle code-switching and quotes

**Testing:**
- Test with sermons in each language
- Verify cultural appropriateness
- Check biblical reference accuracy

---

### Phase 5: WebSocket & Client Integration

**Goals:**
- Update WebSocket server for new architecture
- Implement robust client-side audio handling
- Add real-time status updates

**Tasks:**

#### 5.1 WebSocket Server Updates
```javascript
// Handle multiple streams per user
io.on('connection', (socket) => {
  socket.on('start_translation', async (data) => {
    const streamId = uuidv4();
    const subscription = redis.subscribe(
      `audio:synthesized:${streamId}`,
      `stream:status:${streamId}`
    );
    // Stream audio chunks to client
  });
});
```

#### 5.2 Client Audio Handling
```javascript
// Implement double-buffering for smooth playback
class AudioStreamPlayer {
  constructor() {
    this.bufferA = [];
    this.bufferB = [];
    this.activeBuffer = 'A';
  }
  
  async playChunk(audioData) {
    // Decode and schedule playback
    // Switch buffers seamlessly
  }
}
```

**Testing:**
- Test with poor network conditions
- Verify audio continuity
- Test concurrent streams

---

### Phase 6: Production Optimizations

**Goals:**
- Add monitoring and metrics
- Implement error recovery
- Optimize for scale

**Tasks:**

#### 6.1 Add Monitoring
```javascript
// Track key metrics
const metrics = {
  sttLatency: histogram('stt_latency_ms'),
  translationLatency: histogram('translation_latency_ms'),
  ttsLatency: histogram('tts_latency_ms'),
  endToEndLatency: histogram('e2e_latency_ms'),
  activeStreams: gauge('active_streams')
};
```

#### 6.2 Error Recovery
- Implement circuit breakers for external APIs
- Add retry logic with exponential backoff
- Graceful degradation strategies

#### 6.3 Performance Optimization
- Connection pooling for Redis
- API response caching
- Load balancing between workers

**Testing:**
- Load testing with 100+ concurrent streams
- Failover testing
- Memory leak detection

---

### Phase 7: V2 Foundation (Direct Audio Input)

**Goals:**
- Prepare for direct audio input
- Add WebRTC support
- Enable console/mic streaming

**Tasks:**

#### 7.1 WebRTC Integration
```javascript
// Add WebRTC endpoint
const pc = new RTCPeerConnection();
pc.on('track', (event) => {
  const audioStream = event.streams[0];
  // Pipe to ingestion worker
});
```

#### 7.2 Audio Source Abstraction
```javascript
interface AudioSource {
  getStream(): ReadableStream;
  getMetadata(): SourceMetadata;
}

class YouTubeSource implements AudioSource {}
class WebRTCSource implements AudioSource {}
class FileSource implements AudioSource {}
```

**Testing:**
- Test various audio inputs
- Verify quality preservation
- Test switching between sources

---

## 🧪 Testing Strategy

### Unit Tests
- Each worker tested independently
- Mock external services (AssemblyAI, ElevenLabs, OpenAI)
- Test error handling

### Integration Tests
```bash
# Test full pipeline
npm run test:integration

# Test specific language
npm run test:spanish
npm run test:italian
npm run test:german
```

### Performance Tests
- Measure latency at each stage
- Test with 1-hour streams
- Concurrent user testing

### Test Scenarios
1. **Happy Path**: 5-minute YouTube video
2. **Livestream**: 1-hour live sermon
3. **Poor Network**: Simulated packet loss
4. **Language Switch**: Multi-language content
5. **Error Recovery**: API failures

---

## 🚀 Deployment Strategy

### Development
```bash
# Start all services
npm run dev:all

# Start individual services
npm run dev:ingestion
npm run dev:stt
npm run dev:translation
npm run dev:tts
npm run dev:websocket
```

### Staging
- Deploy to staging environment
- Run full test suite
- Performance profiling

### Production
```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: amencast-workers
spec:
  replicas: 3
  selector:
    matchLabels:
      app: amencast
```

---

## 📊 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| End-to-end latency | ≤3 seconds | 95th percentile |
| Translation accuracy | >95% | Human evaluation |
| Stream stability | >99.9% | Uptime monitoring |
| Concurrent users | 1000+ | Load testing |
| User satisfaction | >4.5/5 | User feedback |

---

## 🔄 Migration from Current State

### Step 1: Fix Imports (Immediate)
- Fix STT worker imports
- Remove TTS code from STT worker

### Step 2: Create Translation Worker
- Extract translation logic
- Set up new worker service

### Step 3: Update Queue Names
- Migrate to new Redis structure
- Update all workers

### Step 4: Test & Deploy
- Run integration tests
- Gradual rollout

---

## 📅 Timeline

- **Week 1**: Worker separation & queue structure
- **Week 2**: Smart chunking & streaming pipeline
- **Week 3**: Language optimizations & client integration
- **Week 4**: Testing & production optimizations
- **Week 5**: Deployment & monitoring
- **Week 6**: V2 foundation preparation

---

## 🎯 Next Immediate Steps

1. Fix STT worker imports and remove TTS functionality
2. Create the new translation worker service
3. Update Redis channel names across all services
4. Implement sentence boundary detection
5. Test end-to-end with a simple YouTube video

This architecture provides the foundation for both V1 (YouTube) and V2 (direct audio) while maintaining the real-time performance requirements.