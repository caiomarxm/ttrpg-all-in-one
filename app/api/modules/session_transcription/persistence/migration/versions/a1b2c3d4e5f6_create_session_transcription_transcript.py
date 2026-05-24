"""create session_transcription_transcript

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-05-24 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_transcription_transcript",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(), server_default="pending", nullable=False),
        sa.Column("storage_prefix", sa.String(), server_default="", nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_session_transcription_transcript_session_id"),
        "session_transcription_transcript",
        ["session_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_session_transcription_transcript_session_id"),
        table_name="session_transcription_transcript",
    )
    op.drop_table("session_transcription_transcript")
