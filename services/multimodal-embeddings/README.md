# Multimodal Embedding Service

A separate Python service for durable, asynchronous image/text embeddings. It uses a documented, aligned **model pair** for both modalities so Finnish text queries and image vectors share a vector space. The caller retrieves completed vectors and persists them with Kirkkovuosi-Kuvatin's existing asset/model/checksum metadata.

## Model choice

Defaults:
- Image encoder: `sentence-transformers/clip-ViT-B-32`
- Text encoder: `sentence-transformers/clip-ViT-B-32-multilingual-v1`

This is intentionally a paired setup, not one checkpoint pretending to encode both modalities. The multilingual model card says its text encoder was distilled to match the original CLIP image encoder, and lists Finnish among its supported languages. Both encoders should produce 512-dimensional vectors. The service normalizes vectors to unit length.

Configure with `EMBEDDING_IMAGE_MODEL` and `EMBEDDING_TEXT_MODEL`. Only change these as a compatible pair whose documented contract puts text and images in the same vector space. Model revisions are not pinned yet; before production indexing, pin immutable Hugging Face revisions and include them in the index/model identity. Changing either model/revision requires re-embedding.

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
- `GET /v1/models` — model pair, modalities, normalization, and shared-space contract.
- `POST /v1/jobs/text` — JSON `{"text":"pappi jakaa ehtoollista kirkossa"}`.
- `POST /v1/jobs/image` — JSON `{"image_base64":"...","filename":"asset.jpg"}` (raw base64, no data-URL prefix).
- `GET /v1/jobs/{job_id}` — queued/running/complete/failed status and, on success, the vector, dimensions, model identity, and modality.

The POST endpoints return `202 Accepted` with a job ID. Image bytes are written to a spool file and the SQLite queue stores only its path. The worker claims jobs transactionally and computes one job at a time. Results remain in SQLite until clients fetch them.

## Queue and data handling

`EMBEDDING_DATA_DIR` contains `queue.sqlite3` and image spool files; mount it as a persistent volume shared by API and worker. SQLite WAL and short transactions let the API and worker access the same queue. Do not point separate hosts at a local SQLite file; use a networked queue/database before scaling across hosts.

The service limits each uploaded image to 15 MiB and validates it with Pillow before enqueueing. It does not fetch caller-supplied URLs, avoiding SSRF. Put authentication and request-size limits in front of it before exposing it beyond a trusted development network. Configure retention/cleanup before production; no automatic deletion is enabled yet.

## Tests

```sh
pip install -e '.[dev]'
pytest
```

Queue tests do not download model weights. Model loading/inference needs a separate smoke test in an environment with the model cached and compatible PyTorch dependencies.
