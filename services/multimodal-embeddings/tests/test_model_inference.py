import os
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_MODEL_INFERENCE_TESTS") != "1",
    reason="set RUN_MODEL_INFERENCE_TESTS=1 to download/load real model weights",
)


def test_pinned_models_embed_finnish_text_and_image(tmp_path, monkeypatch):
    from multimodal_embeddings.model import (
        DEFAULT_IMAGE_REVISION,
        DEFAULT_TEXT_REVISION,
        embed_image,
        embed_text,
        load_models,
    )

    monkeypatch.setenv("EMBEDDING_IMAGE_REVISION", DEFAULT_IMAGE_REVISION)
    monkeypatch.setenv("EMBEDDING_TEXT_REVISION", DEFAULT_TEXT_REVISION)
    load_models.cache_clear()
    try:
        text_vector = np.asarray(embed_text("Pappi jakaa ehtoollista kirkossa."))
        image_path = Path(tmp_path) / "test-image.png"
        Image.new("RGB", (224, 224), color=(180, 150, 120)).save(image_path)
        image_vector = np.asarray(embed_image(str(image_path)))

        assert text_vector.shape == (512,)
        assert image_vector.shape == (512,)
        assert np.isfinite(text_vector).all()
        assert np.isfinite(image_vector).all()
        assert np.linalg.norm(text_vector) == pytest.approx(1.0, abs=1e-3)
        assert np.linalg.norm(image_vector) == pytest.approx(1.0, abs=1e-3)
        similarity = float(np.dot(text_vector, image_vector))
        assert -1.0 <= similarity <= 1.0
    finally:
        load_models.cache_clear()
