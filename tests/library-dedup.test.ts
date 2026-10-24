import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, migrate } from '../src/db.js';

test('deduplication is unique within a library but not across libraries', async (t) => {
  if (!process.env.DATABASE_URL) { t.skip('Set DATABASE_URL to a disposable PostgreSQL database.'); return; }
  await migrate();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const libraryA = (await pool.query(`INSERT INTO libraries(slug,name,source_organisation) VALUES($1,$2,'test') RETURNING id`, [`test-a-${suffix}`, 'Test A'])).rows[0].id as string;
  const libraryB = (await pool.query(`INSERT INTO libraries(slug,name,source_organisation) VALUES($1,$2,'test') RETURNING id`, [`test-b-${suffix}`, 'Test B'])).rows[0].id as string;
  const checksum = 'a'.repeat(64);
  try {
    await pool.query(`INSERT INTO assets(library_id,asset_type,title,sha256) VALUES($1,'photo','A',$2)`, [libraryA,checksum]);
    await assert.rejects(pool.query(`INSERT INTO assets(library_id,asset_type,title,sha256) VALUES($1,'photo','Duplicate A',$2)`, [libraryA,checksum]));
    await pool.query(`INSERT INTO assets(library_id,asset_type,title,sha256) VALUES($1,'photo','Same bytes in B',$2)`, [libraryB,checksum]);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM assets WHERE sha256=$1`, [checksum])).rows[0].n, 2);
  } finally {
    await pool.query('DELETE FROM libraries WHERE id = ANY($1::uuid[])', [[libraryA,libraryB]]);
  }
});
