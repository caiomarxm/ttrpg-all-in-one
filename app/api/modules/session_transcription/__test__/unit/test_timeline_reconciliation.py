import json
from pathlib import Path

import pytest

from modules.session_transcription.core.service.timeline_reconciliation import (
    format_session_timestamp,
    load_session_manifest,
    reconcile_segments,
)
from modules.session_transcription.core.service.transcription_service import format_transcript
from modules.session_transcription.http.client.whisper_client import WhisperSegment
from modules.session_transcription.http.dto.session_manifest import (
    SessionManifest,
    SessionManifestAudio,
    SpeakerManifestEntry,
    SpeakingBurst,
)

BYTES_PER_SECOND = 192_000


def _manifest(*speakers: tuple[str, str, list[SpeakingBurst]]) -> SessionManifest:
    return SessionManifest(
        version=1,
        session_id="session-1",
        session_started_at_ms=1_000_000,
        audio=SessionManifestAudio(
            sample_rate=48_000,
            channels=2,
            bit_depth=16,
            bytes_per_second=BYTES_PER_SECOND,
        ),
        speakers={
            user_id: SpeakerManifestEntry(
                user_id=user_id,
                username=username,
                wav_file=f"{user_id}_{username}.wav",
                speaking_bursts=bursts,
            )
            for user_id, username, bursts in speakers
        },
    )


def test_format_session_timestamp() -> None:
    assert format_session_timestamp(0) == "[00:00:00]"
    assert format_session_timestamp(65) == "[00:01:05]"
    assert format_session_timestamp(3823) == "[01:03:43]"


def test_format_transcript_uses_hh_mm_ss() -> None:
    content = format_transcript(
        [
            WhisperSegment(speaker="alice", start=65.0, end=66.0, text="hello"),
        ]
    )
    assert content == "[00:01:05] alice: hello\n"


def test_reconcile_scattered_burst_maps_to_session_offset() -> None:
    thirty_sec_bytes = 30 * BYTES_PER_SECOND
    manifest = _manifest(
        (
            "user-1",
            "alice",
            [
                SpeakingBurst(
                    session_offset_ms=0,
                    wav_offset_bytes=0,
                    pcm_bytes=thirty_sec_bytes,
                ),
                SpeakingBurst(
                    session_offset_ms=2_400_000,
                    wav_offset_bytes=thirty_sec_bytes,
                    pcm_bytes=thirty_sec_bytes,
                ),
            ],
        ),
    )
    wav_path = Path("user-1_alice.wav")

    reconciled = reconcile_segments(
        [WhisperSegment(speaker="alice", start=35.0, end=36.0, text="later")],
        manifest,
        wav_path,
    )

    assert reconciled[0].start == pytest.approx(2405.0)
    assert reconciled[0].end == pytest.approx(2406.0)


def test_reconcile_two_speakers_alternating() -> None:
    manifest = _manifest(
        (
            "user-1",
            "alice",
            [
                SpeakingBurst(
                    session_offset_ms=0,
                    wav_offset_bytes=0,
                    pcm_bytes=10 * BYTES_PER_SECOND,
                ),
            ],
        ),
        (
            "user-2",
            "bob",
            [
                SpeakingBurst(
                    session_offset_ms=60_000,
                    wav_offset_bytes=0,
                    pcm_bytes=10 * BYTES_PER_SECOND,
                ),
            ],
        ),
    )

    alice = reconcile_segments(
        [WhisperSegment(speaker="alice", start=0.0, end=1.0, text="first")],
        manifest,
        Path("user-1_alice.wav"),
    )
    bob = reconcile_segments(
        [WhisperSegment(speaker="bob", start=0.0, end=1.0, text="second")],
        manifest,
        Path("user-2_bob.wav"),
    )

    combined = format_transcript(alice + bob)
    lines = combined.strip().split("\n")
    assert lines[0].startswith("[00:00:00] alice:")
    assert lines[1].startswith("[00:01:00] bob:")


def test_load_session_manifest_raises_when_missing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="session_manifest.json"):
        load_session_manifest(tmp_path)


def test_load_session_manifest_reads_file(tmp_path: Path) -> None:
    manifest = _manifest(
        (
            "user-1",
            "alice",
            [
                SpeakingBurst(
                    session_offset_ms=0,
                    wav_offset_bytes=0,
                    pcm_bytes=BYTES_PER_SECOND,
                ),
            ],
        ),
    )
    manifest_path = tmp_path / "session_manifest.json"
    manifest_path.write_text(json.dumps(manifest.model_dump()), encoding="utf-8")

    loaded = load_session_manifest(tmp_path)
    assert loaded.session_id == "session-1"
    assert loaded.speakers["user-1"].username == "alice"
