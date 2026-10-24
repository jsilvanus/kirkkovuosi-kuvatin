from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer

# These are a documented, aligned pair: the multilingual text encoder was
# distilled to match the image vectors produced by the original CLIP encoder.
DEFAULT_IMAGE_MODEL = "sentence-transformers/clip-ViT-B-32"
DEFAULT_TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"


def configured_model_name() -> str:
    return f"{os.getenv('EMBEDDING_IMAGE_MODEL', DEFAULT_IMAGE_MODEL)}+{os.getenv('EMBEDDING_TEXT_MODEL', DEFAULT_TEXT_MODEL)}"


def configured_device() -> str:
    device = os.getenv("EMBEDDING_DEVICE", "auto").lower()
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("EMBEDDING_DEVICE must be auto, cpu, or cuda")
    if device == "auto":
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device


@lru_cache(maxsize=1)
def load_models() -> tuple[SentenceTransformer, SentenceTransformer]:
    device = configured_device()
    image_model = SentenceTransformer(os.getenv("EMBEDDING_IMAGE_MODEL", DEFAULT_IMAGE_MODEL), device=device)
    text_model = SentenceTransformer(os.getenv("EMBEDDING_TEXT_MODEL", DEFAULT_TEXT_MODEL), device=device)
    return image_model, text_model


def embed_text(text: str) -> list[float]:
    _, text_model = load_models()
    vector = text_model.encode([text], normalize_embeddings=True, convert_to_numpy=True)[0]
    return _validate_vector(vector)


def embed_image(path: str) -> list[float]:
    image_model, _ = load_models()
    with Image.open(Path(path)) as image:
        rgb = image.convert("RGB")
        vector = image_model.encode([rgb], normalize_embeddings=True, convert_to_numpy=True)[0]
    return _validate_vector(vector)


def _validate_vector(vector: np.ndarray) -> list[float]:
    values = np.asarray(vector, dtype=np.float32)
    if values.ndim != 1 or values.size == 0 or not np.isfinite(values).all():
        raise RuntimeError("Model returned an invalid embedding vector")
    return [float(value) for value in values]
