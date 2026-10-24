# Roadmap: Kirkkovuosi-Kuvatin

This roadmap groups the project into six delivery phases. The detailed requirements and technical constraints live in [plan.md](./plan.md). Phases can be adjusted after repository and asset-library discovery, but the MVP should remain focused on useful local search, review, and export.

## Phase 1 — Discover and prove the matching approach

- Inspect the repository, existing pictogram/photo/background libraries, formats, metadata, and design-system documentation when supplied.
- Establish the Node.js/TypeScript backend, Vite frontend, OpenAPI contract, and CLI generation approach.
- Evaluate Ollama-accessible embedding models against Finnish liturgical texts and representative assets.
- Verify whether the selected local setup supports compatible text-to-image embeddings; document any limitations.
- Define a small human-reviewed evaluation set.

**Exit criteria:** architecture and model choices are documented; a small prototype demonstrates useful results or clearly identifies what must change.

## Phase 2 — Asset ingestion and independent library search

- Integrate the provided VersityGW S3-compatible storage for originals and previews where appropriate.
- Build incremental asset indexing and store asset metadata plus versioned embeddings in PostgreSQL with pgvector for similarity search, for pictograms, photos, and backgrounds as supported.
- Add independent semantic and keyword/metadata search for each library.
- Expose search through the API, CLI, and a simple web UI, with ranked results, previews, metadata, and filters.

**Exit criteria:** users can find and inspect library assets without creating a Sunday workflow; re-indexing changed assets is supported.

## Phase 3 — Sunday workflows and recommendations

- Import and manage batches of Sundays/occasions, including names, headings, Bible reading references/text, and optional sermon notes.
- Generate 2–5 ranked suggestions per asset library/type when enough candidates exist.
- Build the occasion list and review UI, including preview, selection, rejection, manual replacement, and match explanations where feasible.
- Make selections and review state available consistently through the web UI and CLI.
- Apply workflow-scoped retention: after a successful export, set the workflow expiry to eight days later; purge expired transient text and related workflow state automatically.

**Exit criteria:** a user can import a batch, generate recommendations, and review/select assets using either interface; transient workflow data has tested expiry behaviour.

## Phase 4 — Export and Canva validation

- Generate XLSX and CSV exports from approved selections.
- Include the Sunday/occasion name and selected heading in every export row alongside the image selections.
- Provide a clean Canva-import sheet and a richer review sheet where useful.
- Make embedded image previews an optional XLSX feature for human review.
- Validate column mapping, image handling, and asset handoff with the team's actual Canva template and Bulk Create process.

**Exit criteria:** an export preserves Sunday name, heading, and selected assets, and can be used in the actual Canva workflow without restructuring the data manually.

## Phase 5 — MVP hardening and operational readiness

- Improve ranking using the human-reviewed evaluation set; add regression checks for matching quality.
- Add actionable CLI/API errors, batch progress, deterministic selection persistence, and diagnostics.
- Test incremental re-indexing, backup/restore, and automatic TTL cleanup across restarts.
- Document configuration for Ollama and VersityGW, local setup, asset rights/provenance, and the repeatable export procedure.
- Confirm the unauthenticated deployment is restricted to an appropriately trusted network or protected at the deployment boundary.

**Exit criteria:** the core workflow is repeatable, documented, and reliable for the intended deployment.

## Phase 6 — Post-MVP extensions

- Add an in-process MCP server exposing selected search, recommendation, review, and export capabilities through the shared application services.
- Evaluate and tune pgvector indexing (for example, exact search versus an approximate index) if library size or latency warrants it.
- Improve duplicate/diversity handling and explainability.
- Extend design-system constraints and metadata support based on the supplied documentation and team feedback.

**Exit criteria:** extensions build on the stable API and shared application core without duplicating business logic or delaying the MVP.
