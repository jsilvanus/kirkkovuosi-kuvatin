from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"


def configured_model_name() -> str:
    return os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL)


def configured_device() -> str:
    device = os.getenv("EMBEDDING_DEVICE", "auto").lower()
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("EMBEDDING_DEVICE must be auto, cpu, or cuda")
    if device == "auto":
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device


@lru_cache(maxsize=1)
def load_model() -> SentenceTransformer:
    model = SentenceTransformer(configured_model_name(), device=configured_device())
    if not model.supports("image"):
        raise RuntimeError(f"Configured model {configured_model_name()} does not support images")
    if not model.supports("text"):
        raise RuntimeError(f"Configured model {configured_model_name()} does not support text")
    return model


def embed_text(text: str) -> list[float]:
    model = load_model()
    vector = model.encode([text], normalize_embeddings=True, convert_to_numpy=True)[0]
    return _validate_vector(vector)


def embed_image(path: str) -> list[float]:
    model = load_model()
    with Image.open(Path(path)) as image:
        rgb = image.convert("RGB")
        vector = model.encode([rgb], normalize_embeddings=True, convert_to_numpy=True)[0]
    return _validate_vector(vector)


def _validate_vector(vector: np.ndarray) -> list[float]:
    values = np.asarray(vector, dtype=np.float32)
    if values.ndim != 1 or values.size == 0 or not np.isfinite(values).all():
        raise RuntimeError("Model returned an invalid embedding vector")
    return [float(value) for value in values]
