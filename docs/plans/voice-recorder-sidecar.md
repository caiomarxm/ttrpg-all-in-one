# Plan: Voice Recorder Sidecar (Node.js + dysnomia)

## Context

Discord enforced DAVE E2EE on all voice channels on March 2, 2026. py-cord's `start_recording()` cannot decrypt DAVE-encrypted audio — the library hard-codes a `RuntimeWarning` and the packet router crashes on every incoming packet. No fix is imminent (tracked at py-cord #3139).

Craig (craig.chat) solves this using their `dysnomia` fork of Eris + `@snazzah/davey`, which handles DAVE decryption transparently inside the library. We extract that pattern into a minimal standalone Node.js sidecar whose only job is voice capture. Cronista (Python/py-cord) keeps all slash commands and session orchestration.

**Key constraint:** one bot token = one Discord gateway connection. The sidecar needs its own Discord application and bot token. Cronista controls it via HTTP over the Docker internal network.

---

## Target Architecture

```
User → /join  (Cronista, Python)
  → POST http://recorder:3000/sessions  { guildId, channelId, usernames }
  → Recorder bot (Node.js + dysnomia + davey) joins channel, starts capture
  → Cronista replies "Recording started"

User → /stop  (Cronista, Python)
  → DELETE http://recorder:3000/sessions/{id}
  → Recorder decodes Opus → PCM, writes WAV per speaker to shared volume
  → Returns [{ userId, username, wavPath }]
  → Cronista maps to SpeakerTrack[], runs Whisper, replies with summary
```

**Shared volume:** `./data/recordings` mounted at `/data/recordings` in both containers.

---

## New Component: `services/recorder/`

Node.js/TypeScript service. Single responsibility: join a voice channel, capture per-speaker Opus audio, decode to PCM, write WAV files.

### Directory structure

```
services/recorder/
├── src/
│   ├── index.ts        # Entry: Discord bot + Fastify server startup
│   ├── config.ts       # RECORDER_TOKEN, SERVER_ID, RECORDINGS_DIR, PORT
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
  "fastify": "^4"
}
```

### HTTP API

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /health | — | `{ ok: true }` |
| POST | /sessions | `{ guildId, channelId, usernames: { [userId]: string } }` | `{ sessionId }` |
| DELETE | /sessions/:id | — | `{ tracks: [{ userId, username, wavPath }] }` |

No authentication — internal Docker network only.

### Audio capture (recording.ts)

1. `channel.join({ opusOnly: true })` — DAVE handled transparently by dysnomia
2. `connection.receive('opus')` → `receiver.on('data', onData)`
3. `onData(data: Buffer, userID: string, timestamp: number)`:
   - Skip mostly-zero packets (Cloudflare voice server artifact; per Craig)
   - Create `OpusDecoder(48000, 2)` per userID on first packet
   - Decode Opus → PCM, append to per-user `Buffer[]`
   - Record `startedAt` on first packet per user
4. On `DELETE /sessions/:id`:
   - Stop receiver, disconnect from channel
   - For each user: concatenate PCM buffers, write WAV
   - Return track list with absolute file paths

### WAV output format

48000 Hz, 2 channels (stereo), 16-bit signed PCM — matches the existing `CronistaAudioSink` format so Whisper integration requires no changes.

File path: `/data/recordings/{sessionId}/{userId}_{username}.wav`

---

## Cronista Changes

### `services/discord_bot/config.py` — add one field

```python
RECORDER_URL: str = "http://recorder:3000"
```

### `services/discord_bot/entrypoints/cogs/voice.py` — replace recording calls with HTTP

`_attach_recording` and `_finish_recording` are replaced by `httpx` async calls:

```python
# /join
resp = await client.post(f"{config.RECORDER_URL}/sessions", json={
    "guildId": ctx.guild_id,
    "channelId": channel.id,
    "usernames": {m.id: m.name for m in channel.members},
})
self._session_id = resp.json()["sessionId"]

# /stop
resp = await client.delete(f"{config.RECORDER_URL}/sessions/{self._session_id}")
tracks = [SpeakerTrack(**t) for t in resp.json()["tracks"]]
```

