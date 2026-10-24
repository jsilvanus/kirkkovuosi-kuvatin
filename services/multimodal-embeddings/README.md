# Multimodal Embedding Service

A separate Python service for durable, asynchronous image/text embeddings. It uses a documented, aligned **model pair** for both modalities so Finnish text queries and image vectors share a vector space. The caller retrieves completed vectors and persists them with Kirkkovuosi-Kuvatin's existing asset/model/checksum metadata.

## Model choice

Defaults:
- Image encoder: `sentence-transformers/clip-ViT-B-32`
- Text encoder: `sentence-transformers/clip-ViT-B-32-multilingual-v1`

This is intentionally a paired setup, not one checkpoint pretending to encode both modalities. The multilingual model card says its text encoder was distilled to match the original CLIP image encoder, and lists Finnish among its supported languages. Both encoders should produce 512-dimensional vectors. The service normalizes vectors to unit length.

The default pair is pinned to immutable Hugging Face revisions: image revision `327ab67` for `sentence-transformers/clip-ViT-B-32`, and text revision `58edf8cada9e398793dca955574a48cbb7f18be2` for `sentence-transformers/clip-ViT-B-32-multilingual-v1`. The text model card documents Finnish among its supported languages and says the text encoder was distilled to align with the original CLIP image encoder. Both encoders should produce 512-dimensional vectors, normalized to unit length.

Configure with `EMBEDDING_IMAGE_MODEL`, `EMBEDDING_IMAGE_REVISION`, `EMBEDDING_TEXT_MODEL`, and `EMBEDDING_TEXT_REVISION`. `/v1/models` returns model IDs and revisions separately. The complete model identity and database pair digest include revisions, so changing a revision creates a distinct embedding identity and requires re-embedding. If either model or revision is changed, `shared_vector_space` becomes false unless `EMBEDDING_SHARED_VECTOR_SPACE=true` is explicitly set. That override is an operator assertion, not an automatic compatibility check: use it only after confirming the models were trained/aligned for the same vector space. The image revision is the abbreviated immutable commit displayed by the model's Hugging Face commit history; the text revision is a full commit SHA.

## Run locally

Python 3.11+ recommended. Install dependencies and start the API and worker as separate processes:

```sh
cd services/multimodal-embeddings
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux: source .venv/bin/activate
pip install -e '.[dev]'
uvicorn multimodal_embeddings.api:app --host 127.0.0.1 --port 8091
```

In another terminal, with the same `EMBEDDING_DATA_DIR`:

```sh
python -m multimodal_embeddings.worker
```

Or start both containers with the shared persistent queue/model cache:

```sh
docker compose -f docker-compose.embeddings.yml up --build -d
```

The first worker start downloads model weights from Hugging Face. Set `EMBEDDING_DEVICE=cuda` for a supported NVIDIA/PyTorch CUDA environment, or `cpu` to force CPU. `auto` (default in the Python module) uses CUDA when available; Compose defaults to CPU unless configured otherwise. The API is bound to localhost by default. This initial setup has no authentication.

## OpenAPI contract and generated clients

The canonical contract is `openapi.json`, served at `/openapi.json`. The main TypeScript application generates types from this file with `npm run embedding:types`; do not hand-edit generated types. Update the contract and the API implementation together when endpoints or response schemas change.

## API

- `GET /health` — liveness and configured model pair (does not guarantee the models have loaded).
- `GET /v1/models` — model pair, modalities, normalization, and whether the configured pair is declared to share a vector space.
- `POST /v1/jobs/text` — JSON `{"text":"pappi jakaa ehtoollista kirkossa"}`.
- `POST /v1/jobs/image` — JSON `{"image_base64":"...","filename":"asset.jpg"}` (raw base64, no data-URL prefix).
- `GET /v1/jobs/{job_id}` — queued/running/complete/failed status and, on success, the vector, dimensions, model identity, and modality.

The POST endpoints return `202 Accepted` with a job ID. Image bytes are written to a spool file and the SQLite queue stores only its path. The worker claims jobs transactionally and computes one job at a time. Results remain in SQLite until clients fetch them.

## Queue and data handling

`EMBEDDING_DATA_DIR` contains `queue.sqlite3` and image spool files; mount it as a persistent volume shared by API and worker. SQLite WAL and short transactions let the API and worker access the same queue. Do not point separate hosts at a local SQLite file; use a networked queue/database before scaling across hosts.

When the worker starts, it requeues jobs left in `running` state by a prior interrupted process. A job submitted under a different model pair is failed rather than embedded by the new pair and mislabeled with the old identity. Run a single worker against a queue unless worker leases/heartbeats are introduced; startup recovery assumes the previous worker is no longer active.

The service limits each uploaded image to 15 MiB and validates it with Pillow before enqueueing. It does not fetch caller-supplied URLs, avoiding SSRF. Put authentication and request-size limits in front of it before exposing it beyond a trusted development network. Configure retention/cleanup before production; no automatic deletion is enabled yet.

## Tests

```sh
pip install -e '.[dev]'
pytest
```

The ordinary test suite does not download model weights. An opt-in smoke test checks actual text and image inference and their 512-dimensional normalized vectors. Run it with `RUN_MODEL_INFERENCE_TESTS=1 pytest -q tests/test_model_inference.py` in an environment with enough disk space for the pinned model snapshots. The first run downloads weights from Hugging Face.
