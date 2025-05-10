# AmenCast MVP — Software Requirements Specification (SRS)

## System Design
- **Client tier:** Mobile‑first Next.js SPA served from Vercel Edge.  
- **Edge/API tier:** Vercel Route Handlers for low‑latency CRUD and token signing.  
- **Processing tier:** GPU worker pods (RunPod) handling STT → Translation → TTS; publishing Spanish audio to LiveKit Cloud SFU.  
- **Realtime tier:** LiveKit Cloud distributes WebRTC audio.  
- **Data tier:** Supabase **Postgres** with **Prisma ORM** for schema + typed client, Supabase Realtime (CDC) for event triggers, Upstash Redis for verse cache/pub‑sub.

## Architecture pattern
- **Front‑end:** Reactive SPA with *Smart Components / Global Store*.  
- **Back‑end:** Serverless Function‑as‑Service for synchronous endpoints; event‑driven micro‑pipeline (supabase CDC → worker) for media.  
- **Data Migration:** *Dual‑track migrations*  
  - **Prisma Migrate** generates DDL for tables/columns.  
  - **Supabase SQL** folder stores RLS policies, triggers, extensions.

## State management
- React **Zustand** store: `auth`, `currentStream`, `playbackMode`.  
- Persist `playbackMode` + last URL to `localStorage`.

## Data flow
1. `/api/streams` inserts **streams** row via Prisma.  
2. Supabase CDC triggers GPU worker queue (Redis).  
3. Worker pulls audio → STT → verse lookup → translate → TTS.  
4. Worker updates stream status via Prisma and publishes Spanish track to LiveKit.  
5. Client fetches fresh `livekitToken`, plays YouTube (muted) + Spanish audio.  
6. Feedback saved through Prisma into **feedback** table.

## Technical Stack
| Layer | Tool |
|-------|------|
| Front‑end | **Next.js 15**, TypeScript, TailwindCSS, React Player |
| Global State | **Zustand** |
| Auth | **Clerk** |
| API / Edge | **Vercel Edge Functions** (TypeScript) |
| ORM & Migrations | **Prisma 5** (`@prisma/client`, `prisma migrate`) |
| Database | **Supabase Postgres** (managed) |
| Cache / Queue | **Upstash Redis** (global) |
| Media | **LiveKit Cloud** |
| GPU Worker | Node 20 + `faster-whisper`, Python child process |
| Hosting | Vercel (front/API) + RunPod (GPU pods) |

### Prisma Integration Notes
- `DATABASE_URL` uses Supabase **service role** connection string with `?pgbouncer=false`.  
- `prisma/migrations/` → auto‑generated SQL; committed to repo.  
- `supabase/migrations/` → manual SQL for RLS policies, extensions, triggers (executed via Supabase CLI).  
- CI pipeline: `prisma migrate deploy` → `supabase db push` (SQL folder).  
- Prisma shadow DB permitted via service role; no RLS during migrations.

## Authentication Process
1. Clerk invite → magic‑link signup.  
2. Clerk JWT verified on each Edge request.  
3. Edge signs **LiveKit JWT** (`role: subscribe`, track `es‑ES`).  
4. Prisma queries executed with service key in Edge context but RLS safe because only listener‑scoped queries exposed.

## Route Design
| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Landing + waitlist |
| `/dashboard` | GET | Paste link form |
| `/api/streams` | POST | Create stream row, return LiveKit token |
| `/listen/[id]` | GET | Listening room |
| `/api/feedback` | POST | Record feedback |
| `/api/health` | GET | Liveness probe |

## API Design
### `POST /api/streams`
```json
{ "youtubeUrl": "string" }
→ 201
{ "streamId":"uuid","livekitToken":"jwt" }
```
- Prisma `streams.create` then LiveKit JWT signer.

### `POST /api/feedback`
```json
{ "streamId":"uuid","code":"AUDIO_LAG|WRONG_VERSE|OTHER","note":"string?" }
→ 204
```

## Database Design ERD
```
users            (managed by Clerk)
  id uuid PK

streams
  id uuid PK @default(uuid())
  youtube_video_id text
  status text
  listener_id uuid FK → users
  started_at timestamptz
  ended_at   timestamptz

usage_events
  id bigint PK
  stream_id uuid FK → streams
  seconds_translated int
  created_at timestamptz

feedback
  id bigint PK
  stream_id uuid FK → streams
  code text
  note text
  created_at timestamptz

transcripts
  id bigint PK
  stream_id uuid FK
  start_ts float
  end_ts   float
  text_en  text
  text_es  text

bible_es
  book smallint
  chapter smallint
  verse smallint
  text_rvr60 text
  text_nvi  text
  PRIMARY KEY(book,chapter,verse)

_prisma_migrations  -- managed by Prisma
```
- **RLS** policies applied via Supabase SQL migrations, not Prisma.  
- Foreign keys & indexes defined in Prisma schema for type safety.

---
