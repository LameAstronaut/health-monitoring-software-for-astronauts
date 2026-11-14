from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_operations import control

from app.config import Settings
from app.database import RecordRow, connect


def test_mood_is_saved_per_crew_and_day_and_survives_restart(client, app_factory):
    assert client.get("/api/v1/operations").json()["moods"] == []
    first = client.post("/api/v1/moods", json={"astronaut_id": "DEMO-CREW-001", "score": 1})
    assert first.status_code == 200
    assert first.json()["score"] == 1
    assert first.json()["source_type"] == "SIMULATED"
    assert datetime.fromisoformat(first.json()["recorded_at"]).date() == datetime.now(UTC).date()
    updated = client.post("/api/v1/moods", json={"astronaut_id": "DEMO-CREW-001", "score": 3})
    assert updated.status_code == 200
    assert updated.json()["id"] == first.json()["id"]
    other = client.post("/api/v1/moods", json={"astronaut_id": "DEMO-CREW-002", "score": 2})
    assert other.status_code == 200
    entries = client.get("/api/v1/operations").json()["moods"]
    assert len(entries) == 2
    assert {entry["astronaut_id"]: entry["score"] for entry in entries} == {
        "DEMO-CREW-001": 3,
        "DEMO-CREW-002": 2,
    }
    control(client, "RESTART")
    assert client.get("/api/v1/operations").json()["moods"] == entries
    with TestClient(app_factory()) as restarted:
        assert restarted.get("/api/v1/operations").json()["moods"] == entries


@pytest.mark.parametrize("score", [0, 4, -1, 1.5, True, "2", None])
def test_mood_accepts_only_three_integer_choices(client, score):
    result = client.post("/api/v1/moods", json={"astronaut_id": "DEMO-CREW-001", "score": score})
    assert result.status_code == 422
    assert client.get("/api/v1/operations").json()["moods"] == []


def test_mood_rejects_unknown_crew_and_untrusted_origins(client):
    assert (
        client.post("/api/v1/moods", json={"astronaut_id": "UNKNOWN", "score": 2}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/moods",
            headers={"Origin": "https://untrusted.example"},
            json={"astronaut_id": "DEMO-CREW-001", "score": 2},
        ).status_code
        == 403
    )


def test_previous_day_moods_are_preserved(client):
    engine, sessions = connect(Settings().database_url)
    yesterday = datetime.now(UTC) - timedelta(days=1)
    with sessions() as db:
        db.add(
            RecordRow(
                id="mood-yesterday",
                kind="mood",
                astronaut_id="DEMO-CREW-001",
                data={
                    "id": "mood-yesterday",
                    "astronaut_id": "DEMO-CREW-001",
                    "score": 1,
                    "recorded_at": yesterday.isoformat(),
                    "source_type": "SIMULATED",
                },
            )
        )
        db.commit()
    assert (
        client.post("/api/v1/moods", json={"astronaut_id": "DEMO-CREW-001", "score": 3}).status_code
        == 200
    )
    with sessions() as db:
        assert len(list(db.scalars(select(RecordRow).where(RecordRow.kind == "mood")))) == 2
    engine.dispose()
