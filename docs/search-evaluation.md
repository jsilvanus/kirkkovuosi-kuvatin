# Semantic search evaluation

The evaluation harness measures retrieval quality on a small human-labelled JSON Lines file. Each non-comment line is one query and its known-relevant asset IDs:

```jsonl
{"query":"Jeesus siunaa lapsia","library_slug":"photos","relevant_asset_ids":["asset-uuid-1","asset-uuid-2"]}
{"query":"risti ja tyhjä hauta","library_slug":"backgrounds","relevant_asset_ids":["asset-uuid-3"]}
{"query":"pappi jakaa ehtoollista","relevant_asset_ids":["asset-uuid-4"]}
```

Replace the illustrative IDs with actual UUIDs from the asset records. Keep labels human-reviewed: an asset should be listed as relevant because it is genuinely a useful match for that query, not merely because it contains similar metadata. Queries may specify a library slug to avoid mixing asset types.

Run after the database has been populated and image embeddings are available:

```sh
npm run assets:evaluate -- ./evaluation.jsonl 10
```

The second argument is optional k (default 10; allowed range 1–100). The command emits JSON with each query's ranked asset IDs and metrics, plus the mean across cases:

- **Recall@k**: fraction of the labelled relevant assets found in the first k results.
- **Precision@k**: fraction of the first k results that are labelled relevant.
- **Reciprocal rank**: inverse rank of the first relevant result, or zero if none appears.
- **nDCG@k**: ranking quality against an ideal ordering of the labelled relevant assets.

Start with a manageable set of varied Finnish liturgical queries and label multiple useful assets per query where possible. Record the evaluation file with the project, while ensuring it contains no restricted source data. Keep the same query set when comparing model pairs or ranking changes. The harness does not invent ground-truth labels and does not itself prove that the labels are comprehensive.
