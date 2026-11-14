"""Run from backend with its virtualenv: python ../scripts/export-openapi.py."""

import json
import sys
from importlib import import_module
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
app = import_module("app.main").app

destination = Path(__file__).resolve().parents[1] / "frontend" / "openapi.json"
destination.write_text(json.dumps(app.openapi(), indent=2) + "\n")
