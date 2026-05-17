# Cronista Bot

Discord interface for O Cronista — records RPG sessions and triggers transcription.

## Commands

| Command | Behavior |
|---|---|
| `/ping` | Health check |
| `/join` | Joins your voice channel, starts recording each speaker separately |
| `/stop` | Stops recording, transcribes (PT-BR), saves transcript, replies with path |
| `/discard` | Abandons the session — stops recording, deletes audio, no transcript |

## Setup

```bash
cp app/cronista/bot/.env.example app/cronista/bot/.env
# fill in BOT_TOKEN and SERVER_ID
just venv
just test-bot
```

## Discord App Setup

1. Create an application named "O Cronista" at discord.com/developers/applications
2. Bot tab → Add Bot → copy Token
3. Enable **Server Members Intent** and **Voice State Intent**
4. OAuth2 → URL Generator → scopes: `bot` + `applications.commands` → permissions: Connect, Use Voice Activity, View Channels, Send Messages, Attach Files → invite to server
5. Right-click server → Copy Server ID (requires Developer Mode)

## Running

```bash
# Local
PYTHONPATH=app/cronista/bot uv run python app/cronista/bot/entrypoints/bot.py

# Docker
just run-bot
```

## Tests

```bash
just test-bot-unit     # unit tests only
just test-bot          # all tests (unit + integration)
```

Integration tests require `ffmpeg` and download the Whisper `small` model (~460 MB) on first run.
