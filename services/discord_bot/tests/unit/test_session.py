from pathlib import Path

from core.recording.session import RecordingSession
from core.recording.sink import CronistaAudioSink


def test_start_creates_output_directory(tmp_path: Path) -> None:
    session = RecordingSession(tmp_path / "recordings")
    session.start()
    assert session.output_dir.exists()
    assert session.output_dir.is_dir()


def test_output_dir_is_under_recordings_root(tmp_path: Path) -> None:
    root = tmp_path / "recordings"
    session = RecordingSession(root)
    session.start()
    assert session.output_dir.parent == root


def test_start_returns_cronista_audio_sink(tmp_path: Path) -> None:
    session = RecordingSession(tmp_path)
    sink = session.start()
    assert isinstance(sink, CronistaAudioSink)


def test_stop_before_start_returns_empty_list(tmp_path: Path) -> None:
    session = RecordingSession(tmp_path)
    tracks = session.stop()
    assert tracks == []


def test_stop_returns_speaker_tracks(tmp_path: Path) -> None:
    import io
    from datetime import UTC, datetime

    import discord.sinks

    from core.recording.sink import _CHANNELS, _SAMPLE_WIDTH

    session = RecordingSession(tmp_path / "recordings", usernames={1: "Frodo"})
    session.start()

    pcm = b"\x00" * 480 * _CHANNELS * _SAMPLE_WIDTH
    sink = session._sink
    assert sink is not None
    sink.audio_data[1] = discord.sinks.AudioData(io.BytesIO())
    sink._started_at[1] = datetime.now(UTC)
    sink.audio_data[1].write(pcm)

    tracks = session.stop()

    assert len(tracks) == 1
    assert tracks[0].user_id == 1
    assert tracks[0].username == "Frodo"
    assert tracks[0].wav_path.exists()
