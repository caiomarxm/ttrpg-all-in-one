import asyncio
import logging

import discord

from config import Config
from entrypoints.cogs.voice import VoiceCog
from logging_config import setup_logging

log = logging.getLogger(__name__)


async def main() -> None:
    setup_logging()
    config = Config()
    bot = discord.Bot(debug_guilds=[config.SERVER_ID])

    bot.add_cog(VoiceCog(bot, config))

    @bot.event
    async def on_ready() -> None:
        log.info(f"O Cronista is online as {bot.user}")

    @bot.slash_command(name="ping", description="Check if the bot is alive")
    async def ping(ctx: discord.ApplicationContext) -> None:
        log.info(f"/ping — user={ctx.author} channel={ctx.channel}")
        await ctx.respond("Pong!")

    await bot.start(config.BOT_TOKEN.get_secret_value())


if __name__ == "__main__":
    asyncio.run(main())
