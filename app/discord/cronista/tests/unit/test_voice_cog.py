from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from entrypoints.cogs.voice import RecorderSessionConflictError, VoiceCog

_FIXED_UUID = UUID("00000000-0000-4000-8000-000000000001")


def _make_cog() -> VoiceCog:
    bot = MagicMock()
    config = MagicMock()
    config.RECORDER_URL = "http://escriba:3000"
    config.SESSION_ID_PREFIX = "session"
    return VoiceCog(bot, config)


def _make_ctx(*, in_voice: bool) -> AsyncMock:
    ctx = AsyncMock()
    ctx.guild_id = 999

    if in_voice:
        channel = MagicMock()
        channel.id = 111
        channel.name = "Taverna"
        ctx.author.voice = MagicMock(channel=channel)
    else:
        ctx.author.voice = None

    return ctx


@contextmanager
def _patch_http_client():
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("entrypoints.cogs.voice.httpx.AsyncClient", mock_client_cls):
        yield mock_client


@pytest.mark.asyncio
async def test_join_when_not_in_voice_channel() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=False)

    await cog.join.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True
    assert cog._session_id is None


@pytest.mark.asyncio
async def test_join_when_session_already_active() -> None:
    cog = _make_cog()
    cog._session_id = "session-existing"
    ctx = _make_ctx(in_voice=True)

    await cog.join.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True
    assert "/stop" in ctx.respond.call_args.args[0]
    ctx.defer.assert_not_awaited()


@pytest.mark.asyncio
@patch("entrypoints.cogs.voice.uuid.uuid4", return_value=_FIXED_UUID)
async def test_join_posts_to_recorder(_mock_uuid: MagicMock) -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True)

    with _patch_http_client() as mock_client:
        await cog.join.callback(cog, ctx)

    ctx.defer.assert_awaited_once()
    mock_client.post.assert_awaited_once_with(
        "http://escriba:3000/sessions",
        json={
            "sessionId": f"session-{_FIXED_UUID}",
            "guildId": "999",
            "channelId": "111",
        },
        timeout=30.0,
    )
    assert cog._session_id == f"session-{_FIXED_UUID}"
    ctx.followup.send.assert_awaited_once()
    assert "Gravando" in ctx.followup.send.call_args.args[0]


@pytest.mark.asyncio
@patch("entrypoints.cogs.voice.uuid.uuid4", return_value=_FIXED_UUID)
async def test_join_handles_escriba_409(_mock_uuid: MagicMock) -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True)

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 409
    mock_response.raise_for_status = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("entrypoints.cogs.voice.httpx.AsyncClient", mock_client_cls):
        await cog.join.callback(cog, ctx)

    ctx.defer.assert_awaited_once()
    mock_response.raise_for_status.assert_not_called()
    assert cog._session_id is None
    ctx.followup.send.assert_awaited_once()
    assert "Escriba" in ctx.followup.send.call_args.args[0]


@pytest.mark.asyncio
async def test_start_recording_raises_on_409() -> None:
    cog = _make_cog()

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 409
    mock_client.post = AsyncMock(return_value=mock_response)

    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("entrypoints.cogs.voice.httpx.AsyncClient", mock_client_cls):
        with pytest.raises(RecorderSessionConflictError):
            await cog._start_recording("session-new", 999, 111)


@pytest.mark.asyncio
async def test_stop_when_no_active_session() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True)

    await cog.stop.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True


@pytest.mark.asyncio
async def test_stop_posts_stop_and_replies_in_portuguese() -> None:
    cog = _make_cog()
    cog._session_id = "session-abc"
    ctx = _make_ctx(in_voice=True)

    with _patch_http_client() as mock_client:
        await cog.stop.callback(cog, ctx)

    ctx.defer.assert_awaited_once()
    mock_client.post.assert_awaited_once_with(
        "http://escriba:3000/sessions/session-abc/stop",
        timeout=30.0,
    )
    assert cog._session_id is None
    ctx.followup.send.assert_awaited_once_with(
        "Sessão encerrada, gerando transcrição..."
    )


@pytest.mark.asyncio
async def test_discard_when_no_active_session() -> None:
    cog = _make_cog()
    ctx = _make_ctx(in_voice=True)

    await cog.discard.callback(cog, ctx)

    ctx.respond.assert_awaited_once()
    call_kwargs = ctx.respond.call_args.kwargs
    assert call_kwargs.get("ephemeral") is True
    ctx.defer.assert_not_awaited()


@pytest.mark.asyncio
async def test_discard_posts_discard_and_replies() -> None:
    cog = _make_cog()
    cog._session_id = "session-abc"
    ctx = _make_ctx(in_voice=True)

    with _patch_http_client() as mock_client:
        await cog.discard.callback(cog, ctx)

    ctx.defer.assert_awaited_once_with(ephemeral=True)
    mock_client.post.assert_awaited_once_with(
        "http://escriba:3000/sessions/session-abc/discard",
        timeout=30.0,
    )
    assert cog._session_id is None
    ctx.followup.send.assert_awaited_once_with("Sessão descartada.")
