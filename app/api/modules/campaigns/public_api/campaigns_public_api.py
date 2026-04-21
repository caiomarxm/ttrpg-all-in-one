from typing import Protocol

from modules.campaigns.core.enum.campaign_enum import MemberRole


class CampaignsPublicApi(Protocol):
    """Cross-BC contract — implement in campaigns/core/service only; other BCs import this Protocol."""

    async def get_user_role(self, campaign_id: str, user_id: str) -> MemberRole: ...

    async def is_member(self, campaign_id: str, user_id: str) -> bool: ...
