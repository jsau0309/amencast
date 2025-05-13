
# AmenCast GPU Worker Development Plan (v2 with Bible Lookup)

## Overview

The GPU Worker processes live or streamed audio in real time. Its core function is to listen to a sermon, detect Bible verses or regular speech, translate when needed, synthesize audio, and publish Spanish audio back to listeners with minimal delay.

---

## 🎯 Key Responsibilities

- **Speech-to-Text (STT)** using faster-whisper (Python subprocess).
- **Verse Reference Detection** (e.g., “John 3:16”) using regex or GPT.
- **Verse Content Detection** via fuzzy text match when reference isn't spoken.
- **Bible Lookup** using local SQLite (loaded from Supabase).
- **Translation** of non-verse speech via GPT-4o.
- **Text-to-Speech (TTS)** using ElevenLabs.
- **Audio Publishing** to LiveKit Cloud.
- **Job Handling** via Redis queue triggered by Supabase CDC.

---

## 🧱 Project Structure

```
/gpu-worker/
├── index.ts                # Main worker loop
├── queue.ts                # Redis polling + job dispatch
├── whisper/
│   └── transcribe.py       # STT with faster-whisper
├── bible/
│   ├── bible.sqlite        # Local SQLite verse database
│   ├── lookup.ts           # Lookup logic (text + reference)
│   └── sync.ts             # Sync bible_verses from Supabase (optional)
├── translator/
│   └── translate.ts        # GPT-4o translation logic
├── tts/
│   └── synthesize.ts       # ElevenLabs integration
├── prisma/                 # DB client for stream updates
└── worker.config.ts        # Config values
```

---

## ⚙️ Job Format

```json
{
  "streamId": "abc123",
  "audioUrl": "https://link-to-audio.mp3",
  "languageTarget": "es",
  "chunkId": "chunk_001"
}
```

---

## ✅ Step-by-Step Implementation Plan

### Phase 1: Setup
1. [ ] Create `/gpu-worker/` folder structure
2. [ ] Setup `.env` for API keys and config

### Phase 2: Queue System
3. [ ] Build `queue.ts` to poll Upstash Redis
4. [ ] Parse jobs and dispatch to worker pipeline

### Phase 3: Audio Transcription
5. [ ] Build `whisper/transcribe.py` using faster-whisper
6. [ ] Call from Node.js via subprocess and return segments

### Phase 4: Bible Lookup System
7. [ ] Download/open source English + Spanish Bible (e.g., thiagobodruk/bible)
8. [ ] Create Supabase table `bible_verses`
9. [ ] Write `sync.ts` to download and populate local `bible.sqlite`
10. [ ] Implement `lookup.ts`:
    - Detect verse **references** (e.g., “John 3:16”)
    - Run fuzzy text match if no reference detected
    - Return verse match or fallback to GPT

### Phase 5: Translation
11. [ ] Write `translator/translate.ts` using GPT-4o
12. [ ] Translate non-verse segments only

### Phase 6: TTS
13. [ ] Build `tts/synthesize.ts` using ElevenLabs long-form API
14. [ ] Generate Spanish audio for each segment

### Phase 7: Output & Status
15. [ ] Publish Spanish audio to LiveKit track
16. [ ] Mark stream segment complete in Supabase using Prisma
17. [ ] Handle timeouts, retries, or fallback (e.g., OpenAI Whisper)

---

## 🕓 Performance Targets

| Stage | Target Time |
|-------|-------------|
| STT (Whisper) | ~800ms |
| Verse Detection | ~150ms |
| GPT-4o Translation | ~200ms |
| ElevenLabs TTS | ~500ms |
| Total per segment | ~1.5–2.4s |

---

## 📘 Bible Table Schema (Supabase)

```sql
CREATE TABLE bible_verses (
  id TEXT PRIMARY KEY,
  book TEXT,
  chapter INTEGER,
  verse INTEGER,
  text_en TEXT,
  text_es TEXT
);
```

---

## 🧠 Lookup Modes

1. **Reference Match**
   - Detects phrases like “John 3:16”
   - Extracts book, chapter, verse
   - Uses SQL lookup for Spanish version

2. **Text Match**
   - Matches STT text to known verses using FTS5
   - Fuzzy score threshold (~85%) to detect matches
   - Returns Spanish version if match found

3. **Fallback**
   - No match ➝ run GPT-4o translation ➝ TTS ➝ output

---

## 📦 Deployment on RunPod

- Node.js 20 base image with Python 3
- Includes `faster-whisper` and `sqlite3` binary
- SQLite Bible file bundled or synced at runtime
- Start command: `node index.ts`

---

## 🔁 Fallback Logic

- Whisper crash ➝ fallback to OpenAI Whisper API
- No verse match ➝ fallback to GPT-4o translation
- TTS timeout ➝ log and skip or use backup voice

---

## 🚧 Future Enhancements

- Streaming STT + TTS for <1s live audio
- GPU autoscaling with multiple workers
- Embedding-based verse matching for paraphrases
