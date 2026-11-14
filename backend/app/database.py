from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class PacketRow(Base):
    __tablename__ = "packets"
    __table_args__ = (UniqueConstraint("device_id", "sequence", name="uq_device_sequence"),)
    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(100), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    observed_at: Mapped[datetime] = mapped_column(DateTime)
    received_at: Mapped[datetime] = mapped_column(DateTime)
    raw: Mapped[dict] = mapped_column(JSON)
    sequence_gap: Mapped[bool]


class ObservationRow(Base):
    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("packets.event_id"), index=True)
    data: Mapped[dict] = mapped_column(JSON)


class AlertRow(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("packets.event_id"), index=True)
    priority: Mapped[int]
    rule_id: Mapped[str]
    message: Mapped[str]
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))


def connect(url: str):
    if not url.startswith("sqlite:"):
        raise ValueError("This prototype supports local SQLite only")
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    return engine, sessionmaker(engine, expire_on_commit=False)
