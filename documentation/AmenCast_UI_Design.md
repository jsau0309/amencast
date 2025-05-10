# AmenCast MVP — User Interface Design Document

## Layout Structure
- **Single-Page App** with two visual states  
  1. **Input State** (default)  
     - Full-height center column  
       - Logo + mission tagline  
       - Paste field (auto-focus)  
       - Large primary button **Start Translation**  
  2. **Listening State**  
     - Top section (16:9) muted YouTube thumbnail/video  
     - Middle: slim status bar “Live • 00:14:23”  
     - Bottom sticky **Control Bar** (fills width, 56 px tall)  

## Core Components
| Component | Purpose |
|-----------|---------|
| **Paste Field** | Accepts / validates YouTube URL, auto‑clears on back navigation |
| **Start Button** | Primary action; disabled until URL passes regex |
| **Video Pane** | `<iframe>` YouTube player (muted) |
| **Audio Pane** | Hidden `<audio>` element for WebRTC Spanish stream |
| **Toggle Switch** | Two‑option segmented control: *Video* / *Audio‑only* |
| **Feedback Icon** | “!” button opens 3‑choice modal: Audio lag · Wrong verse · Other |
| **Snackbar** | Brief confirmations (e.g., “Switched to Audio‑only”) |

## Interaction Patterns
1. **Paste → Autovalidate → Tap Start**  
   - Success: cross‑fade to Listening State; spinner until first Spanish packet.  
2. **Toggle Video/Audio‑only**  
   - Instant client‑side swap; persists in `localStorage`.  
3. **Network Check (optional)**  
   - If `navigator.connection.downlink < 2` Mbps, prompt “Audio‑only recommended.”  
4. **Feedback Flow**  
   - Tapping icon opens bottom‑sheet modal → choose reason → toast “Thanks for helping improve translations.”  

## Visual Design Elements & Color Scheme
| Token | Color (Tailwind notation) | Usage |
|-------|---------------------------|-------|
| **Primary** | `sky-600` | Start button, toggle active |
| **Primary‑light** | `sky-100` | Toggle inactive background |
| **Text-default** | `zinc-900` (light) / `zinc-100` (dark) | Body copy |
| **Background** | `zinc-50` (light) / `zinc-900` (dark) | Page background |
| **Feedback** | `amber-500` | Feedback icon & toasts |

- Rounded corners `lg`, shadow `md`.  
- Subtle gradient overlay on video player in audio‑only mode.

## Mobile, Web App, Desktop Considerations
- **Mobile‑First** (360–428 px widths)  
  - Sticky control bar avoids thumb‑stretch; safe‑area padding for iPhone notch.  
- **Desktop**  
  - Input State centered 480 px card; Listening State keeps 16:9 video max‑width 720 px.  
- **Smart‑TV browsers** (future)  
  - All interactive targets ≥ 60 px; focus ring for remote D‑pad navigation.

## Typography
| Style | Font | Size / Weight |
|-------|------|---------------|
| Headline | *Geist Sans* / fallback `Inter` | 24 px / 700 |
| Body | Geist / Inter | 16 px / 400 |
| Button | Geist / Inter | 16 px / 600 (uppercase) |

## Accessibility
- **Color contrast** ≥ 4.5 : 1 for text against background.  
- All controls reachable via **keyboard** tab order; toggle labelled `aria-labelledby="view-mode"` with roles `radiogroup` / `radio`.  
- **Live region** (`role="status"`) announces latency or network prompts to screen readers.  
- Gesture‑free: no swipes required; all actions available as taps/clicks.  

---

> **Summary**: Option A delivers a one‑tap, ultra‑minimal flow suited to mobile‑first, low‑literacy listeners. Sticky controls keep critical actions visible, while optional bandwidth prompts and feedback modals prepare the path for iterative quality improvements without cluttering the initial experience.
