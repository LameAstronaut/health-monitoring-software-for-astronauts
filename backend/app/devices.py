"""Adapter seam. Demo acquisition is completed only by the Rust worker.

No physical adapter or life-support command is implemented.
"""

from typing import Protocol

from fastapi import HTTPException

from .operation_schemas import ExamRequest
from .registry import DEVICE_MAP, EXAM_DEVICES


class DeviceAdapter(Protocol):
    def identify(self) -> dict: ...
    def capabilities(self) -> list[str]: ...
    def status(self, worker_live: bool) -> str: ...
    def acquire(self, request: ExamRequest, worker_live: bool) -> None: ...
    def stop(self) -> str: ...


class SimulatedAdapter:
    def __init__(self, device_id: str):
        if device_id not in DEVICE_MAP:
            raise HTTPException(404, "Unknown virtual instrument")
        self.device = DEVICE_MAP[device_id]

    def identify(self) -> dict:
        return self.device.copy() | {"source_type": "SIMULATED"}

    def capabilities(self) -> list[str]:
        return list(self.device["capabilities"])

    def status(self, worker_live: bool) -> str:
        return "IDLE" if worker_live else "DISCONNECTED"

    def acquire(self, request: ExamRequest, worker_live: bool) -> None:
        if EXAM_DEVICES[request.kind] != self.device["id"]:
            raise HTTPException(422, "Selected instrument does not support this examination")
        if not worker_live:
            raise HTTPException(
                409, "No live simulator for this crew. Resume telemetry before acquiring."
            )

    def stop(self) -> str:
        return "CANCELLED"
