import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseEvaluationSet, scoreRanking } from '../src/evaluate-search.js';

test('ranking metrics score a perfect ranking', () => {
  const metrics = scoreRanking(['a', 'b', 'c'], ['a', 'b'], 3);
  assert.equal(metrics.recall_at_k, 1);
  assert.equal(metrics.precision_at_k, 2 / 3);
  assert.equal(metrics.reciprocal_rank, 1);
  assert.equal(metrics.ndcg_at_k, 1);
});

test('ranking metrics penalize lower-ranked relevant assets', () => {
  const metrics = scoreRanking(['x', 'a', 'b'], ['a', 'b'], 3);
  assert.equal(metrics.recall_at_k, 1);
  assert.equal(metrics.reciprocal_rank, 0.5);
  assert.ok(metrics.ndcg_at_k < 1);
});

test('ranking metrics report zero for no relevant results', () => {
  const metrics = scoreRanking(['x', 'y'], ['a'], 2);
  assert.equal(metrics.recall_at_k, 0);
  assert.equal(metrics.precision_at_k, 0);
  assert.equal(metrics.reciprocal_rank, 0);
  assert.equal(metrics.ndcg_at_k, 0);
});

test('evaluation JSONL accepts comments and de-duplicates relevant IDs', () => {
  const cases = parseEvaluationSet(
    '# human-reviewed examples\n{"query":"  kaste  ","relevant_asset_ids":["a","a","b"],"library_slug":"photos"}\n',
  );
  assert.deepEqual(cases, [{ query: 'kaste', relevant_asset_ids: ['a', 'b'], library_slug: 'photos' }]);
});

test('evaluation JSONL rejects missing labels and malformed JSON', () => {
  assert.throws(() => parseEvaluationSet('{"query":"kaste","relevant_asset_ids":[]}'), /relevant_asset_ids/);
  assert.throws(() => parseEvaluationSet('{oops}'), /Invalid JSON on evaluation line 1/);
  assert.throws(() => parseEvaluationSet(''), /contains no test cases/);
});
