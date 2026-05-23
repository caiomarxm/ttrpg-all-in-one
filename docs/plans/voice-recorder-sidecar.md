# Plan: O Escriba (Node.js + dysnomia)

## Context

Discord enforced DAVE E2EE on all voice channels on March 2, 2026. py-cord's `start_recording()` cannot decrypt DAVE-encrypted audio — the library hard-codes a `RuntimeWarning` and the packet router crashes on every incoming packet. No fix is imminent (tracked at py-cord #3139).

Craig (craig.chat) solves this using their `dysnomia` fork of Eris + `@snazzah/davey`, which handles DAVE decryption transparently. We extract that pattern into **O Escriba**: a minimal Node.js bot whose only job is joining a voice channel and capturing per-speaker Recordings. O Cronista keeps all slash commands and Session orchestration.

**Key constraint:** one bot token = one Discord gateway connection. O Escriba needs its own Discord application and bot token. O Cronista controls it via HTTP over the Docker internal network.

---

## Target Architecture

```
User → /join  (O Cronista, Python)
  → generates sessionId
  → POST http://escriba:3000/sessions  { sessionId, guildId, channelId }
  → O Escriba joins channel, starts capturing Recordings
  → Cronista replies "Entrei em #canal! Gravando..."

User → /stop  (O Cronista, Python)
  → POST http://escriba:3000/sessions/{sessionId}/stop
  → O Escriba acknowledges immediately ({ ok: true })
  → Cronista replies "Sessão encerrada, gerando transcrição..."
  → O Escriba finishes writing WAV files to shared volume
  → O Escriba dispatches Celery task: transcribe_session(sessionId)
  → Transcription Service picks it up, runs Whisper, writes transcript.txt
```

**Cronista generates the session ID.** It owns Session lifecycle and passes the ID to O Escriba at `/join` time. This means the shared volume layout is always derivable from the session ID Cronista already holds.

**O Escriba dispatches the Celery task** (not Cronista). See ADR-0003.

**Shared volume layout:**
```
/data/recordings/{sessionId}/
  {userId}_{username}.wav   ← one per speaker
  transcript.txt            ← written by Transcription Service
```

---

## New Component: `app/discord/escriba/`

Node.js/TypeScript service. Single responsibility: join a voice channel, capture per-speaker Opus audio, decode to PCM, write WAV files, dispatch the transcription task.

### Directory structure

```
app/discord/escriba/
├── src/
│   ├── index.ts        # Entry: Discord bot + Fastify server startup
│   ├── config.ts       # RECORDER_TOKEN, RECORDINGS_DIR, PORT, RABBITMQ_URL
│   ├── recording.ts    # Recording class: join, onData, stop → WAV
│   └── server.ts       # Fastify HTTP API
├── package.json
├── tsconfig.json
├── .env.example
└── Dockerfile          # node:20-alpine, compile TS, run dist/index.js
```

### Key dependencies (Craig's proven set)

```json
{
  "eris": "github:CraigChat/dysnomia#cd792c8ee75970bb44d33baafb6c6ff7123e86f9",
  "@snazzah/davey": "^0.1.8",
  "@discordjs/opus": "^0.10.0",
  "sodium-native": "^4.1.1",
  "fastify": "^4",
  "amqplib": "^0.10"
}
```

### HTTP API

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /health | — | `{ ok: true }` |
| POST | /sessions | `{ sessionId, guildId, channelId }` | `{ ok: true }` |
| POST | /sessions/:id/stop | — | `{ ok: true }` |

No authentication — internal Docker network only.

### Audio capture (recording.ts)

1. `channel.join({ opusOnly: true })` — DAVE handled transparently by dysnomia
2. `connection.receive('opus')` → `receiver.on('data', onData)`
3. `onData(data: Buffer, userID: string, timestamp: number)`:
   - Skip mostly-zero packets (Cloudflare voice server artifact; per Craig)
   - Create `OpusDecoder(48000, 2)` per userID on first packet
   - Decode Opus → PCM, append to per-user `Buffer[]`
4. On `POST /sessions/:id/stop`:
   - Return `{ ok: true }` immediately
   - Disconnect from channel, flush PCM → WAV per speaker
   - Dispatch `transcribe_session` Celery task with `{ sessionId }`

### WAV output format

48000 Hz, 2 channels (stereo), 16-bit signed PCM.

File path: `/data/recordings/{sessionId}/{userId}_{username}.wav`

---

## Transcriber: `app/transcriber/`

Python/Celery worker. Single responsibility: consume `transcribe_session` tasks, run faster-whisper, write `transcript.txt`.

```
app/transcriber/
├── worker.py           # Celery app + transcribe_session task
├── config.py           # RABBITMQ_URL, RECORDINGS_DIR, WHISPER_MODEL
├── pyproject.toml
└── Dockerfile
```

### Task: `transcribe_session`

Payload: `{ sessionId: str }`

1. Glob `/data/recordings/{sessionId}/*.wav`
2. For each WAV: run `WhisperModel(config.WHISPER_MODEL, language='pt')`, collect `Segment(speaker, start, end, text)`
3. Merge all segments, sort by `start`
4. Write to `/data/recordings/{sessionId}/transcript.txt`

---

## O Cronista Changes

### `app/discord/cronista/config.py` — add fields

```python
RECORDER_URL: str = "http://escriba:3000"
SESSION_ID_PREFIX: str = "session"
```

### `app/discord/cronista/entrypoints/cogs/voice.py` — replace recording calls with HTTP

