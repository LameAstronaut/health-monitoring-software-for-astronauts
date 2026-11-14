import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app_factory(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("ASTRA_DATABASE_URL", url)
    command.upgrade(Config("alembic.ini"), "head")
    return lambda: create_app(Settings(database_url=url, demo_token="test-demo-token"))


@pytest.fixture
def client(app_factory):
    with TestClient(app_factory(), client=("127.0.0.1", 50000)) as client:
        yield client
