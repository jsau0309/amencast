# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AmenCast is a real-time translation service that enables Spanish-speaking congregants to listen to any YouTube-hosted church livestream in Spanish with ≤3 second delay. The system uses a microservices architecture with real-time audio processing pipeline.

## Development Commands

### Quick Start
```bash
# Install dependencies
npm install

# Generate Prisma client (required before running)
npx prisma generate

# Run all services in development
npm run dev:services

# Or run individual services:
npm run dev              # Next.js frontend
npm run dev:websocket    # WebSocket server
npm run dev:ingestion    # Ingestion worker
npm run dev:stt          # STT/translation worker
npm run dev:tts          # TTS worker
```

### Building and Production
```bash
# Build Next.js app (includes Prisma generate)
npm run build

# Build individual services
npm run build:ingestion

# Start production
npm run start
```

### Database Operations
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Open Prisma Studio
npx prisma studio
```

### Testing
```bash
# Test WebSocket client
npm run test:client

# Test STT worker phases
cd services/stt-translation-worker
npm run test:phase1

# Test TTS worker phases  
cd services/tts-worker
npm run test:phase2
```

## Architecture Overview

### Monorepo Structure
The project uses npm workspaces to manage multiple services:
- **Frontend**: Next.js 15 app with Clerk auth and LiveKit integration
- **Services**: Microservices for audio processing pipeline
  - `websocket-server`: Real-time communication hub
  - `ingestion-worker`: YouTube audio extraction
  - `stt-translation-worker`: Speech-to-text and GPT-4 translation
  - `tts-worker`: Text-to-speech synthesis

### Real-Time Pipeline Flow
```
YouTube Stream → Ingestion → WebSocket Server → STT Worker → Translation → TTS Worker → LiveKit → User
                                            ↓
                                     Redis Pub/Sub
```

### Key Technologies
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Auth**: Clerk with waitlist and magic links
- **Database**: PostgreSQL via Prisma + Supabase
- **Caching**: Redis (Upstash)
- **Real-time**: LiveKit WebRTC, WebSockets
- **AI/ML**: AssemblyAI (STT), OpenAI GPT-4 (translation), ElevenLabs/Cartesia (TTS)

### Database Schema
Main tables:
- `Stream`: Active translation sessions
- `Transcript`: Stored translations with timestamps
- `BibleVerse`: Pre-loaded RVR-60 and NVI verses for substitution
- `Feedback`: User-reported translation issues
- `UsageEvent`: Metrics tracking

### Environment Setup
Each service requires its own `.env` file. Key variables include:
- Database URLs (Prisma, Supabase)
- API keys (OpenAI, AssemblyAI, ElevenLabs, LiveKit)
- Redis connection strings
- Clerk authentication keys

### Bible Verse Substitution
The system automatically detects Bible references and substitutes them with pre-loaded Spanish translations (RVR-60 or NVI) for accuracy.

### Real-Time Constraints
- Target latency: ≤3 seconds end-to-end
- Audio chunking: 100-250ms segments
- Translation batching: Sentence-level with punctuation detection

## Code Conventions

### TypeScript
- Strict mode enabled
- Use `@/` path alias for imports from root
- Prefer interfaces over types for object shapes

### Component Structure
- Components in `/components` use shadcn/ui patterns
- Custom hooks in `/hooks`
- Type definitions in `/types`

### Service Communication
- Redis pub/sub for inter-service messaging
- WebSocket for client-server real-time updates
- REST APIs via Next.js API routes

### Error Handling
- Services should gracefully handle network failures
- Implement exponential backoff for API retries
- Log errors with appropriate context

## Deployment

- **Frontend**: Vercel
- **Workers**: RunPod (GPU instances) or Docker containers
- **Database**: Supabase hosted PostgreSQL
- **Redis**: Upstash serverless Redis
- **LiveKit**: LiveKit Cloud SFU