from enum import StrEnum


class MemberRole(StrEnum):
    """Coarse campaign role — consumed by Wiki, Maps, and other BCs via CampaignsPublicApi."""

    GM = "gm"
    PLAYER = "player"
