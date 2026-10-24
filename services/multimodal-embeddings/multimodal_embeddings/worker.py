from __future__ import annotations

import logging
import os
import time

from . import queue
from .model import embed_image, embed_text

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("kuvatin-embedding-worker")


def process_one() -> bool:
    job = queue.claim_next()
    if job is None:
        return False
    job_id = job["id"]
    image_path = job.get("image_path")
    try:
        if job["modality"] == "text":
            vector = embed_text(job["text_input"])
        elif job["modality"] == "image" and image_path:
            vector = embed_image(image_path)
        else:
            raise ValueError("job is missing input for its modality")
        queue.complete_job(job_id, vector)
        logger.info("completed job=%s modality=%s dimensions=%d", job_id, job["modality"], len(vector))
    except Exception as exc:
        logger.exception("failed job=%s", job_id)
        queue.fail_job(job_id, str(exc))
    finally:
        if image_path:
            from pathlib import Path
            Path(image_path).unlink(missing_ok=True)
    return True


def main() -> None:
    queue.initialize()
    idle_sleep = float(os.getenv("EMBEDDING_WORKER_POLL_SECONDS", "0.5"))
    logger.info("worker starting model=%s device=%s", os.getenv("EMBEDDING_MODEL", "sentence-transformers/clip-ViT-B-32-multilingual-v1"), os.getenv("EMBEDDING_DEVICE", "auto"))
    while True:
        if not process_one():
            time.sleep(max(0.1, idle_sleep))


if __name__ == "__main__":
    main()
