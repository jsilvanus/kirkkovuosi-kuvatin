CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  source_organisation text NOT NULL,
  source_collection text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('pictogram','photo','background')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  source_id text,
  source_url text,
  original_filename text,
  creator text,
  rights_holder text,
  attribution text,
  licence text,
  usage_terms text,
  metadata jsonb NOT NULL DEFAULT '{}',
  local_path text,
  s3_bucket text,
  s3_key text,
  content_type text,
  byte_size bigint,
  sha256 text,
  file_status text NOT NULL DEFAULT 'metadata-only'
    CHECK (file_status IN ('metadata-only','unverified','verified','uploaded','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
);

-- One stored file asset per exact content hash within a library.
-- PostgreSQL enforces this even when ingestion jobs run concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS assets_library_sha256_unique
  ON assets(library_id, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS assets_library_type_idx ON assets(library_id, asset_type);
CREATE INDEX IF NOT EXISTS assets_keywords_gin ON assets USING gin(keywords);
CREATE INDEX IF NOT EXISTS assets_source_url_idx ON assets(library_id, source_url);

CREATE TABLE IF NOT EXISTS asset_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_id text,
  source_url text,
  original_filename text,
  metadata jsonb NOT NULL DEFAULT '{}',
  creator text,
  rights_holder text,
  attribution text,
  licence text,
  usage_terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (library_id, source_system, source_id)
);
CREATE INDEX IF NOT EXISTS asset_sources_asset_idx ON asset_sources(asset_id);

CREATE TABLE IF NOT EXISTS asset_embeddings (
  id bigserial PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  model_digest text NOT NULL DEFAULT '',
  modality text NOT NULL CHECK (modality IN ('text','image')),
  dimensions integer NOT NULL CHECK (dimensions > 0),
  input_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('ready','failed')),
  embedding vector,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, model_name, model_digest, modality, input_sha256),
  CHECK ((status = 'ready' AND embedding IS NOT NULL) OR status = 'failed')
);
CREATE INDEX IF NOT EXISTS asset_embeddings_lookup_idx
  ON asset_embeddings(model_name, model_digest, modality, dimensions, status);
