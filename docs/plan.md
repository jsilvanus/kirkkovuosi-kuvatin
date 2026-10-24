# Project plan: Kirkkovuosi-Kuvatin

## 1. Purpose

Kirkkovuosi-Kuvatin is a semantic visual-matching tool for planning social-media communications around Sundays and other dates in the Christian liturgical year.

Given a list of Sundays and their headings, Bible readings, and optional sermon notes or other editorial text, the application recommends relevant items from existing visual libraries. A user reviews and selects suggestions in a UI, then exports a spreadsheet that can be imported into Canva for bulk creation of social-media graphics.

**This is a retrieval and recommendation application, not an image-generation application.** It must not generate replacement pictures, pictograms, backgrounds, or finished graphics. The visual assets already exist in the organisation's graphical design system and libraries.

## 2. Architecture principles

- **Node.js backend with TypeScript.** Use Node.js as the server runtime and TypeScript for backend code. Keep the API backend distinct from the Vite frontend at the project-architecture level, while allowing both to share generated API types or a small common package where useful.
- **OpenAPI-first API.** Define the HTTP API in a version-controlled OpenAPI specification. Treat the specification as the contract for the backend, frontend API types/client, documentation, and CLI generation.
- **CLI is a first-class interface from MVP.** Every core workflow available in the UI must also be usable through the CLI, including occasion import/management, asset indexing, batch recommendation, selection/review updates, and XLSX/CSV export. Generate the API client and as much of the CLI as practical from the OpenAPI specification; add thin hand-written command wrappers only where needed for a usable CLI. CLI commands must call the same backend application services/API rather than implement separate business logic. Support machine-readable output (at least JSON) as well as human-readable terminal output.
- **Small Vite frontend.** Build a lightweight browser UI with Vite, separate from the backend. Do not introduce Next.js, server-side rendering, or a JavaScript server framework. Use TypeScript if helpful, but keep the frontend intentionally small.
- **Separate deployable parts.** The backend serves the API; the Vite frontend is built into static assets and can be served by any suitable static-file server or reverse proxy. The CLI communicates with the same API.
- **No application authentication in the initial deployment.** The data and asset libraries are public, and the service is intended for a trusted deployment; do not add user accounts, login, roles, or authentication flows to the MVP. This does not mean the service should be exposed indiscriminately to the public internet: deployment/network access remains an operational decision.
- **Short-lived workflow data.** Persist the imported Sunday headings, sermon notes, and other workflow-specific occasion text only for the active planning workflow. After each successful export, set or reset that workflow's expiry to eight days from the export time. This is a sliding TTL anchored to the most recent successful export, not to each page view or edit. Expired workflow text and associated transient workflow state must be automatically purged. Keep durable public library assets and their reusable embeddings outside this TTL.
- **Shared application core.** Keep domain logic and use cases in reusable application services. HTTP handlers, CLI commands, and the future MCP server must delegate to these services instead of duplicating business logic.
- **Generic per-library search.** In addition to occasion-based recommendations, provide manual search over each asset library independently. Users must be able to search pictograms, photos, and backgrounds without creating a Sunday workflow, using natural-language semantic queries and available metadata/keywords/filters. Expose the same capability through the web UI, CLI, and API.
- **Post-MVP in-process MCP.** After the MVP is complete, add an MCP server that runs in-process with the Node.js application and exposes selected application capabilities as MCP tools/resources. Reuse the existing application services and schemas; do not create a separate MCP-specific implementation of matching, indexing, selection, or export. Keep the MCP interface additive so it does not delay the MVP.
- **Ollama integration.** Embedding inference is performed through Ollama from the backend, using a configurable model and base URL. The API must report clear errors when Ollama or the selected model is unavailable.
- **Local S3-compatible object storage.** VersityGW is provided as the local S3-compatible storage service. Store original visual assets and generated preview/thumbnail files there when appropriate; use standard S3 APIs and configuration rather than coupling application logic to VersityGW-specific behaviour.
- **PostgreSQL for metadata and vectors.** Use PostgreSQL as the persistent source of truth for the asset catalogue, liturgical occasions, asset–occasion relationships, embedding metadata and vectors, and workflow state. Use pgvector for vector storage and similarity search, after verifying extension availability and compatibility in the deployment. Keep original binary assets and previews in VersityGW/S3. Embeddings are derived, versioned data that can be regenerated from source assets/text; record source IDs/checksums, model identity/version, modality, dimensions, and generation status. Keep database access behind repository/search interfaces so indexing and query strategies can evolve without changing the application workflows.

