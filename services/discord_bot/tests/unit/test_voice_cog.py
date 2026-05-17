import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from entrypoints.cogs.voice import VoiceCog


def _make_cog(recordings_dir: Path = Path("/tmp/test_recordings")) -> VoiceCog:
    bot = MagicMock()
    config = MagicMock()
    config.RECORDINGS_DIR = recordings_dir
    return VoiceCog(bot, config)


def _make_ctx(*, in_voice: bool, bot_connected: bool) -> AsyncMock:
    ctx = AsyncMock()
    ctx.guild_id = 999

    if in_voice:
        channel = MagicMock()
        channel.id = 111
        channel.name = "Taverna"
        channel.connect = AsyncMock()
        ctx.author.voice = MagicMock(channel=channel)
    else:
        ctx.author.voice = None

    if bot_connected:
        ctx.voice_client = AsyncMock()
    else:
        ctx.voice_client = None

    return ctx


@pytest.mark.asyncio
async def test_join_when_not_in_voice_channel() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=False, bot_connected=False)

    await cog.join.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True
    assert cog._session is None


@pytest.mark.asyncio
async def test_join_connects_bot_and_creates_session() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True, bot_connected=False)

    await cog.join.callback(cog, ctx)

    ctx.defer.assert_awaited_once()
    ctx.author.voice.channel.connect.assert_awaited_once()
    assert cog._session is not None
    assert cog._session.guild_id == 999
    assert cog._session.channel_id == 111
    ctx.followup.send.assert_awaited_once()


@pytest.mark.asyncio
async def test_stop_when_bot_not_connected() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True, bot_connected=False)

    await cog.stop.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True


@pytest.mark.asyncio
async def test_stop_disconnects_and_clears_session() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True, bot_connected=True)

    # Pre-seed a resolved future so stop() doesn't wait on a real recording
    loop = asyncio.get_event_loop()
    future: asyncio.Future[list] = loop.create_future()
    future.set_result([])
    cog._recording_done = future

    ctx.voice_client.is_recording = MagicMock(return_value=True)
    ctx.voice_client.stop_recording = MagicMock()

    await cog.stop.callback(cog, ctx)

    ctx.voice_client.disconnect.assert_awaited_once()
    assert cog._session is None
    ctx.followup.send.assert_awaited_once()
