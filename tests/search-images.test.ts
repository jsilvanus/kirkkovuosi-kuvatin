import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { pool } from '../src/db.js';
import { searchImages } from '../src/search-images.js';

test('semantic image search rejects an empty query before contacting services', async () => {
  await assert.rejects(() => searchImages('   '), /Search query must not be empty/);
});

test('semantic image search validates the result limit before contacting services', async () => {
  await assert.rejects(() => searchImages('kaste', 0), /limit must be an integer from 1 to 100/);
  await assert.rejects(() => searchImages('kaste', 101), /limit must be an integer from 1 to 100/);
  await assert.rejects(() => searchImages('kaste', 1.5), /limit must be an integer from 1 to 100/);
});

test('semantic search excludes vectors whose checksum no longer matches the asset', async () => {
  const imageModel = 'sentence-transformers/clip-ViT-B-32';
  const textModel = 'sentence-transformers/clip-ViT-B-32-multilingual-v1';
  const modelDigest = 'image=' + imageModel + ';text=' + textModel;
  const originalFetch = globalThis.fetch;
  const jobId = '00000000-0000-4000-8000-000000000001';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({
        model: imageModel + '+' + textModel,
        image_model: imageModel,
        text_model: textModel,
        modalities: ['text', 'image'],
        shared_vector_space: true,
        normalization: 'L2',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/v1/jobs/text') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: jobId, status: 'queued', modality: 'text', model_name: imageModel + '+' + textModel }), {
        status: 202, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/v1/jobs/' + jobId)) {
      return new Response(JSON.stringify({
        id: jobId, modality: 'text', filename: null, status: 'complete', model_name: imageModel + '+' + textModel,
        dimensions: 2, error: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        embedding: [1, 0],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('Unexpected embedding-service request: ' + url);
  }) as typeof fetch;

  let libraryId: string | undefined;
  const librarySlug = 'test-search-' + randomUUID();
  try {
    const library = await pool.query(
      "INSERT INTO libraries(slug,name,source_organisation,source_collection) VALUES ($1,$2,$3,$4) RETURNING id",
      [librarySlug, 'Search test', 'test-suite', 'stale-vector'],
    );
    libraryId = library.rows[0].id;
    const asset = await pool.query(
      "INSERT INTO assets(library_id,asset_type,title,sha256) VALUES ($1,'photo','Checksum test asset','current-checksum') RETURNING id",
      [libraryId],
    );
    const assetId = asset.rows[0].id;
    await pool.query(
      `INSERT INTO asset_embeddings(asset_id,model_name,model_digest,modality,dimensions,input_sha256,status,embedding)
       VALUES ($1,$2,$3,'image',2,'current-checksum','ready','[1,0]'::vector),
              ($1,$2,$3,'image',2,'old-checksum','ready','[0,1]'::vector)`,
      [assetId, imageModel, modelDigest],
    );

    const response = await searchImages('test query', 10, librarySlug);
    assert.equal(response.count, 1);
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].id, assetId);
  } finally {
    globalThis.fetch = originalFetch;
    if (libraryId) await pool.query('DELETE FROM libraries WHERE id=$1', [libraryId]);
  }
});
