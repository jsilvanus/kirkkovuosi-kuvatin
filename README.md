# Kirkkovuosi-Kuvatin

Semantic visual search for liturgical Sundays and occasions. This repository includes the first library-ingestion pipeline. It does not generate images.

> **Development status:** This project is not in production. There are no existing installations to preserve, so database migrations and upgrade compatibility are not required at this stage. See [the development status policy](docs/development-status.md); the project owner will update it when that changes.

## Requirements

- Node.js 22+
- PostgreSQL with pgvector (the included Compose service uses `pgvector/pgvector:pg17`)
- An S3-compatible service, such as VersityGW, and a bucket created by an operator
- Ollama with one or more text-embedding models pulled

Copy `.env.example` to `.env`, set strong local credentials/endpoints, then run:

```sh
docker compose up -d db
npm install
npm run db:migrate
ollama pull nomic-embed-text
```

## Ingestion steps

Create a JSON array or JSON Lines manifest. Example: `examples/assets.manifest.example.json`. Every record names its library and source system. Import metadata independently from file upload:

```sh
npm run assets:import -- ./assets.json
npm run assets:reconcile -- ./downloads
npm run assets:upload
npm run assets:embed
```

Or run all steps in order:

```sh
npm run assets:pipeline -- ./assets.json ./downloads nomic-embed-text
```

Embedding model names can be passed as extra arguments to `assets:embed`; otherwise `EMBEDDING_MODELS` is used. Current embedding calculation embeds metadata text through Ollama `/api/embed`. It does not claim to produce image-pixel embeddings. Text-to-image retrieval requires a model with a compatible shared embedding space and a separate supported image-input implementation.

## Idempotency and deduplication

- Every asset belongs to an explicit library. Deduplication is **within a library only**; identical files in two libraries may have independent records and objects.
- PostgreSQL stores the SHA-256 of verified file bytes and enforces a unique `(library_id, sha256)` constraint. A filename is not proof of identity.
- Metadata import upserts stable source IDs within a library. Keep source IDs when available. The source-association table preserves source provenance and rights metadata separately from the canonical file asset.
- Reconciliation hashes each file before upload. If identical bytes already exist in the same library, it reassigns source associations to the existing asset and removes the duplicate asset record. Different libraries are never deduplicated against each other.
- S3 keys include library ID and SHA-256. Upload is only attempted for files verified by reconciliation. Existing objects are checked before use.
- Embeddings are separate records keyed by asset, model identity/digest, modality, and input checksum. Adding another model does not overwrite the first model's vectors.

Review reconciliation reports before treating the library as ready. Preserve source licences, usage restrictions, and required attribution exactly as provided. Do not bulk-download or index resources until the applicable terms and permissions have been checked.

## Current limitations

- Source-specific EVL metadata adapters are not yet implemented. The current supported ingestion format is JSON/JSONL; manually downloaded files can be reconciled against manifest paths or filenames.
- Preview/thumbnail generation, image-pixel embeddings, search API/UI, occasion workflows, and XLSX/Canva export remain later steps.
- The pipeline expects a source ID for reliable source-record upserts. Records without stable IDs can be imported, but should be reviewed for ambiguity.
