import logging
import uuid

import discord
import httpx

from config import Config

log = logging.getLogger(__name__)


class RecorderSessionConflictError(Exception):
    """Escriba rejected start because another session is already recording."""


class VoiceCog(discord.Cog):
    def __init__(self, bot: discord.Bot, config: Config) -> None:
        self.bot = bot
        self._config = config
        self._session_id: str | None = None

    @discord.slash_command(name="join", description="Entrar no seu canal de voz")
    async def join(self, ctx: discord.ApplicationContext) -> None:
        if self._session_id is not None:
            await ctx.respond(
                "Já existe uma sessão ativa. Use /stop para encerrá-la.",
                ephemeral=True,
            )
            return

        if ctx.author.voice is None:
            log.info(f"/join — user={ctx.author} not in a voice channel")
            await ctx.respond("Você precisa estar em um canal de voz.", ephemeral=True)
            return

        channel = ctx.author.voice.channel
        await ctx.defer()

        session_id = f"{self._config.SESSION_ID_PREFIX}-{uuid.uuid4()}"

        try:
            await self._start_recording(session_id, ctx.guild_id, channel.id)
        except RecorderSessionConflictError:
            await ctx.followup.send(
                "O Escriba já está gravando. Use /stop para encerrar a sessão anterior."
            )
            return
        except httpx.HTTPError:
            log.exception(
                "/join — failed to start recording session_id=%s guild=%s",
                session_id,
                ctx.guild_id,
            )
            await ctx.followup.send("Não foi possível iniciar a gravação.")
            return

        self._session_id = session_id
        log.info(
            "/join — user=%s channel=%s guild=%s session_id=%s",
            ctx.author,
            channel.name,
            ctx.guild_id,
            session_id,
        )
        await ctx.followup.send(f"Entrei em **{channel.name}**! Gravando...")

    @discord.slash_command(name="stop", description="Sair do canal de voz")
    async def stop(self, ctx: discord.ApplicationContext) -> None:
        if self._session_id is None:
            log.info(f"/stop — user={ctx.author} no active session")
            await ctx.respond("Nenhuma sessão ativa.", ephemeral=True)
            return

        await ctx.defer()
        session_id = self._session_id

        try:
            await self._stop_recording(session_id)
        except httpx.HTTPError:
            log.exception(
                "/stop — failed to stop recording session_id=%s guild=%s",
                session_id,
                ctx.guild_id,
            )
            await ctx.followup.send("Não foi possível encerrar a gravação.")
            return

        self._session_id = None
        log.info(
            "/stop — user=%s guild=%s session_id=%s",
            ctx.author,
            ctx.guild_id,
            session_id,
        )
        await ctx.followup.send("Sessão encerrada, gerando transcrição...")

    async def _start_recording(
        self, session_id: str, guild_id: int, channel_id: int
    ) -> None:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._config.RECORDER_URL}/sessions",
                json={
                    "sessionId": session_id,
                    "guildId": str(guild_id),
                    "channelId": str(channel_id),
                },
                timeout=30.0,
            )
            if response.status_code == 409:
                log.warning(
                    "Escriba rejected start — session already active "
                    "(session_id=%s guild=%s)",
                    session_id,
                    guild_id,
                )
                raise RecorderSessionConflictError()
            response.raise_for_status()

    async def _stop_recording(self, session_id: str) -> None:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._config.RECORDER_URL}/sessions/{session_id}/stop",
                timeout=30.0,
            )
            response.raise_for_status()
