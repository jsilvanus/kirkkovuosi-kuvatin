import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from multimodal_embeddings.api import app
from multimodal_embeddings import queue


def test_api_enqueues_text_and_returns_status(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    with TestClient(app) as client:
        response = client.post("/v1/jobs/text", json={"text": "kirkko alttarilta"})
        assert response.status_code == 202
        job_id = response.json()["id"]
        status = client.get(f"/v1/jobs/{job_id}")
        assert status.status_code == 200
        assert status.json()["status"] == "queued"
        assert status.json()["model_name"] == "sentence-transformers/clip-ViT-B-32-multilingual-v1"


def test_api_rejects_blank_text(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    with TestClient(app) as client:
        response = client.post("/v1/jobs/text", json={"text": "  "})
        assert response.status_code == 422
