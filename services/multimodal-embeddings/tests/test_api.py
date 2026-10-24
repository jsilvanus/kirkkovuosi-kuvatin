import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from multimodal_embeddings.api import app
from multimodal_embeddings import queue
from multimodal_embeddings.model import (
    DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_REVISION, DEFAULT_TEXT_MODEL, DEFAULT_TEXT_REVISION,
)


def test_api_enqueues_text_and_returns_status(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    with TestClient(app) as client:
        response = client.post("/v1/jobs/text", json={"text": "kirkko alttarilta"})
        assert response.status_code == 202
        job_id = response.json()["id"]
        status = client.get(f"/v1/jobs/{job_id}")
        assert status.status_code == 200
        assert status.json()["status"] == "queued"
        assert "clip-ViT-B-32" in status.json()["model_name"]


def test_api_rejects_blank_text(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    with TestClient(app) as client:
        response = client.post("/v1/jobs/text", json={"text": "  "})
        assert response.status_code == 422


def test_model_contract_declares_shared_space_for_default_pair(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    monkeypatch.delenv("EMBEDDING_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("EMBEDDING_TEXT_MODEL", raising=False)
    monkeypatch.delenv("EMBEDDING_IMAGE_REVISION", raising=False)
    monkeypatch.delenv("EMBEDDING_TEXT_REVISION", raising=False)
    monkeypatch.delenv("EMBEDDING_SHARED_VECTOR_SPACE", raising=False)
    with TestClient(app) as client:
        response = client.get("/v1/models")
        assert response.status_code == 200
        assert response.json()["shared_vector_space"] is True
        assert response.json()["image_model"] == DEFAULT_IMAGE_MODEL
        assert response.json()["image_revision"] == DEFAULT_IMAGE_REVISION
        assert response.json()["text_model"] == DEFAULT_TEXT_MODEL
        assert response.json()["text_revision"] == DEFAULT_TEXT_REVISION
        assert "@" + DEFAULT_IMAGE_REVISION in response.json()["model"]
        assert "@" + DEFAULT_TEXT_REVISION in response.json()["model"]


def test_model_contract_rejects_unverified_custom_pair(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    monkeypatch.setenv("EMBEDDING_IMAGE_MODEL", "custom/image-model")
    monkeypatch.setenv("EMBEDDING_TEXT_MODEL", "custom/text-model")
    monkeypatch.delenv("EMBEDDING_SHARED_VECTOR_SPACE", raising=False)
    with TestClient(app) as client:
        response = client.get("/v1/models")
        assert response.status_code == 200
        assert response.json()["shared_vector_space"] is False


def test_model_contract_rejects_unverified_revision_change(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    monkeypatch.delenv("EMBEDDING_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("EMBEDDING_TEXT_MODEL", raising=False)
    monkeypatch.setenv("EMBEDDING_TEXT_REVISION", "different-commit")
    monkeypatch.delenv("EMBEDDING_SHARED_VECTOR_SPACE", raising=False)
    with TestClient(app) as client:
        response = client.get("/v1/models")
        assert response.status_code == 200
        assert response.json()["shared_vector_space"] is False


def test_model_contract_allows_explicit_custom_pair_assertion(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path)
    monkeypatch.setenv("EMBEDDING_IMAGE_MODEL", "custom/image-model")
    monkeypatch.setenv("EMBEDDING_TEXT_MODEL", "custom/text-model")
    monkeypatch.setenv("EMBEDDING_SHARED_VECTOR_SPACE", "true")
    with TestClient(app) as client:
        response = client.get("/v1/models")
        assert response.status_code == 200
        assert response.json()["shared_vector_space"] is True