## 3. Primary workflow

1. **Load the occasions.** Import or enter a list of Sundays/occasions. Each entry can include a date, liturgical name, one or more headings, Bible readings or their text, and optional sermon notes or other text.
2. **Prepare the asset library.** Index the existing pictograms, photos, and backgrounds as separate asset types. Read available metadata and descriptions; allow optional keywords and human-written descriptions.
3. **Calculate embeddings.** Use Ollama as the model runner for local embedding inference. Generate and store embeddings for asset text and, if a compatible locally runnable multimodal embedding model is available and performs well, visual contents of image assets. Asset indexing is reusable and must not be repeated for every search.
4. **Find candidates.** For each occasion, calculate embeddings for its available text through Ollama and retrieve semantically relevant assets. Combine evidence from headings, Bible readings, sermon notes, asset descriptions/keywords, and visual embeddings where supported.
5. **Generate a review list.** For each occasion and each asset library/type, produce 2–5 ranked suggestions by default (where enough candidates exist). Keep the full ranked candidate list available for users who want more options; do not treat the top-ranked item as automatically approved.
6. **Review and select.** Users review suggestions in the web UI or CLI, preview assets, inspect match explanations, accept/select one or more candidates, reject candidates, or make manual choices. Persist selections and review status so work can move between CLI and UI. Clearly distinguish generated recommendations, selected assets, and reviewed/approved choices.
7. **Manual library search.** Independently search any asset library (pictograms, photos, or backgrounds) with a natural-language query, metadata/keyword terms, and optional filters. Return ranked results with previews and useful metadata; allow the user to inspect and select an asset for reference or download/export as appropriate. This must work without creating or extending a Sunday workflow.
8. **Export the plan.** Export the reviewed selections as an Excel workbook (.xlsx) and optionally a Canva-friendly CSV. The XLSX may optionally include embedded image previews for human review, alongside stable asset IDs and usable asset references. Keep a clean Canva-import sheet separate from any richer review sheet where necessary. Test embedded-image compatibility against the team's actual Canva Bulk Create workflow. Canva templates and bulk creation are handled in Canva, not generated by this app.

The workflow should support processing many Sundays together, while allowing a user to inspect and edit each Sunday's recommendations individually. Treat each imported batch as a workflow with its own stable ID and expiry metadata. A successful export refreshes the workflow's eight-day TTL; failed exports must not refresh it. The CLI and web UI must operate on the same workflow state.

## 4. Goals and non-goals

### Goals

- Find meaningful visual matches even when the asset has no keywords.
- Provide useful manual semantic search within each asset library, independently of the Sunday workflow.
- Use keywords and descriptions as helpful additional signals, not as a required taxonomy.
- Keep pictograms, photos, and backgrounds as distinct asset collections with their own selection and ranking behaviour.
- Make recommendations reviewable and editable by a human.
- Preserve the organisation's existing visual identity and design-system rules.
- Produce a predictable spreadsheet suitable for downstream Canva bulk creation.
- Run embedding inference through Ollama, preferring local inference and avoiding a mandatory external embedding API.
- Make matching quality measurable and allow the embedding model to be changed after evaluation.

### Non-goals for the initial version

- Generating images, pictograms, backgrounds, or complete social-media designs.
- Replacing Canva or implementing a full graphic-design editor.
- Automatically publishing to social-media platforms.
- Treating an embedding similarity score as a definitive theological judgement.
- Requiring all assets to be manually keyword-tagged before they can be searched.

## 5. Inputs and data model

### Liturgical occasion

Each occasion should support fields such as:

- Stable ID
- Date
- Liturgical year/season and occasion name, when available
- One or more headings/titles
- Bible reading references
- Bible reading text, where supplied and legally usable
- Optional sermon notes
- Optional additional editorial text
- Workflow status and user notes

Do not assume every occasion has every text field. A heading alone should still be searchable. Keep the source and type of each text field so matching can be inspected and tuned.

### Visual asset

Each asset should support:

