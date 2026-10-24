from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import queue
from .model import DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, configured_model_name


@asynccontextmanager
async def lifespan(_: FastAPI):
    queue.initialize()
    yield


app = FastAPI(
    title="Kirkkovuosi-Kuvatin Multimodal Embedding Service",
    version="0.1.0",
    description="Asynchronous image and text embeddings from an aligned multilingual CLIP model pair.",
    lifespan=lifespan,
)


class TextJobRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class ImageJobRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    filename: str | None = Field(default=None, max_length=255)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": configured_model_name(),
        "device": os.getenv("EMBEDDING_DEVICE", "auto"),
    }


@app.get("/v1/models")
def models() -> dict[str, object]:
    return {
        "model": configured_model_name(),
        "image_model": os.getenv("EMBEDDING_IMAGE_MODEL", DEFAULT_IMAGE_MODEL),
        "text_model": os.getenv("EMBEDDING_TEXT_MODEL", DEFAULT_TEXT_MODEL),
        "modalities": ["text", "image"],
        "shared_vector_space": True,
        "normalization": "L2",
    }


@app.post("/v1/jobs/text", status_code=202)
def create_text_job(request: TextJobRequest) -> dict[str, object]:
    try:
        return queue.enqueue_text(request.text, configured_model_name())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/jobs/image", status_code=202)
def create_image_job(request: ImageJobRequest) -> dict[str, object]:
    try:
        return queue.enqueue_image(request.image_base64, request.filename, configured_model_name())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/v1/jobs/{job_id}")
def read_job(job_id: str) -> dict[str, object]:
    result = queue.get_job(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="job not found")
    return result
