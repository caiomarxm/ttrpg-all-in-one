import io
import wave
from datetime import UTC, datetime
from pathlib import Path

import discord.sinks

from core.recording.sink import _CHANNELS, _FRAME_RATE, _SAMPLE_WIDTH, CronistaAudioSink


def _pcm_frames(n_frames: int = 480) -> bytes:
    return b"\x00" * n_frames * _CHANNELS * _SAMPLE_WIDTH


def _feed(sink: CronistaAudioSink, user: int, data: bytes) -> None:
    """Bypass the Filters.container decorator to directly populate audio_data."""
    if user not in sink.audio_data:
        sink.audio_data[user] = discord.sinks.AudioData(io.BytesIO())
        sink._started_at[user] = datetime.now(UTC)
    sink.audio_data[user].write(data)


def test_cleanup_writes_one_wav_per_user(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path, usernames={1: "Alice", 2: "Bob"})
    _feed(sink, 1, _pcm_frames(480))
    _feed(sink, 2, _pcm_frames(480))

    tracks = sink.cleanup()

    assert len(tracks) == 2
    user_ids = {t.user_id for t in tracks}
    assert user_ids == {1, 2}
    for track in tracks:
        assert track.wav_path.exists()
        assert track.wav_path.stat().st_size > 0


def test_wav_files_have_correct_format(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path)
    _feed(sink, 99, _pcm_frames(480))

    tracks = sink.cleanup()

    with wave.open(str(tracks[0].wav_path), "rb") as wf:
        assert wf.getnchannels() == _CHANNELS
        assert wf.getsampwidth() == _SAMPLE_WIDTH
        assert wf.getframerate() == _FRAME_RATE


def test_username_falls_back_to_user_id_string(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path)
    _feed(sink, 42, _pcm_frames())

    tracks = sink.cleanup()

    assert tracks[0].username == "42"
    assert "42" in tracks[0].wav_path.name


def test_username_from_provided_map(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path, usernames={7: "Gandalf"})
    _feed(sink, 7, _pcm_frames())

    tracks = sink.cleanup()

    assert tracks[0].username == "Gandalf"
    assert "Gandalf" in tracks[0].wav_path.name


def test_started_at_recorded_per_user(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path)
    before = datetime.now(UTC)
    _feed(sink, 1, _pcm_frames())
    _feed(sink, 2, _pcm_frames())

    tracks = sink.cleanup()

    for track in tracks:
        assert track.started_at >= before


def test_cleanup_on_empty_sink_returns_empty_list(tmp_path: Path) -> None:
    sink = CronistaAudioSink(tmp_path)
    tracks = sink.cleanup()
    assert tracks == []
