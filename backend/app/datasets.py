"""Bounded, provenance-preserving reference tables, isolated from live telemetry."""

import math
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, model_validator
from sqlalchemy import select, update

from . import operations as ops
from .database import RecordRow
from .schemas import StrictModel


class DataColumn(StrictModel):
    key: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")
    label: str = Field(min_length=1, max_length=100)
    unit: str = Field(default="", max_length=40)


class DatasetInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    source: Literal["NASA", "MANUAL"]
    source_url: str = Field(default="", max_length=2000)
    accession: str = Field(default="", max_length=100)
    notes: str = Field(default="", max_length=2000)
    columns: list[DataColumn] = Field(min_length=1, max_length=30)
    rows: list[dict[str, str | float | None]] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_table(self):
        if not self.title.strip() or any(not c.label.strip() for c in self.columns):
            raise ValueError("Title and column labels must not be blank")
        keys = [column.key for column in self.columns]
        if len(set(keys)) != len(keys):
            raise ValueError("Column keys must be unique")
        if self.source == "NASA":
            url = urlsplit(self.source_url)
            host = url.hostname or ""
            if (
                url.scheme != "https"
                or url.username
                or url.password
                or not (host == "nasa.gov" or host.endswith(".nasa.gov"))
            ):
                raise ValueError("NASA imports require an HTTPS nasa.gov source URL")
            if not self.accession.strip():
                raise ValueError("Record the NASA dataset accession or identifier")
        for row in self.rows:
            if set(row) != set(keys):
                raise ValueError("Every row must contain exactly the declared columns")
            for value in row.values():
                if isinstance(value, float) and not math.isfinite(value):
                    raise ValueError("Numeric values must be finite")
                if isinstance(value, str) and len(value) > 500:
                    raise ValueError("Cells must be at most 500 characters")
        return self


class Dataset(DatasetInput):
    id: str
    created_at: str
    revision: int = 0
    digest: str


class DatasetEdit(DatasetInput):
    expected_revision: int = Field(ge=0)


def build_dataset_router(sessions, operator):
    import hashlib
    import json

    router = APIRouter()

    def digest(data):
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

    @router.get("/datasets")
    def list_datasets():
        with sessions() as db:
            rows = db.scalars(
                select(RecordRow)
                .where(RecordRow.kind == "dataset")
                .order_by(RecordRow.data["created_at"].as_string().desc(), RecordRow.id.desc())
                .limit(100)
            )
            return [
                dict(
                    id=r.id,
                    title=r.data["title"],
                    source=r.data["source"],
                    created_at=r.data["created_at"],
                    row_count=len(r.data["rows"]),
                )
                for r in rows
            ]

    @router.get("/datasets/{dataset_id}", response_model=Dataset)
    def get_dataset(dataset_id: str):
        with sessions() as db:
            return ops.get_record(db, dataset_id, "dataset").data

    @router.post("/datasets", response_model=Dataset, dependencies=[Depends(operator)])
    def create_dataset(request: DatasetInput):
        data = request.model_dump(mode="json")
        record = Dataset(
            **data, id=f"dataset-{uuid4().hex}", created_at=ops.now_iso(), digest=digest(data)
        )
        with sessions() as db:
            ops.insert(db, "dataset", record.model_dump(mode="json"))
            db.commit()
        return record

    @router.post("/datasets/{dataset_id}", response_model=Dataset, dependencies=[Depends(operator)])
    def edit_dataset(dataset_id: str, request: DatasetEdit):
        with sessions() as db:
            row = ops.get_record(db, dataset_id, "dataset")
            if row.data["source"] != "MANUAL" or request.source != "MANUAL":
                raise HTTPException(409, "Imported NASA reference tables are immutable")
            if row.data["revision"] != request.expected_revision:
                raise HTTPException(409, "Table changed. Reopen it before editing.")
            data = request.model_dump(mode="json", exclude={"expected_revision"})
            previous = row.data.copy()
            updated = data | {
                "id": row.id,
                "created_at": row.data["created_at"],
                "revision": request.expected_revision + 1,
                "digest": digest(data),
            }
            changed = db.execute(
                update(RecordRow)
                .where(
                    RecordRow.id == dataset_id,
                    RecordRow.data["revision"].as_integer() == request.expected_revision,
                )
                .values(data=updated)
                .execution_options(synchronize_session=False)
            )
            if changed.rowcount != 1:
                raise HTTPException(409, "Table changed. Reopen it before editing.")
            # The audit record and update are committed in one transaction.
            ops.insert(db, "dataset_revision", previous | {"id": f"revision-{uuid4().hex}"})
            db.commit()
            return updated

    return router
