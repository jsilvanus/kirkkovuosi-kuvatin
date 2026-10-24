# Multimodal Embedding Service

A separate Python service for durable, asynchronous image/text embeddings. It uses one multilingual CLIP model for both modalities so text queries and image vectors share a vector space. It does not write directly to Kirkkovuosi-Kuvatin's PostgreSQL tables; the caller retrieves completed vectors and persists them with its existing asset/model/checksum metadata.

## Why this model

Default model: `sentence-transformers/clip-ViT-B-32-multilingual-v1`. It pairs a CLIP image encoder with a multilingual text encoder intended to match the same image-vector space, supporting Finnish text queries. Keep the model ID and revision fixed for an index generation; changing either requires re-embedding.

The model is configurable with `EMBEDDING_MODEL`. Only change it to another model whose documented API returns compatible embeddings for both images and text.

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

The first worker start downloads the model from Hugging Face. Set `EMBEDDING_DEVICE=cuda` for a supported NVIDIA/PyTorch CUDA environment, or `cpu` to force CPU. `auto` (default) uses CUDA when available. Keep the API bound to localhost or a trusted private network; this initial service has no authentication.

## API

- `GET /health` — liveness and configured model identifier (does not guarantee the model has loaded).
- `POST /v1/jobs/text` — JSON `{"text":"pappi jakaa ehtoollista kirkossa"}`.
- `POST /v1/jobs/image` — JSON `{"image_base64":"...","filename":"asset.jpg"}` (raw base64, no data-URL prefix).
- `GET /v1/jobs/{job_id}` — queued/running/complete/failed status and, on success, the vector, dimensions, model identifier, and modality.
- `GET /v1/models` — configured model identifier and contract.

The POST endpoints return `202 Accepted` with a job ID. Image bytes are written to a spool file and the SQLite queue stores only its path. The worker claims jobs transactionally, batches neither modality yet, and persists result vectors in SQLite until clients fetch them. Completed jobs remain available for retry/retrieval; this is an initial development service, not a multi-tenant public API.

## Queue and data handling

`EMBEDDING_DATA_DIR` contains `queue.sqlite3` and image spool files; mount it as a persistent volume and share it between API and worker processes. SQLite WAL and short transactions let the API and worker access the same queue. Do not point separate hosts at a local SQLite file; use a networked queue/database before scaling across hosts.

The service limits each uploaded image to 15 MiB and validates it with Pillow before enqueueing. It does not fetch caller-supplied URLs, avoiding SSRF. Put a reverse proxy/authentication in front of it before exposing it beyond a trusted development network. Configure retention/cleanup before production; no automatic deletion is enabled yet.

## Tests

```sh
pytest
```

Queue tests do not download model weights. Model loading/inference needs a separate smoke test in an environment with the model cached and compatible PyTorch dependencies.
