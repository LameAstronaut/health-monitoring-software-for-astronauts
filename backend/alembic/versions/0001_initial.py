"""Initial immutable demo telemetry schema."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "packets",
        sa.Column("event_id", sa.String(100), primary_key=True),
        sa.Column("device_id", sa.String(100), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column("sequence_gap", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("device_id", "sequence", name="uq_device_sequence"),
    )
    op.create_index("ix_packets_device_id", "packets", ["device_id"])
    op.create_table(
        "observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(100), sa.ForeignKey("packets.event_id"), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_index("ix_observations_event_id", "observations", ["event_id"])
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(100), sa.ForeignKey("packets.event_id"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("observation_id", sa.Integer(), sa.ForeignKey("observations.id"), nullable=False),
    )
    op.create_index("ix_alerts_event_id", "alerts", ["event_id"])


def downgrade():
    op.drop_table("alerts")
    op.drop_table("observations")
    op.drop_table("packets")
