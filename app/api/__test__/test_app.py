"""Smoke tests for the FastAPI bootstrap — expand per BC under modules/<bc>/__test__/."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_campaigns_placeholder() -> None:
    response = client.get("/campaigns/")
    assert response.status_code == 200
    assert response.json()["bc"] == "campaigns"


def test_iam_placeholder() -> None:
    response = client.get("/iam/")
    assert response.status_code == 200
    assert response.json()["bc"] == "iam"