- Stable ID and asset type: pictogram, photo, or background
- File path or stable URL/reference
- Preview/thumbnail reference
- Optional name, description, keywords, and existing design-system metadata
- Photographer/creator, copyright holder, source organisation, required attribution/credit line, licence/usage terms, and any other rights-related names or notices supplied with the asset
- Optional usage guidance, aspect ratio, colour/theme, or other constraints supplied by the design system
- File checksum/version and indexing status
- Embedding model/version, Ollama model identifier, vector dimensions, modality, and relevant source version
- Availability/licence or usage notes, if supplied

Asset indexing should not modify the original files. Re-index when an asset changes or when the embedding model/version changes.

## 6. Semantic matching approach

### Ollama and embedding models

Ollama is the assumed model runner for embedding inference. Implement an embedding-provider interface backed initially by Ollama's embedding API, so model choice and provider details do not leak throughout the application.

- Evaluate models that can be run through Ollama against real Finnish liturgical headings, Bible texts, and representative assets before choosing a default.
- For text-to-image matching, use a model whose text and image vectors share a compatible embedding space, if such a suitable model is available through the chosen local setup. Do not assume a text-only embedding model can embed image pixels.
- If Ollama can provide only text embeddings for the selected model, embed headings, descriptions, and available keywords as text, and treat that as a useful first implementation. Assets without metadata should still be eligible for direct visual matching in a later compatible-model integration, not falsely presented as visually embedded.
- If direct visual embeddings are needed but unavailable through Ollama for a suitable model, document the gap and evaluate an adapter or separate local inference service before considering a remote API. Do not silently introduce an external dependency.
- Store the exact model identifier and, where obtainable, model/version or digest, vector dimensions, modality, and source version so stale vectors can be detected. Persist vectors in PostgreSQL using pgvector, with separate metadata identifying the source, embedding model/version, modality, dimensions, and source version/checksum. Embeddings must be versioned and rebuildable from source content/assets. Use database similarity queries from the beginning; choose an appropriate pgvector index only when justified by collection size and measured performance.
- Precompute asset embeddings. Calculate occasion/query embeddings when an occasion is created or its text changes, and cache them where practical.
- Normalise vectors and use a documented similarity metric, typically cosine similarity when appropriate for the chosen model.
- Handle Ollama unavailability, missing models, timeouts, and embedding errors with clear UI/CLI diagnostics. Document model-pull and setup steps.

Text-only embeddings for image descriptions and visual embeddings are not interchangeable by default. The implementation must explicitly document which embedding spaces can be compared.

### Multiple text sources

Keep headings, Bible readings, sermon notes, and other editorial text distinguishable. Do not blindly concatenate everything into one long string: long readings or notes could overwhelm the heading. Instead, calculate or aggregate source-specific signals and evaluate a weighted ranking, for example:

- Heading/title relevance
- Bible-reading relevance
- Sermon-note relevance
- Additional-text relevance
- Asset description/keyword relevance
- Direct visual embedding similarity, when supported

Weights are tunable and should be validated with human judgements. Missing inputs should simply be omitted or have their weights redistributed. Show enough information in the UI to explain which text sources contributed to a recommendation.

### Ranking and constraints

- Return a ranked list per asset type for each occasion.
- Similarity scores are relevance signals, not calibrated probabilities.
- Support filters and design-system constraints where metadata exists (for example, asset type or suitable format).
- Avoid returning near-duplicate assets together where duplicate detection or metadata makes this feasible.
- Do not impose keyword requirements. Keywords and descriptions enrich semantic matching and can provide supplementary ranking signals.
- Keep ranking deterministic for the same inputs, model versions, and settings where feasible.

## 7. User interface

The UI should prioritise a clear review workflow over complex configuration.

### Manual library search

- Provide a dedicated search view for each library/type: pictograms, photos, and backgrounds.
- Support natural-language semantic search using the supported embedding space, plus literal metadata/keyword search.
- Allow filters for asset type, available metadata, and applicable design-system constraints.
- Show ranked results with previews, names/IDs, descriptions/keywords, and relevant usage metadata.
- Allow users to inspect an asset and copy its stable ID/reference; provide a download or export action only where the asset rights and deployment workflow allow it.
- Make it usable without creating a Sunday workflow, and do not store transient query text as durable data.

### Occasion list