Cronista generates the session ID at `/join` and calls O Escriba. At `/stop` it fires the stop call and replies immediately in Portuguese without waiting for Recordings or Transcript.

```python
# /join
import uuid
self._session_id = f"{config.SESSION_ID_PREFIX}-{uuid.uuid4()}"
await client.post(f"{config.RECORDER_URL}/sessions", json={
    "sessionId": self._session_id,
    "guildId": ctx.guild_id,
    "channelId": channel.id,
})

# /stop
await client.post(f"{config.RECORDER_URL}/sessions/{self._session_id}/stop")
await ctx.followup.send("Sessão encerrada, gerando transcrição...")
self._session_id = None
```

### `app/discord/cronista/pyproject.toml` — add httpx

```
uv add httpx
```

### Remove from Cronista

- `app/discord/cronista/core/recording/sink.py`
- `app/discord/cronista/core/recording/session.py`
- `app/discord/cronista/tests/unit/test_sink.py`
- `app/discord/cronista/tests/unit/test_session.py`

### Keep in Cronista

- `app/discord/cronista/core/recording/models.py` — `VoiceSession`, `SpeakerTrack` (domain models)

---

## docker-compose.yml Changes

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management-alpine
    restart: unless-stopped
    ports:
      - "5672:5672"

  escriba:
    build:
      context: ./app/discord/escriba
      dockerfile: Dockerfile
    env_file: ./app/discord/escriba/.env
    restart: unless-stopped
    volumes:
      - ./data/recordings:/data/recordings
    environment:
      RABBITMQ_URL: amqp://rabbitmq:5672

  transcriber:
    build:
      context: ./app/transcriber
      dockerfile: Dockerfile
    env_file: ./app/transcriber/.env
    restart: unless-stopped
    volumes:
      - ./data/recordings:/data/recordings
    environment:
      RABBITMQ_URL: amqp://rabbitmq:5672
    depends_on:
      - rabbitmq

  cronista:
    environment:
      RECORDER_URL: http://escriba:3000
    volumes:
      - ./data/recordings:/data/recordings
```

---

## Manual Prerequisite (before Slice B)

1. Create a second Discord application at discord.com/developers
2. Create a bot user, copy the token → `RECORDER_TOKEN` in `app/discord/escriba/.env`
3. Invite O Escriba to the server with `CONNECT` + `USE_VOICE_ACTIVITY` permissions (no message permissions needed)

---

## Vertical Slices

### Slice A — O Escriba scaffold
- Node.js/TS project, Fastify, `/health` + stub `/sessions` and `/sessions/:id/stop` endpoints (no Discord yet)
- Dockerfile + docker-compose `escriba` service + shared volume
- Tests: HTTP contract tests against the running server
- **Done when:** `docker compose up` starts an `escriba` service and `/health` returns 200

### Slice B — Discord voice connection *(needs O Escriba bot token)*
- dysnomia bot connects to Discord gateway
- `POST /sessions` triggers `channel.join({ opusOnly: true })` + `connection.receive('opus')`
- `POST /sessions/:id/stop` triggers disconnect
- Log packet arrivals (no audio writing yet)
- **Done when:** O Escriba visibly joins/leaves the voice channel on command

### Slice C — Audio capture → WAV + RabbitMQ task dispatch
- `OpusDecoder` per speaker, accumulate PCM, write WAV on stop
- After WAVs written, dispatch `transcribe_session` Celery task via RabbitMQ
- RabbitMQ added to docker-compose
- **Done when:** WAV files appear in `./data/recordings/{sessionId}/` after stop; task visible in RabbitMQ management UI

### Slice D — Transcription Service
- New `app/transcriber/` Python/Celery worker
- Consumes `transcribe_session`, runs faster-whisper (PT-BR), writes `transcript.txt`
- **Done when:** `transcript.txt` appears in the session folder after stop

### Slice E — Cronista integration
- Add `httpx` dependency
- Rewrite `VoiceCog` to call O Escriba HTTP API, generate session ID, reply in Portuguese
- Remove `sink.py`, `session.py`, and their tests
- Update `test_voice_cog.py` to mock HTTP calls
- **Done when:** `/join` + `/stop` end-to-end works, `transcript.txt` produced, `just test-bot-unit` passes

---

## Files Touched

| Action | Path |
|--------|------|
| Create | `app/discord/escriba/` (entire new service — O Escriba) |
| Create | `app/discord/escriba/.env.example` |
| Create | `app/transcriber/` (entire new service) |
| Create | `app/transcriber/.env.example` |
| Modify | `docker-compose.yml` |
| Modify | `app/discord/cronista/config.py` |
| Modify | `app/discord/cronista/entrypoints/cogs/voice.py` |
| Modify | `app/discord/cronista/pyproject.toml` |
| Modify | `app/discord/cronista/tests/unit/test_voice_cog.py` |
| Delete | `app/discord/cronista/core/recording/sink.py` |
| Delete | `app/discord/cronista/core/recording/session.py` |
| Delete | `app/discord/cronista/tests/unit/test_sink.py` |
| Delete | `app/discord/cronista/tests/unit/test_session.py` |

---

## Verification

1. `docker compose up --build` — `escriba`, `transcriber`, `rabbitmq`, and `cronista` all start cleanly
2. Invite both bots to the test server
3. Join a voice channel, run `/join` — O Escriba joins the same channel
4. Speak for a few seconds, run `/stop` — O Cronista replies "Sessão encerrada, gerando transcrição..." immediately; O Escriba leaves
5. `ls ./data/recordings/{sessionId}/` — WAV files + `transcript.txt` present
6. `just test-bot-unit` — all Python tests pass
