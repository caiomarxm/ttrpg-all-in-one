from datetime import UTC, datetime
from pathlib import Path

from core.recording.models import SpeakerTrack
from core.recording.sink import CronistaAudioSink


class RecordingSession:
    def __init__(
        self,
        recordings_root: Path,
        usernames: dict[int, str] | None = None,
    ) -> None:
        ts = datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")
        self._output_dir = recordings_root / ts
        self._usernames = usernames
        self._sink: CronistaAudioSink | None = None

    @property
    def output_dir(self) -> Path:
        return self._output_dir

    def start(self) -> CronistaAudioSink:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._sink = CronistaAudioSink(self._output_dir, self._usernames)
        return self._sink

    def stop(self) -> list[SpeakerTrack]:
        if self._sink is None:
            return []
        return self._sink.cleanup()
