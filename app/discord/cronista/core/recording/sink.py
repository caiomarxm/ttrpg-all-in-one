import io
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import discord.sinks

from core.recording.models import SpeakerTrack

# Discord voice always delivers stereo 16-bit PCM at 48 kHz (Opus decoder constants).
_CHANNELS = 2
_SAMPLE_WIDTH = 2  # bytes — SAMPLE_SIZE(4) // CHANNELS(2)
_FRAME_RATE = 48000


class CronistaAudioSink(discord.sinks.Sink):
    # NOTE: py-cord 2.8 SinkEventRouter expects __sink_listeners__ on every sink —
    # a list of (event_name, method_name) tuples for voice event dispatch. The old
    # Sink base class was never updated to add it. Empty because we don't handle events.
    __sink_listeners__: list[tuple[str, str]] = []

    def walk_children(self) -> list["CronistaAudioSink"]:
        # NOTE: py-cord 2.8 SinkEventRouter traverses child sinks to register their
        # event listeners. We're a leaf sink with no children.
        return []

    def is_opus(self) -> bool:
        # NOTE: py-cord 2.8 PacketDecoder calls this to decide whether to create an
        # Opus decoder. False = we want decoded PCM, not raw Opus frames.
        return False

    def __init__(
        self,
        output_dir: Path,
        usernames: dict[int, str] | None = None,
    ) -> None:
        super().__init__()
        self._output_dir = output_dir
        self._usernames: dict[int, str] = usernames or {}
        self._started_at: dict[Any, datetime] = {}

    @discord.sinks.Filters.container
    def write(self, data: Any, user: Any) -> None:
        if user not in self._started_at:
            self._started_at[user] = datetime.now(UTC)
        if user not in self.audio_data:
            self.audio_data[user] = discord.sinks.AudioData(io.BytesIO())
        self.audio_data[user].write(data)

    def cleanup(self) -> list[SpeakerTrack]:
        self.finished = True
        tracks: list[SpeakerTrack] = []

        for user, audio_data in self.audio_data.items():
            audio_data.cleanup()

            user_id: int = user.id if hasattr(user, "id") else int(user)
            username = self._usernames.get(user_id, str(user_id))
            wav_path = self._output_dir / f"{user_id}_{username}.wav"

            with wave.open(str(wav_path), "wb") as wav_file:
                wav_file.setnchannels(_CHANNELS)
                wav_file.setsampwidth(_SAMPLE_WIDTH)
                wav_file.setframerate(_FRAME_RATE)
                wav_file.writeframes(audio_data.file.read())

            tracks.append(
                SpeakerTrack(
                    user_id=user_id,
                    username=username,
                    wav_path=wav_path,
                    started_at=self._started_at.get(user, datetime.now(UTC)),
                )
            )

        return tracks
