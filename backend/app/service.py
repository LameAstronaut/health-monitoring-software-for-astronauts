from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .database import AlertRow, ObservationRow, PacketRow
from .schemas import Alert, Device, IngestResult, Observation, TelemetryPacket


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class TelemetryService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.started_at = datetime.now(UTC)

    def freshness(self, packet: PacketRow, now: datetime) -> str:
        if utc(packet.received_at) < self.started_at:
            return "HISTORICAL"
        age = max(
            (now - utc(packet.observed_at)).total_seconds(),
            (now - utc(packet.received_at)).total_seconds(),
        )
        if age > self.settings.disconnect_seconds:
            return "DISCONNECTED"
        if age > self.settings.stale_seconds:
            return "STALE"
        return "LIVE"

    def observation(self, db: Session, row: ObservationRow, now: datetime) -> Observation:
        packet = db.get(PacketRow, row.event_id)
        return Observation(
            id=row.id,
            event_id=packet.event_id,
            sequence=packet.sequence,
            observed_at=utc(packet.observed_at),
            received_at=utc(packet.received_at),
            astronaut_id=packet.raw["astronaut_id"],
            device_id=packet.device_id,
            scenario_id=packet.raw["scenario_id"],
            freshness=self.freshness(packet, now),
            sequence_gap=packet.sequence_gap,
            **row.data,
        )

    def alert(self, db: Session, row: AlertRow, now: datetime) -> Alert:
        evidence = self.observation(db, db.get(ObservationRow, row.observation_id), now)
        return Alert(
            id=row.id,
            priority=row.priority,
            severity="CRITICAL_DEMO" if row.priority == 1 else "WARNING_DEMO",
            rule_id=row.rule_id,
            message=row.message,
            event_id=row.event_id,
            device_id=evidence.device_id,
            astronaut_id=evidence.astronaut_id,
            occurred_at=evidence.observed_at,
            evidence=[evidence],
        )

    def device(self, db: Session, now: datetime) -> Device:
        latest = db.scalar(select(PacketRow).order_by(PacketRow.sequence.desc()).limit(1))
        return Device(
            status=self.freshness(latest, now) if latest else "NOT_AVAILABLE",
            last_seen=utc(latest.received_at) if latest else None,
        )

    def ingest(self, db: Session, packet: TelemetryPacket, now: datetime) -> IngestResult:
        raw = packet.model_dump(mode="json")
        existing = db.get(PacketRow, packet.event_id)
        if existing:
            if existing.raw != raw:
                raise HTTPException(409, "event_id already exists with different content")
            return IngestResult(
                event_id=packet.event_id,
                duplicate=True,
                sequence_gap=existing.sequence_gap,
                observations=[],
                alerts=[],
            )
        if (packet.observed_at - now).total_seconds() > 5:
            raise HTTPException(422, "observed_at is more than 5 seconds in the future")
        previous = db.scalar(
            select(PacketRow)
            .where(PacketRow.device_id == packet.device_id)
            .order_by(PacketRow.sequence.desc())
            .limit(1)
        )
        if previous and packet.sequence <= previous.sequence:
            raise HTTPException(
                409, "out-of-order sequence; next sequence must exceed stored maximum"
            )
        if previous and packet.observed_at < utc(previous.observed_at):
            raise HTTPException(409, "observed_at must not move backwards")
        gap = previous is not None and packet.sequence != previous.sequence + 1
        stored = PacketRow(
            event_id=packet.event_id,
            device_id=packet.device_id,
            sequence=packet.sequence,
            observed_at=utc(packet.observed_at),
            received_at=now,
            raw=raw,
            sequence_gap=gap,
        )
        db.add(stored)
        db.flush()
        observations, alerts = [], []
        for measurement in packet.measurements:
            row = ObservationRow(event_id=packet.event_id, data=measurement.model_dump())
            db.add(row)
            db.flush()
            observations.append(row)
            # Explicit synthetic fixtures. These are NOT medical operating limits.
            rule = None
            if measurement.quality == "VALID" and self.freshness(stored, now) == "LIVE":
                if (
                    packet.scenario_id in ("oxygen_drop_demo", "simultaneous_demo")
                    and measurement.code == "spo2"
                    and measurement.value == 88
                ):
                    rule = (2, "oxygen-fixture", "Simulated oxygen decrease fixture observed")
                if (
                    packet.scenario_id in ("pressure_anomaly_demo", "simultaneous_demo")
                    and measurement.code == "suit_pressure"
                    and measurement.value == 20
                ):
                    rule = (1, "pressure-fixture", "Simulated suit-pressure fixture observed")
            if rule:
                alert = AlertRow(
                    event_id=packet.event_id,
                    priority=rule[0],
                    rule_id=rule[1],
                    message=rule[2],
                    observation_id=row.id,
                )
                db.add(alert)
                alerts.append(alert)
        db.flush()
        result = IngestResult(
            event_id=packet.event_id,
            duplicate=False,
            sequence_gap=gap,
            observations=[self.observation(db, row, now) for row in observations],
            alerts=[self.alert(db, row, now) for row in sorted(alerts, key=lambda a: a.priority)],
        )
        db.commit()  # Durability precedes WebSocket publication.
        return result