- Display all imported occasions with date and heading.
- Show whether readings/notes are present and whether suggestions have been generated or reviewed.
- Support filtering and opening an occasion.

### Suggestion review

For each occasion:

- Display the heading and supplied source texts.
- Show separate ranked sections for pictograms, photos, and backgrounds.
- Display visual previews and useful asset metadata.
- Allow selection, deselection, rejection, and manual replacement.
- Make it clear which assets are selected for export.
- Where feasible, provide a concise match explanation (for example, relevant source text and available description) without presenting similarity as theological certainty.
- Preserve selections when recommendations are recalculated, unless the user explicitly chooses to reset them.

### Batch workflow

- Generate suggestions for many occasions in one operation.
- Provide progress and actionable error states for missing files, unsupported formats, or failed embeddings.
- Allow users to review occasions one by one and see which are still incomplete.
- Allow export of all reviewed occasions or a selected subset.

## 8. Spreadsheet and Canva export

Spreadsheet export is a core deliverable, not an afterthought. The purpose is to create a reliable data source for Canva's bulk creation workflow.

### Export formats

- **XLSX** as the primary human-reviewable workbook.
- **CSV** as an optional simple import format, with UTF-8 encoding and documented column names.
- **Optional embedded previews in XLSX.** Provide a mode that embeds selected pictogram/photo/background previews in worksheet cells for visual review. This is optional and should not be assumed to work as Canva image fields until tested with the actual Canva import workflow. Keep a simple Canva-import sheet with the columns Canva expects, and optionally a separate review sheet containing previews, scores, alternatives, and editorial notes.

Confirm the exact Canva bulk-create field mapping with a real template during implementation. Keep the schema simple, stable, and configurable rather than assuming undocumented Canva behaviour.

### Suggested row model

Prefer one row per occasion/design output, with stable columns such as:

- date
- liturgical_name (Sunday/occasion name; include this in every exported row)
- heading (include the selected Sunday heading in every exported row)
- bible_readings
- sermon_notes (optional; include only if desired in the exported content)
- pictogram_id, pictogram_url or pictogram_path, and available pictogram credit/creator/rights fields
- photo_id, photo_url or photo_path, photographer/creator credit, copyright holder and required attribution where available
- background_id, background_url or background_path, and available creator/rights fields
- selected_asset_notes
- template_variant (optional, if the team later uses multiple Canva templates)

Include photographer names and all other available required credit/attribution details in the exported data for each selected asset, not merely in the internal asset catalogue or a separate reference document. Preserve the association between each credit and its specific asset. Include copyright holder, source, licence or usage notes when available and useful for downstream review; do not invent missing names or credits. If Canva's template cannot display every credit field, retain them in a companion review/metadata sheet and document how credits are carried into the final published design. Asset URLs or paths must be usable by the team's actual Canva workflow; do not assume a local filesystem path can be resolved by Canva. The local VersityGW S3 endpoint may not be reachable by Canva, so export must not assume that a local S3 URL is directly importable; determine whether the team needs a reachable URL, downloaded files, or another supported asset handoff. Determine whether the production workflow needs public/authorised URLs, filenames, or another stable reference. Never export temporary preview URLs.

If a Sunday needs several design variants, support multiple rows for that occasion or a clearly documented variant structure. Do not silently create a combinatorial explosion of every possible asset combination. Export only user-approved selections, and make unselected recommendations distinguishable from chosen assets in the workbook. Every exported row must include both the Sunday/occasion name and its selected heading alongside the image selections, so the visual choices remain tied to their liturgical context in Canva and in review.

Include a README/instructions sheet in XLSX explaining column meanings, and optionally an asset/recommendation review sheet. Keep the main data sheet suitable for mapping fields to Canva.

## 9. Asset ingestion and indexing

- Accept the actual formats present in the existing libraries; discover these before setting final format support.
- Preserve original filenames and stable IDs.
- Generate thumbnails/previews without replacing originals.
- Extract existing metadata where possible.
- Permit assets with no metadata to be indexed using visual embeddings when the selected model supports them.
- Support incremental indexing: new or changed assets are processed without rebuilding the entire library.
- Report unsupported, corrupt, missing, or inaccessible assets clearly.
- Treat the design system's rules and metadata as constraints or additional signals, not as a replacement for semantic matching.

