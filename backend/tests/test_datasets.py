def table(**changes):
    return dict(
        title="Research fixture",
        source="MANUAL",
        columns=[{"key": "temperature", "label": "Temperature", "unit": "C"}],
        rows=[{"temperature": 22.5}],
        **changes,
    )


def test_dataset_roundtrip_revision_and_provenance(client):
    created = client.post("/api/v1/datasets", json=table())
    assert created.status_code == 200
    data = created.json()
    route = f"/api/v1/datasets/{data['id']}"
    assert len(data["digest"]) == 64
    assert client.get(route).json() == data
    edited = client.post(route, json=table(expected_revision=0))
    assert edited.status_code == 200
    assert edited.json()["revision"] == 1
    assert client.post(route, json=table(expected_revision=0)).status_code == 409
    assert client.get("/api/v1/datasets").json()[0]["row_count"] == 1


def test_nasa_source_validation_and_immutability(client):
    data = table()
    data.update(source="NASA", accession="OSD-example")
    for url in [
        "http://nasa.gov/data",
        "https://nasa.gov.evil.test/",
        "https://evilnasa.gov/",
        "https://user@nasa.gov/",
    ]:
        assert client.post("/api/v1/datasets", json=data | {"source_url": url}).status_code == 422
    data["source_url"] = "https://osdr.nasa.gov/bio/repo/"
    result = client.post("/api/v1/datasets", json=data)
    assert result.status_code == 200
    assert (
        client.post(
            f"/api/v1/datasets/{result.json()['id']}", json=data | {"expected_revision": 0}
        ).status_code
        == 409
    )


def test_dataset_rejects_malformed_rows(client):
    assert (
        client.post("/api/v1/datasets", json=table() | {"rows": [{"unknown": 1}]}).status_code
        == 422
    )
    assert client.post("/api/v1/datasets", json=table() | {"rows": []}).status_code == 422
    assert (
        client.post(
            "/api/v1/datasets", json=table() | {"rows": [{"temperature": "x" * 501}]}
        ).status_code
        == 422
    )


def test_manual_overrides_validate_and_reset(client):
    control = client.get("/api/v1/demo/control").json()

    def send(values):
        return client.post(
            "/api/v1/demo/control",
            json={"action": "CONFIGURE", "expected_revision": control["revision"], **values},
        )

    assert send({"manual_values": {"spo2": 101}}).status_code == 422
    assert send({"manual_values": {"unknown": 2}}).status_code == 422
    result = send({"manual_values": {"heart_rate": 110, "systolic_bp": 130, "diastolic_bp": 85}})
    assert result.status_code == 200
    control = result.json()
    assert control["manual_values"]["heart_rate"] == 110
    assert control["manual_values"]["systolic_bp"] == 130
    assert control["manual_values"]["diastolic_bp"] == 85
    result = send({"astronaut_id": "DEMO-CREW-002"})
    assert result.status_code == 200
    assert all(value is None for value in result.json()["manual_values"].values())
