import asyncio
import logging
import warnings
from datetime import UTC, datetime
from pathlib import Path

import discord

from config import Config
from core.recording.models import SpeakerTrack, VoiceSession
from core.recording.session import RecordingSession

log = logging.getLogger(__name__)


class VoiceCog(discord.Cog):
    def __init__(self, bot: discord.Bot, config: Config) -> None:
        self.bot = bot
        self._config = config
        self._session: VoiceSession | None = None
        self._recording: RecordingSession | None = None
        self._recording_done: asyncio.Future[list[SpeakerTrack]] | None = None

    # ------------------------------------------------------------------
    # Slash commands
    # ------------------------------------------------------------------

    @discord.slash_command(name="join", description="Entrar no seu canal de voz")
    async def join(self, ctx: discord.ApplicationContext) -> None:
        if ctx.author.voice is None:
            log.info(f"/join — user={ctx.author} not in a voice channel")
            await ctx.respond("Você precisa estar em um canal de voz.", ephemeral=True)
            return

        channel = ctx.author.voice.channel
        await ctx.defer()
        vc = await channel.connect()

        self._session = VoiceSession(
            guild_id=ctx.guild_id,
            channel_id=channel.id,
            started_at=datetime.now(UTC),
        )
        self._attach_recording(vc, channel, self._config.RECORDINGS_DIR)

        log.info(
            f"/join — user={ctx.author} channel={channel.name} guild={ctx.guild_id}"
        )
        await ctx.followup.send(f"Entrei em **{channel.name}**! Gravando...")

    @discord.slash_command(name="stop", description="Sair do canal de voz")
    async def stop(self, ctx: discord.ApplicationContext) -> None:
        if ctx.voice_client is None:
            log.info(f"/stop — user={ctx.author} bot not connected")
            await ctx.respond("Não estou em nenhum canal de voz.", ephemeral=True)
            return

        await ctx.defer()
        tracks = await self._finish_recording(ctx.voice_client)

        self._session = None
        self._recording = None
        self._recording_done = None

        log.info(f"/stop — user={ctx.author} guild={ctx.guild_id} tracks={len(tracks)}")
        await ctx.followup.send(_build_stop_reply(tracks))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _attach_recording(
        self,
        vc: discord.VoiceClient,
        channel: discord.VoiceChannel,
        recordings_root: Path,
    ) -> None:
        usernames = {m.id: m.name for m in channel.members}
        self._recording = RecordingSession(recordings_root, usernames)
        sink = self._recording.start()

        loop = asyncio.get_running_loop()
        self._recording_done = loop.create_future()
        recording, future = self._recording, self._recording_done

        def _on_finished(exc: Exception | None) -> None:
            tracks = recording.stop()
            if exc is not None:
                loop.call_soon_threadsafe(future.set_exception, exc)
            else:
                loop.call_soon_threadsafe(future.set_result, tracks)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            vc.start_recording(sink, _on_finished)

    async def _finish_recording(self, vc: discord.VoiceClient) -> list[SpeakerTrack]:
        if vc.is_recording():
            vc.stop_recording()
        if self._recording_done is not None:
            try:
                tracks = await asyncio.wait_for(self._recording_done, timeout=10.0)
            except asyncio.TimeoutError:
                log.warning("/stop — recording callback timed out")
                tracks = []
        else:
            tracks = []
        await vc.disconnect()
        return tracks


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------


def _build_stop_reply(tracks: list[SpeakerTrack]) -> str:
    if not tracks:
        return "Saí do canal. Nenhum áudio gravado."
    file_list = "\n".join(f"• `{t.wav_path.name}` ({t.username})" for t in tracks)
    return f"Gravação salva em `{tracks[0].wav_path.parent}`:\n{file_list}"
