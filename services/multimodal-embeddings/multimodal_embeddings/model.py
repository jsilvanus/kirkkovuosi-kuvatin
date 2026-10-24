from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer

# Immutable Hub revisions for a documented, aligned multilingual CLIP pair.
DEFAULT_IMAGE_MODEL = "sentence-transformers/clip-ViT-B-32"
DEFAULT_TEXT_MODEL = "sentence-transformers/clip-ViT-B-32-multilingual-v1"
DEFAULT_IMAGE_REVISION = "327ab67"
DEFAULT_TEXT_REVISION = "58edf8cada9e398793dca955574a48cbb7f18be2"


def configured_image_model() -> str:
    return os.getenv("EMBEDDING_IMAGE_MODEL", DEFAULT_IMAGE_MODEL).strip()


def configured_text_model() -> str:
    return os.getenv("EMBEDDING_TEXT_MODEL", DEFAULT_TEXT_MODEL).strip()


def configured_image_revision() -> str:
    return os.getenv("EMBEDDING_IMAGE_REVISION", DEFAULT_IMAGE_REVISION).strip()


def configured_text_revision() -> str:
    return os.getenv("EMBEDDING_TEXT_REVISION", DEFAULT_TEXT_REVISION).strip()


def configured_model_name() -> str:
    return (
        f"{configured_image_model()}@{configured_image_revision()}+"
        f"{configured_text_model()}@{configured_text_revision()}"
    )


def configured_shared_vector_space() -> bool:
    """Only advertise compatibility for the known, pinned pair or an operator assertion."""
    default_pair = (
        configured_image_model() == DEFAULT_IMAGE_MODEL
        and configured_text_model() == DEFAULT_TEXT_MODEL
        and configured_image_revision() == DEFAULT_IMAGE_REVISION
        and configured_text_revision() == DEFAULT_TEXT_REVISION
    )
    if default_pair:
        return True
    return os.getenv("EMBEDDING_SHARED_VECTOR_SPACE", "").strip().lower() in {"1", "true", "yes"}


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
    image_model = SentenceTransformer(
        configured_image_model(), revision=configured_image_revision(), device=device
    )
    text_model = SentenceTransformer(
        configured_text_model(), revision=configured_text_revision(), device=device
    )
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
