import base64
import io

import pytest
from PIL import Image

from multimodal_embeddings import queue


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(queue, "DATA_DIR", tmp_path / "queue-data")
    queue.initialize()


def test_text_job_lifecycle():
    created = queue.enqueue_text("pappi jakaa ehtoollista", "test-model")
    assert created["status"] == "queued"
    claimed = queue.claim_next()
    assert claimed["id"] == created["id"]
    assert claimed["text_input"] == "pappi jakaa ehtoollista"
    queue.complete_job(created["id"], [0.6, 0.8])
    result = queue.get_job(created["id"])
    assert result["status"] == "complete"
    assert result["embedding"] == [0.6, 0.8]
    assert result["dimensions"] == 2
    assert "text_input" not in result


def test_image_job_is_validated_and_spooled():
    image_bytes = io.BytesIO()
    Image.new("RGB", (8, 8), color="red").save(image_bytes, format="PNG")
    created = queue.enqueue_image(base64.b64encode(image_bytes.getvalue()).decode(), "../image.png", "test-model")
    claimed = queue.claim_next()
    assert claimed["id"] == created["id"]
    assert claimed["filename"] == "image.png"
    assert claimed["image_path"]
    assert queue.get_job(created["id"])["status"] == "running"


def test_rejects_invalid_base64_and_non_image():
    with pytest.raises(ValueError):
        queue.enqueue_image("not base64!", None, "test-model")
    with pytest.raises(ValueError):
        queue.enqueue_image(base64.b64encode(b"not an image").decode(), None, "test-model")


def test_empty_text_is_rejected():
    with pytest.raises(ValueError):
        queue.enqueue_text("  ", "test-model")
