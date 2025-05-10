# Project Requirements Document: **AmenCast MVP**

---

## 1. Project Overview

**AmenCast** is a browser-based service that lets Spanish-speaking congregants listen to any YouTube-hosted church livestream in *real-time* Spanish.  
The MVP removes every onboarding barrier — a listener pastes a YouTube link, chooses **Video + Spanish Audio** or **Audio-only**, and hears the translated sermon with ≤ 3 s delay.

> **Mission:** *“Spread the message with no language barriers.”*

---

## 2. Scope

### 2.1  In-Scope (MVP)

| Area | Details |
|------|---------|
| **Language** | English → Spanish only (future: Mandarin, Tagalog). |
| **User Role** | *Listener* (no church admin UI). |
| **Input** | Manual paste of a public YouTube Live URL. |
| **Output Modes** | • Video iframe + Spanish audio<br>• Audio-only toggle. |
| **Bible Verse Substitution** | Automatic swap with pre-loaded **RVR-60** and **NVI** text. |
| **Translation Feedback** | “Report bad translation” button (stores timestamp + reason). |
| **Waitlist Access** | Clerk Waitlist → invite e-mail → magic-link sign-up. |
| **Usage Logging** | Minutes translated per stream for KPI tracking. |

### 2.2  Out-of-Scope (Deferred)

* Multi-tenant church dashboards & user invitations  
* On-screen captions for listeners (captions collected backend only)  
* Additional payment tiers or Stripe billing  
* Mobile native apps / PWA packaging  
* ProPresenter or OBS integrations

---

## 3. User Flow (Listener)

```text
Landing → Join waitlist → (Invite email)
        ↘ Sign-up (Clerk magic link)
Dashboard → Paste YouTube URL → Start Translation
Translation Room:
    [Toggle] Video | Audio-only
    [Button] Report issue
```

---

## 4. Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| F-1 | Landing page with Clerk waitlist form | P0 | Email captured and visible in Clerk Waitlist. |
| F-2 | Invite email from Clerk | P0 | Approved address receives working magic-link in < 5 min. |
| F-3 | Authenticated dashboard | P0 | `/dashboard` accessible only when signed-in. |
| F-4 | YouTube URL input & validation | P0 | Invalid URLs blocked; valid enables **Start**. |
| F-5 | Toggle Video / Audio-only | P0 | Switches mode in < 200 ms without reload. |
| F-6 | Real-time translation ≤ 3 s | P0 | p95 glass-to-glass latency monitored via logs. |
| F-7 | Bible verse substitution | P0 | Detected verses output exact RVR-60/NVI text. |
| F-8 | Feedback button | P1 | POST stores `{stream_id, ts, reason}`. |
| F-9 | Minutes-translated logging | P1 | Accuracy ±3 % of wall-clock. |

---

## 5. Non-Functional Requirements

| Category | Target |
|----------|--------|
| **Latency** | ≤ 3 000 ms end-to-end, p95 |
| **Scale** | 100 listeners, 10 concurrent streams |
| **Budget** | ≤ $100 / month infra (GPU + LiveKit) |
| **Uptime** | 99 % during Sunday 09:00-13:00 PT |
| **Platforms** | Chrome ≥ 110, Safari iOS ≥ 15, Edge ≥ 110 |
| **Security** | JWT-signed stream tokens; no audio at rest |

---

## 6. Technical Architecture

### 6.1  Front-End

| Layer | Stack |
|-------|-------|
| UI / Routing | **Next .js 15** on Vercel, Tailwind via **V0** |
| Auth / Waitlist | **Clerk** (waitlist + magic-link invites) |
| Player | `react-player` (YouTube iframe) + custom WebRTC audio player |

### 6.2  Back-End & Media

| Function | Service |
|----------|---------|
| Edge API (`/api/streams`) | Vercel Edge Functions |
| Database | **Supabase Postgres** (+Storage for captions) |
| GPU Worker | RunPod spot instance – `faster-whisper-large-v3` → GPT-4o → ElevenLabs |
| Verse Cache & Pub/Sub | Upstash Redis |
| Media Fan-out | **LiveKit Cloud** (WebRTC SFU) |

> **Latency path (avg):** Ingest 10 ms → STT 800 ms → Verse/Translate 250 ms → TTS 500 ms → Packetise 50 ms → WebRTC 300 ms ≈ 1.9 s.

---

## 7. Timeline & Milestones

| Date | Milestone |
|------|-----------|
| **May 8** | PRD approval; repo scaffolding (Next.js, Clerk) |
| May 9 | Waitlist landing live; GPU worker PoC |
| May 10 | End-to-end happy path with 1 private stream |
| **May 11 (Sun)** | *Beta test* with 5 invitees |
| May 12-16 | Bug fixes, latency tuning, feedback logging |
| May 18 | Waitlist opened to 100 free beta users |

---

## 8. Success Metrics (MVP)

| KPI | Target |
|-----|--------|
| Translation latency | ≤ 3 s p95 |
| Minutes translated (launch Sunday) | ≥ 600 min |
| Positive feedback ratio | ≥ 80 % |
| Translation WER (spot-check) | ≤ 12 % (non-verse) / 0 % (verses) |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GPU spot pre-emption | High | Auto-switch to OpenAI Whisper API (higher cost, > 3 s) |
| TTS cost spike | Medium | Throttle beta at 700 min/day; monitor Spend cap |
| YouTube format change | Medium | Auto-update `yt-dlp`; fallback HLS fetcher |
| Translation quality issues | Medium | Bible substitution, feedback loop, weekly fine-tune |

---

## 10. Future Enhancements (v2+)

* **Church Admin Dashboard** (multi-tenant, scheduled streams).  
* Additional languages: Mandarin, Tagalog.  
* On-screen captions & ProPresenter overlay.  
* Stripe pay-as-you-go billing.  
* Mobile PWA and offline sermon replays.  

---

*Prepared May 8 2025 — AmenCast MVP PRD*
