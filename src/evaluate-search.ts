import { readFile } from 'node:fs/promises';
import { searchImages } from './search-images.js';

export interface EvaluationCase {
  query: string;
  relevant_asset_ids: string[];
  library_slug?: string;
}

export interface RankingMetrics {
  recall_at_k: number;
  precision_at_k: number;
  reciprocal_rank: number;
  ndcg_at_k: number;
}

export function parseEvaluationSet(contents: string): EvaluationCase[] {
  const cases: EvaluationCase[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error('Invalid JSON on evaluation line ' + (index + 1));
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Evaluation line ' + (index + 1) + ' must be a JSON object');
    }
    const item = value as Record<string, unknown>;
    if (typeof item.query !== 'string' || !item.query.trim()) {
      throw new Error('Evaluation line ' + (index + 1) + ' requires a non-empty query');
    }
    if (!Array.isArray(item.relevant_asset_ids) || item.relevant_asset_ids.length === 0
      || item.relevant_asset_ids.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new Error('Evaluation line ' + (index + 1) + ' requires a non-empty relevant_asset_ids string array');
    }
    if (item.library_slug !== undefined && (typeof item.library_slug !== 'string' || !item.library_slug.trim())) {
      throw new Error('Evaluation line ' + (index + 1) + ' library_slug must be a non-empty string when supplied');
    }
    cases.push({
      query: item.query.trim(),
      relevant_asset_ids: [...new Set(item.relevant_asset_ids as string[])],
      ...(item.library_slug === undefined ? {} : { library_slug: item.library_slug as string }),
    });
  }
  if (cases.length === 0) throw new Error('Evaluation set contains no test cases');
  return cases;
}

export function scoreRanking(rankedAssetIds: string[], relevantAssetIds: string[], k: number): RankingMetrics {
  if (!Number.isInteger(k) || k < 1 || k > 100) {
    throw new Error('Evaluation k must be an integer from 1 to 100');
  }
  const relevant = new Set(relevantAssetIds);
  if (relevant.size === 0) throw new Error('At least one relevant asset ID is required');
  const top = rankedAssetIds.slice(0, k);
  const hits = top.filter((id) => relevant.has(id));
  const firstRelevantRank = top.findIndex((id) => relevant.has(id));
  const dcg = top.reduce((sum, id, index) => sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const idealCount = Math.min(relevant.size, k);
  const idealDcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((sum, value) => sum + value, 0);
  return {
    recall_at_k: hits.length / relevant.size,
    precision_at_k: hits.length / k,
    reciprocal_rank: firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1),
    ndcg_at_k: idealDcg === 0 ? 0 : dcg / idealDcg,
  };
}

export async function evaluateSearchFile(filePath: string, k = 10) {
  if (!Number.isInteger(k) || k < 1 || k > 100) {
    throw new Error('Evaluation k must be an integer from 1 to 100');
  }
  const cases = parseEvaluationSet(await readFile(filePath, 'utf8'));
  const reports: Array<{
    query: string;
    library_slug?: string;
    relevant_asset_ids: string[];
    ranked_asset_ids: string[];
    metrics: RankingMetrics;
  }> = [];
  for (const item of cases) {
    const response = await searchImages(item.query, k, item.library_slug);
    const rankedAssetIds = response.results.map((result: { id: string }) => result.id);
    reports.push({
      query: item.query,
      ...(item.library_slug ? { library_slug: item.library_slug } : {}),
      relevant_asset_ids: item.relevant_asset_ids,
      ranked_asset_ids: rankedAssetIds,
      metrics: scoreRanking(rankedAssetIds, item.relevant_asset_ids, k),
    });
  }
  const average = (name: keyof RankingMetrics) =>
    reports.reduce((sum, report) => sum + report.metrics[name], 0) / reports.length;
  const mean: RankingMetrics = {
    recall_at_k: average('recall_at_k'),
    precision_at_k: average('precision_at_k'),
    reciprocal_rank: average('reciprocal_rank'),
    ndcg_at_k: average('ndcg_at_k'),
  };
  return { evaluation_cases: reports.length, k, mean_metrics: mean, cases: reports };
}
