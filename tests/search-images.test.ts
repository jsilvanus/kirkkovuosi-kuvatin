import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { searchImages } from '../src/search-images.js';

test('semantic image search rejects an empty query before contacting services', async () => {
  await assert.rejects(() => searchImages('   '), /Search query must not be empty/);
});

test('semantic image search validates the result limit before contacting services', async () => {
  await assert.rejects(() => searchImages('kaste', 0), /limit must be an integer from 1 to 100/);
  await assert.rejects(() => searchImages('kaste', 101), /limit must be an integer from 1 to 100/);
  await assert.rejects(() => searchImages('kaste', 1.5), /limit must be an integer from 1 to 100/);
});
