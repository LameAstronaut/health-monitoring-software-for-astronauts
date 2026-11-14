from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .database import AlertRow, ObservationRow, PacketRow, RecordRow
from .operations import finish_examination
from .registry import DEVICE_MAP
from .schemas import Alert, Device, IngestResult, Observation, TelemetryPacket, WaveformReading


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class TelemetryService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.started_at = datetime.now(UTC)

    def freshness(self, packet: PacketRow, now: datetime, db: Session | None = None) -> str:
        if utc(packet.received_at) < self.started_at:
            return "HISTORICAL"
        if db is not None:
            control = db.get(RecordRow, "demo-control")
            if control and control.data["astronaut_id"] == packet.raw["astronaut_id"]:
                if control.data["fault"] == "DISCONNECT":
                    return "DISCONNECTED"
                if control.data["fault"] == "SENSOR_ERROR":
                    return "ERROR"
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
            freshness=self.freshness(packet, now, db),
            sequence_gap=packet.sequence_gap,
            examination_id=packet.raw.get("examination_id"),
            run_id=packet.raw.get("run_id", "legacy"),
            simulated_at=packet.raw.get("simulated_at", 0),
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
            rule_version="demo-fixture-v2"
            if evidence.scenario_id == "ANOMALY"
            else "demo-fixture-v1",
            state=row.state,
            acknowledged_at=utc(row.acknowledged_at) if row.acknowledged_at else None,
            acknowledged_by=row.acknowledged_by,
        )

    def device(self, db: Session, now: datetime, device_id: str = "DEMO-SUIT-001") -> Device:
        definition = DEVICE_MAP[device_id]
        latest = db.scalar(
            select(PacketRow)
            .where(PacketRow.device_id == device_id)
            .order_by(PacketRow.sequence.desc())
            .limit(1)
        )
        status = self.freshness(latest, now, db) if latest else "NOT_AVAILABLE"
        if definition["kind"] != "CONTINUOUS":
            worker = db.scalar(
                select(PacketRow)
                .where(PacketRow.device_id.like("DEMO-SUIT-%"))
                .order_by(PacketRow.received_at.desc())
                .limit(1)
            )
            status = (
                "IDLE" if worker and self.freshness(worker, now, db) == "LIVE" else "DISCONNECTED"
            )
        return Device(
            **definition,
            status=status,
            last_seen=utc(latest.received_at) if latest else None,
            last_error="Injected sensor fixture error" if status == "ERROR" else None,
        )

    def waveform(self, db: Session, packet: PacketRow, now: datetime) -> WaveformReading:
        return WaveformReading(
            event_id=packet.event_id,
            astronaut_id=packet.raw["astronaut_id"],
            device_id=packet.device_id,
            observed_at=utc(packet.observed_at),
            received_at=utc(packet.received_at),
            run_id=packet.raw.get("run_id", "legacy"),
            quality=packet.raw["measurements"][0]["quality"],
            freshness=self.freshness(packet, now, db),
            waveform=packet.raw["waveform"],
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
        if packet.model_state is not None:
            control = db.get(RecordRow, "demo-control")
            if (
                not packet.run_id.startswith("standalone")
                and control
                and (
                    packet.run_id != control.data["run_id"]
                    or packet.revision != control.data["revision"]
                    or not control.data["running"]
                )
            ):
                raise HTTPException(
                    409, "Worker control revision changed; reload playback controls"
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
        if (
            packet.examination_id
            and (now - packet.observed_at).total_seconds() > self.settings.stale_seconds
        ):
            raise HTTPException(409, "Examination sample is stale; acquire a fresh result")
        finish_examination(db, packet, now)
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
            if measurement.quality == "VALID" and self.freshness(stored, now, db) == "LIVE":
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
                if packet.scenario_id == "ANOMALY":
                    if measurement.code == "spo2" and measurement.value <= 92:
                        rule = (
                            2,
                            "oxygen-fixture",
                            "SIMULATED oxygen-decrease test marker reached",
                        )
                    if measurement.code == "suit_pressure" and measurement.value <= 25:
                        rule = (
                            1,
                            "pressure-fixture",
                            "SIMULATED suit-pressure test marker reached",
                        )
            if rule:
                prior = db.scalar(
                    select(AlertRow)
                    .where(
                        AlertRow.astronaut_id == packet.astronaut_id,
                        AlertRow.rule_id == rule[1],
                        AlertRow.run_id == packet.run_id,
                    )
                    .limit(1)
                )
                if prior:
                    continue
                alert = AlertRow(
                    event_id=packet.event_id,
                    priority=rule[0],
                    rule_id=rule[1],
                    message=rule[2],
                    observation_id=row.id,
                    astronaut_id=packet.astronaut_id,
                    run_id=packet.run_id,
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
