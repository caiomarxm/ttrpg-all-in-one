from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from core.recording.models import VoiceSession


def _valid_session() -> VoiceSession:
    return VoiceSession(guild_id=1, channel_id=2, started_at=datetime.now(UTC))


def test_voice_session_valid() -> None:
    s = _valid_session()
    assert s.guild_id == 1
    assert s.channel_id == 2
    assert isinstance(s.started_at, datetime)


def test_voice_session_missing_guild_id() -> None:
    with pytest.raises(ValidationError):
        VoiceSession(channel_id=2, started_at=datetime.now(UTC))  # type: ignore[call-arg]


def test_voice_session_missing_channel_id() -> None:
    with pytest.raises(ValidationError):
        VoiceSession(guild_id=1, started_at=datetime.now(UTC))  # type: ignore[call-arg]


def test_voice_session_missing_started_at() -> None:
    with pytest.raises(ValidationError):
        VoiceSession(guild_id=1, channel_id=2)  # type: ignore[call-arg]


def test_voice_session_rejects_str_guild_id() -> None:
    with pytest.raises(ValidationError):
        VoiceSession(guild_id="not-an-int", channel_id=2, started_at=datetime.now(UTC))  # type: ignore[arg-type]


def test_voice_session_rejects_str_channel_id() -> None:
    with pytest.raises(ValidationError):
        VoiceSession(guild_id=1, channel_id="not-an-int", started_at=datetime.now(UTC))  # type: ignore[arg-type]