Cronista no longer connects to voice at all — no `vc.start_recording()`, no `vc.stop_recording()`.

### `services/discord_bot/pyproject.toml` — add httpx

```
uv add httpx
```

### Remove from Cronista

- `services/discord_bot/core/recording/sink.py` — `CronistaAudioSink` (py-cord sink, replaced by sidecar)
- `services/discord_bot/core/recording/session.py` — `RecordingSession` (replaced by sidecar)
- `services/discord_bot/tests/unit/test_sink.py`
- `services/discord_bot/tests/unit/test_session.py`

### Keep in Cronista

- `services/discord_bot/core/recording/models.py` — `VoiceSession`, `SpeakerTrack` (domain models, still used)
- All transcription code (unblocked by this work)

---

## docker-compose.yml Changes

```yaml
services:
  recorder:
    build:
      context: ./services/recorder
      dockerfile: Dockerfile
    env_file: ./services/recorder/.env
    restart: unless-stopped
    volumes:
      - ./data/recordings:/data/recordings

  discord-bot:
    environment:
      RECORDER_URL: http://recorder:3000
    # existing volumes already include data/recordings
```

---

## Manual Prerequisite (before Slice B)

1. Create a second Discord application at discord.com/developers
2. Create a bot user, copy the token → `RECORDER_TOKEN` in `services/recorder/.env`
3. Invite the recorder bot to the server with `CONNECT` + `USE_VOICE_ACTIVITY` permissions (no message permissions needed)

---

## Vertical Slices

### Slice A — Sidecar scaffold
- Node.js/TS project, Fastify, `/health` + mock `/sessions` endpoints (no Discord yet)
- Dockerfile + docker-compose `recorder` service + shared volume
- Tests: HTTP contract tests against the running server
- **Done when:** `docker compose up` starts a `recorder` service and `/health` returns 200

### Slice B — Discord voice connection *(needs recorder bot token)*
- dysnomia bot connects to Discord gateway
- `POST /sessions` triggers `channel.join({ opusOnly: true })` + `connection.receive('opus')`
- `DELETE /sessions/:id` triggers disconnect
- Log packet arrivals (no audio writing yet)
- **Done when:** recorder bot visibly joins/leaves the voice channel on command

### Slice C — Audio capture → WAV
- `OpusDecoder` per speaker, accumulate PCM, write WAV on stop
- `DELETE /sessions/:id` returns `{ tracks: [...] }`
- **Done when:** WAV files appear in `./data/recordings/` after `/stop`, one per speaker

### Slice D — Cronista integration
- Add `httpx` dependency
- Rewrite `VoiceCog` to call recorder HTTP API instead of py-cord recording
- Remove `sink.py`, `session.py`, and their tests
- Update `test_voice_cog.py` to mock HTTP calls
- **Done when:** `/join` + `/stop` end-to-end works and `just test-bot-unit` passes

---

## Files Touched

| Action | Path |
|--------|------|
| Create | `services/recorder/` (entire new service) |
| Create | `services/recorder/.env.example` |
| Modify | `docker-compose.yml` |
| Modify | `services/discord_bot/config.py` |
| Modify | `services/discord_bot/entrypoints/cogs/voice.py` |
| Modify | `services/discord_bot/pyproject.toml` |
| Modify | `services/discord_bot/tests/unit/test_voice_cog.py` |
| Delete | `services/discord_bot/core/recording/sink.py` |
| Delete | `services/discord_bot/core/recording/session.py` |
| Delete | `services/discord_bot/tests/unit/test_sink.py` |
| Delete | `services/discord_bot/tests/unit/test_session.py` |

---

## Verification

1. `docker compose up --build` — both `discord-bot` and `recorder` start cleanly, no errors
2. Invite both bots to the test server
3. Join a voice channel, run `/join` — recorder bot joins the same channel
4. Speak for a few seconds, run `/stop` — recorder bot leaves
5. `ls ./data/recordings/` — WAV files present, one per speaker
6. `just test-bot-unit` — all Python tests pass