The graphical design-system PDF documentation will be supplied to the implementation agent later. Once available, review it and record applicable asset categories, naming conventions, usage restrictions, dimensions, colour guidance, and export requirements in the implementation decisions.

## 10. Evaluation and quality

Before choosing a model or final ranking weights, create a small evaluation set with representative Finnish liturgical occasions and assets. Have knowledgeable users mark useful and poor matches.

Evaluate at least:

- Whether useful assets appear near the top of the ranked list
- Performance for pictograms versus photos versus backgrounds
- Performance with headings alone and with longer readings/notes
- Performance on assets with no keywords
- Whether keyword/description enrichment helps without dominating
- Diversity and duplicate behaviour
- Latency and resource use for batch processing on the intended Ollama host

Compare candidate models and ranking configurations using the same evaluation examples. Keep a small set of expected matches as regression tests. Human review remains authoritative.

## 11. Technical architecture: decisions to make deliberately

Do not commit to a large infrastructure or a particular vector database before learning the size and format of the libraries.

First inspect the repository and available environment. Then choose the simplest maintainable implementation that supports:

- A small Node.js/TypeScript backend and HTTP API
- A version-controlled OpenAPI specification as the API contract
- A generated CLI that uses the same API contract
- A small, separate Vite frontend built as static assets
- A persistent store for public asset metadata and embeddings, plus workflow-scoped occasion text, selections, and review state with explicit expiry timestamps
- Local S3-compatible object storage through the provided VersityGW service for original assets and derived previews/thumbnails
- PostgreSQL with pgvector for liturgical-text and visual-asset embedding records and similarity search, with model/version metadata and a replaceable search layer
- Vector storage and similarity search appropriate to the expected collection size
- A background/batch indexing path for asset embeddings
- An Ollama-backed embedding service behind a small provider interface
- An application service for recommendation and export
- Reliable XLSX/CSV generation

Keep the API usable independently of the web UI. All core workflows must be available through documented API operations and the CLI: importing and managing occasions, indexing assets, searching each library independently, generating recommendations in batches, reviewing/updating selections, and exporting results. The CLI must be suitable for interactive use and scripting, with stable exit codes, actionable errors, and JSON output. Do not put business logic exclusively in the frontend, CLI, or HTTP handlers. After MVP, the in-process MCP server should expose appropriate operations by calling the same application services.

Keep the OpenAPI document checked into the repository (for example, under `api/openapi.yaml` or an equivalent clearly documented path). Validate it in CI. Generate CLI/client artifacts reproducibly from it, and document the generator/version and regeneration command. Avoid committing generated output that cannot be reproduced.

Use PostgreSQL as the relational source of truth and pgvector for vector storage and similarity search from the initial implementation. Verify that the target PostgreSQL installation supports the required pgvector extension and choose vector dimensions and distance metric to match the selected embedding model. Encapsulate embedding generation and vector search behind interfaces so models and search/index strategies can evolve without rewriting the user workflow.

Configure the Ollama base URL and embedding model through environment/configuration settings. Support a locally running Ollama instance and, if needed, a separately hosted Ollama server on a trusted network. Do not expose Ollama publicly without appropriate network controls. Keep secrets and model credentials out of the repository. Do not make a cloud embedding API mandatory.

## 12. Privacy, rights, and text handling

- No user authentication or accounts are required for the initial deployment because the application data and visual libraries are public. Keep the service on an appropriately trusted network or protect it at the deployment boundary if it is reachable beyond that network; no application login is planned for the MVP.
- Use only Bible text that the organisation is permitted to process and export; retain references even when full text cannot be stored.
- Sermon notes, Sunday headings, and other imported occasion-specific text are transient workflow data, not a permanent archive. Retain them only while the workflow is active and automatically delete them when the workflow's eight-day sliding TTL expires.
- Set the workflow expiry to eight days after each successful export. Each later successful export of the same workflow resets the expiry to eight days after that export. Ordinary reads, edits, recommendation runs, and failed exports do not extend the TTL.
- Keep durable public asset-library metadata, source assets, and reusable asset embeddings outside the workflow TTL. Delete transient occasion text, occasion embeddings derived from it, recommendations, and workflow-specific selections/review state when the workflow expires, unless a clearly documented dependency must be retained without the source text.
- Keep sermon notes private to the deployment and do not send them to external model providers. Ollama is the assumed local inference path, though the actual server's location and network must be configured deliberately.
- Record the provenance and usage constraints of visual assets when available, including photographer/creator names, copyright holders, source organisation, required credit/attribution wording, and licence/usage terms. Preserve this metadata through selection and export; include the applicable credits alongside each selected asset in the exported workbook/CSV. Never infer or fabricate missing credits.
- Avoid sending complete source texts to third-party services by default.
- Implement and test automatic expiry/purge behaviour, including after restarts; do not rely only on an in-memory timer. Make the expiry timestamp visible in workflow status and provide a documented cleanup mechanism.

