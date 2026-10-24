import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, migrate } from '../src/db.js';
import { importMetadata } from '../src/import-metadata.js';
import { reconcileFiles } from '../src/reconcile.js';
import type { ManifestRow } from '../src/manifest.js';

test('ingestion reruns are idempotent and preserve source provenance through deduplication', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('Set DATABASE_URL to a disposable PostgreSQL database.');
    return;
  }

  await migrate();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const library = `test-ingestion-${suffix}`;
  const directory = await mkdtemp(join(tmpdir(), 'kuvatin-ingestion-'));
  const file = join(directory, 'same-image.jpg');
  await writeFile(file, Buffer.from('same image bytes for two source records'));

  const makeRow = (sourceId: string, title: string, attribution: string): ManifestRow => ({
    library,
    libraryName: 'Ingestion test library',
    sourceOrganisation: 'test organisation',
    sourceCollection: 'test collection',
    sourceSystem: 'test-source',
    sourceId,
    sourceUrl: `https://example.test/assets/${sourceId}`,
    assetType: 'photo',
    title,
    description: 'A test image',
    keywords: ['test', 'shared'],
    originalFilename: 'same-image.jpg',
    localPath: file,
    creator: 'Test creator',
    rightsHolder: 'Test rights holder',
    attribution,
    licence: 'CC BY 4.0',
    usageTerms: 'Attribution required',
    metadata: { importedBy: 'integration-test', sourceId },
  });

  const rows = [
    makeRow('source-a', 'First source title', 'Credit source A'),
    makeRow('source-b', 'Second source title', 'Credit source B'),
  ];

  try {
    const firstImport = await importMetadata(rows);
    assert.deepEqual(firstImport.errors, []);
    assert.equal(firstImport.librariesCreatedOrUpdated, 1);
    assert.equal(firstImport.sourcesUpserted, 2);

    const beforeReconcile = await pool.query(
      `SELECT count(*)::int AS count FROM assets a
       JOIN libraries l ON l.id = a.library_id WHERE l.slug = $1`,
      [library],
    );
    assert.equal(beforeReconcile.rows[0].count, 2);

    const reconciliation = await reconcileFiles(directory);
    assert.equal(reconciliation.length, 2);
    assert.equal(reconciliation.filter((item) => item.status === 'duplicate-within-library').length, 1);

    const afterReconcile = await pool.query(
      `SELECT a.id, a.sha256, a.file_status
       FROM assets a JOIN libraries l ON l.id = a.library_id WHERE l.slug = $1`,
      [library],
    );
    assert.equal(afterReconcile.rows.length, 1);
    assert.match(afterReconcile.rows[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(afterReconcile.rows[0].file_status, 'verified');

    const provenance = await pool.query(
      `SELECT s.source_id, s.attribution, s.licence, s.usage_terms, s.metadata
       FROM asset_sources s JOIN libraries l ON l.id = s.library_id
       WHERE l.slug = $1 ORDER BY s.source_id`,
      [library],
    );
    assert.equal(provenance.rows.length, 2);
    assert.deepEqual(provenance.rows.map((row) => row.source_id), ['source-a', 'source-b']);
    assert.deepEqual(provenance.rows.map((row) => row.attribution), ['Credit source A', 'Credit source B']);
    assert.ok(provenance.rows.every((row) => row.licence === 'CC BY 4.0'));
    assert.ok(provenance.rows.every((row) => row.usage_terms === 'Attribution required'));

    const rerun = await importMetadata(rows);
    assert.deepEqual(rerun.errors, []);
    assert.equal(rerun.librariesCreatedOrUpdated, 1);
    assert.equal(rerun.sourcesUpserted, 2);

    const finalCounts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM assets a WHERE a.library_id = l.id) AS assets,
         (SELECT count(*)::int FROM asset_sources s WHERE s.library_id = l.id) AS sources
       FROM libraries l WHERE l.slug = $1`,
      [library],
    );
    assert.equal(finalCounts.rows[0].assets, 1);
    assert.equal(finalCounts.rows[0].sources, 2);
  } finally {
    await pool.query('DELETE FROM libraries WHERE slug = $1', [library]);
    await rm(directory, { recursive: true, force: true });
  }
});
