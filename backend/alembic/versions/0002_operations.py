"""Durable demo operations and alert acknowledgment, retaining all existing packets."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "alerts", sa.Column("state", sa.String(), nullable=False, server_default="PENDING_REVIEW")
    )
    op.add_column("alerts", sa.Column("acknowledged_at", sa.DateTime(), nullable=True))
    op.add_column("alerts", sa.Column("acknowledged_by", sa.String(), nullable=True))
    op.add_column(
        "alerts",
        sa.Column("astronaut_id", sa.String(), nullable=False, server_default="DEMO-CREW-001"),
    )
    op.add_column(
        "alerts", sa.Column("run_id", sa.String(), nullable=False, server_default="legacy")
    )
    op.create_table(
        "operation_records",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("astronaut_id", sa.String(40), nullable=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_index("ix_operation_records_kind", "operation_records", ["kind"])
    op.create_index("ix_operation_records_astronaut_id", "operation_records", ["astronaut_id"])


def downgrade():
    op.drop_table("operation_records")
    for column in ["run_id", "astronaut_id", "acknowledged_by", "acknowledged_at", "state"]:
        op.drop_column("alerts", column)