## 13. Suggested implementation phases

### Phase 0 — Repository and data discovery

- Inspect the repository and document the current state.
- Set up a Node.js/TypeScript backend and choose a lightweight API framework (Fastify is a reasonable default); document the framework choice. Keep embedding inference behind the Ollama HTTP API rather than requiring the backend itself to run ML models.
- Define the first OpenAPI contract and choose a reproducible OpenAPI-based CLI generation approach.
- Set up the minimal Vite frontend skeleton, separate from the API backend.
- Inspect sample occasion data and the asset libraries.
- Identify available metadata and file formats.
- Review the design-system documentation when supplied.
- Define a small representative evaluation set.
- Prototype Ollama-accessible embedding models and verify Finnish semantic matching. Verify direct image embedding support separately instead of assuming it exists.

**Exit criterion:** a documented, evidence-based model and architecture choice, with example matches that users consider useful and a clear statement of whether first-release matching uses text metadata, direct image embeddings, or both; plus an agreed Node.js/TypeScript backend, initial OpenAPI contract, generated-CLI approach, and minimal Vite app.

### Phase 1 — Working semantic matching prototype

- Implement the first API operations from the OpenAPI contract.
- Generate the CLI/client from the specification and verify it against the running API.
- Connect the Vite frontend to the API without adding backend responsibilities to the frontend toolchain.
- Ingest a small sample of occasions and all three asset categories.
- Compute embeddings through Ollama and persist versioned PostgreSQL embedding records using pgvector for liturgical text and each supported asset type.
- Generate ranked suggestions from headings and supplied texts.
- Add basic manual semantic search over each asset library, with ranked previews and metadata.
- Provide a basic UI or review view for inspecting results.
- Capture manual relevance judgements and tune ranking.

**Exit criterion:** a user can enter/select an occasion and inspect meaningful ranked suggestions from existing assets, without generating new images.

### Phase 2 — Complete review workflow

- Support batch import of a list of Sundays.
- Add optional Bible readings, sermon notes, and other text fields.
- Build the occasion list and suggestion-review UI.
- Add manual selections, rejections, filters, progress, and error handling.
- Add incremental asset indexing and embedding-version management.

**Exit criterion:** the communications team can review and approve visual choices for a batch of Sundays.

### Phase 3 — Canva-oriented export

- Produce a formatted XLSX workbook and CSV.
- Add optional embedded image previews to the review workbook.
- Agree and test column names and asset references against the team's actual Canva template and bulk-create process, including whether embedded images are recognised as usable Canva image fields.
- Support selected occasions, multiple variants, and only approved assets.
- Document the repeatable export-to-Canva procedure.

**Exit criterion:** an exported file can be imported into Canva and mapped to a real template without manual restructuring of the spreadsheet.

### Phase 4 — Quality, operational hardening, and post-MVP MCP

- Add an in-process MCP server to expose selected application services as tools/resources, reusing the same core logic as the API and CLI. Keep this work after the MVP and do not make MCP a release blocker for the MVP.
- Add regression evaluation for matching quality.
- Improve duplicate/diversity handling and explainability.
- Add robust re-indexing, backups, and clear operational diagnostics.
- Review the implementation against the supplied design system and the team's actual workflow.

## 14. Definition of done for the first useful release

A user can provide a list of Sundays with headings and optional readings, sermon notes, or other text; run semantic matching against existing pictograms, photos, and backgrounds; inspect and manually select suggestions in a UI or CLI; and export the approved choices in an XLSX/CSV format that works with the team's Canva bulk-creation process. Every export row includes the Sunday/occasion name and heading alongside its image selections.

No image generation is required or included.
