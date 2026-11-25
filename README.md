# CREOVOX AI

CREOVOX AI is an AI-powered digital media production platform. It turns **one long-form video into a full content kit**: transcript, highlights, edited clips, multilingual subtitles, thumbnails, platform-ready titles, descriptions, captions and hashtags, and audience-specific versions. Everything happens in one workspace.

```
React + Vite (5173) ──/api──► FastAPI (8000) ──► PostgreSQL
                                   │ jobs table
                                   ▼
                             Worker ── ffmpeg · Whisper (Groq or local) · LLM (Groq or Claude)
                                   │
                             server/storage/  (videos, frames, renders, zip packages)
```

| Module | How it works |
|---|---|
| Sign-in (required for the Studio) | Google Sign-In or a 6-digit email code. Sessions use an httpOnly cookie. |
| Upload | The video streams to the server (up to 2 GB). The server reads its metadata with ffprobe and captures a poster frame. A browser-playable proxy is made when needed. |
| Analysis | Real audio waveform, then Whisper transcription with word timestamps and language detection, then AI highlight detection, then subtitle cues. |
| Subtitle Studio | Edit cues and style. AI translation covers Tamil, Hindi, Spanish, French, Japanese and more. SRT/VTT import and export. |
| Thumbnail Studio | Candidate frames come from your video. A vision model picks the strongest ones and writes the overlay text. |
| Content Writer | Titles, descriptions (with chapters), captions and hashtags per platform and tone. |
| Audience | Student, professional and general-audience versions in the language you choose. |
| Export Studio | ffmpeg renders MP4/WebM clips at 16:9, 9:16 or 1:1 with burned-in styled subtitles, plus a ZIP of the whole content package. |

---

## Prerequisites

- **Node.js 20+** and npm
- **Python 3.11+** and [**uv**](https://docs.astral.sh/uv/) (`brew install uv`)
- **Docker**, for PostgreSQL
- **ffmpeg** (`brew install ffmpeg`)

### API keys: what's needed?

| Key | Required? | Used for | Without it |
|---|---|---|---|
| `GROQ_API_KEY` ([console.groq.com/keys](https://console.groq.com/keys)) | Recommended | AI highlights, translation, content, audience, thumbnail picks **and** fast Whisper transcription | Transcription runs locally with faster-whisper (slower; downloads a ~460 MB model on first use). The AI features fall back to templates or an audio heuristic. |
| `ANTHROPIC_API_KEY` | Optional | Use Claude (`claude-opus-5-5`) instead of Groq for the AI features (`AI_PROVIDER=anthropic`) | n/a |
| `GOOGLE_CLIENT_ID` | Optional | The "Continue with Google" button | Email-code sign-in still works |
| `SMTP_*` | Optional in development | Emailing sign-in codes to real inboxes | Codes print in the API terminal |

To get a Google Client ID: open Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** → *Web application*, and add `http://localhost:5173` under **Authorised JavaScript origins**.

---

## Setup

```bash
# 1. Frontend dependencies
npm install

# 2. Backend dependencies and config
cd server
uv sync
cp .env.example .env          # then add your keys (GROQ_API_KEY, GOOGLE_CLIENT_ID, …)

# 3. Database
docker compose up -d db       # PostgreSQL 16 on localhost:5432
uv run alembic upgrade head   # create the tables
```

**No Docker?** For a single-machine demo, use SQLite: set `DATABASE_URL=sqlite:///./creovox.db` in `server/.env`, then run `uv run alembic upgrade head`. Everything works the same. Use PostgreSQL if several workers or users will run at once.

## Run (3 terminals)

```bash
# Terminal 1: API
cd server && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2: background worker (transcription, AI, rendering)
cd server && uv run python -m app.worker

# Terminal 3: frontend
npm run dev                   # http://localhost:5173
```

Open http://localhost:5173 and click **Open Studio**, which takes you to the sign-in page. Without SMTP configured, the 6-digit code appears in the **API terminal**.
#test user
gmail=adminwebsite23@gmail.com
pass=Admin@123
GOOGLE_CLIENT_ID=565350766558-pviur3t2jvbe9dmrjg14uuodsrm3ic53.apps.googleusercontent.com

Health check: `curl http://localhost:8000/api/health`. It reports the database, ffmpeg, the AI provider, the transcriber and the sign-in methods. Interactive API docs are at http://localhost:8000/api/docs.

### Everything in Docker (optional)

```bash
docker compose --profile full up -d --build   # db + api + worker
npm run dev
```

---

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://creovox:creovox@localhost:5432/creovox` | |
| `SESSION_SECRET` | dev value | **Set a long random string in production** (`openssl rand -hex 32`) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed origins |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `AI_PROVIDER` | `auto` | `auto` (Groq if its key is set, else Claude), `groq`, `anthropic`, or `none` |
| `GROQ_MODEL` / `GROQ_VISION_MODEL` | `openai/gpt-oss-120b` / `qwen/qwen3.8-27b` | |
| `CLAUDE_MODEL` | `claude-opus-5-5` | |
| `TRANSCRIBE_PROVIDER` | `auto` | `auto` (Groq Whisper if its key is set, else local), `groq`, or `local` |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | |
| `WHISPER_MODEL` | `small` | Local faster-whisper model (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `STORAGE_DIR` | `server/storage` | Uploaded videos and generated files |
| `MAX_UPLOAD_BYTES` | 2 GB | |

## Tests

```bash
cd server && uv run pytest     # backend (SQLite, no network)
npm run build                  # frontend type-check + production build
```

## Security notes

- Every `/studio` route requires a signed-in session. Every API route checks project ownership, and other users' IDs return 404.
- Email codes are stored only as HMAC hashes. They expire after 10 minutes, allow 5 attempts, can't be reused, and are rate-limited per email and per IP.
- Session tokens are random, stored hashed, httpOnly, SameSite=Lax. Cross-origin writes are rejected.
- `server/.env` and `server/storage/` are git-ignored. Never commit API keys.
