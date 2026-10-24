from __future__ import annotations

import base64
import binascii
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

DATA_DIR = Path(os.getenv("EMBEDDING_DATA_DIR", "./data")).resolve()
MAX_IMAGE_BYTES = 15 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF"}


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATA_DIR / "queue.sqlite3", timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def initialize() -> None:
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS embedding_jobs (
                id TEXT PRIMARY KEY,
                modality TEXT NOT NULL CHECK (modality IN ('text', 'image')),
                text_input TEXT,
                image_path TEXT,
                filename TEXT,
                status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
                model_name TEXT NOT NULL,
                vector_json TEXT,
                dimensions INTEGER,
                error TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS embedding_jobs_claim_idx ON embedding_jobs(status, created_at)")


def enqueue_text(text: str, model_name: str) -> dict[str, Any]:
    value = text.strip()
    if not value:
        raise ValueError("text must not be empty")
    if len(value) > 20_000:
        raise ValueError("text must be at most 20000 characters")
    job_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "INSERT INTO embedding_jobs(id, modality, text_input, status, model_name) VALUES (?, 'text', ?, 'queued', ?)",
            (job_id, value, model_name),
        )
    return {"id": job_id, "status": "queued", "modality": "text", "model_name": model_name}


def enqueue_image(image_base64: str, filename: str | None, model_name: str) -> dict[str, Any]:
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("image_base64 must be valid base64 without a data-URL prefix") from exc
    if not raw:
        raise ValueError("image must not be empty")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("image must be at most 15 MiB")
    try:
        from io import BytesIO
        with Image.open(BytesIO(raw)) as image:
            if image.format not in ALLOWED_FORMATS:
                raise ValueError("unsupported image format")
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("uploaded bytes are not a supported image") from exc

    job_id = str(uuid.uuid4())
    spool_dir = DATA_DIR / "images"
    spool_dir.mkdir(parents=True, exist_ok=True)
    image_path = spool_dir / f"{job_id}.image"
    image_path.write_bytes(raw)
    try:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO embedding_jobs(id, modality, image_path, filename, status, model_name) VALUES (?, 'image', ?, ?, 'queued', ?)",
                (job_id, str(image_path), (filename or "image").replace("\\", "/").split("/")[-1][:255], model_name),
            )
    except Exception:
        image_path.unlink(missing_ok=True)
        raise
    return {"id": job_id, "status": "queued", "modality": "image", "model_name": model_name}


def get_job(job_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM embedding_jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    result = dict(row)
    result.pop("image_path", None)
    result.pop("text_input", None)
    if result.get("vector_json"):
        import json
        result["embedding"] = json.loads(result.pop("vector_json"))
    else:
        result.pop("vector_json", None)
    return result


def claim_next() -> dict[str, Any] | None:
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM embedding_jobs WHERE status='queued' ORDER BY created_at, id LIMIT 1"
        ).fetchone()
        if row is None:
            conn.commit()
            return None
        conn.execute(
            "UPDATE embedding_jobs SET status='running', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='queued'",
            (row["id"],),
        )
        conn.commit()
        return dict(row)


def complete_job(job_id: str, vector: list[float]) -> None:
    import json
    with _connect() as conn:
        conn.execute(
            """UPDATE embedding_jobs
               SET status='complete', vector_json=?, dimensions=?, error=NULL,
                   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE id=?""",
            (json.dumps(vector, separators=(",", ":"), allow_nan=False), len(vector), job_id),
        )


def fail_job(job_id: str, error: str) -> None:
    with _connect() as conn:
        conn.execute(
            """UPDATE embedding_jobs SET status='failed', error=?,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""",
            (error[:2000], job_id),
        )
