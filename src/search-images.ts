import { EmbeddingServiceClient } from './embedding-service-client.js';
import { pool } from './db.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForVector(client: EmbeddingServiceClient, jobId: string) {
  const timeoutMs = Number(process.env.EMBEDDING_JOB_TIMEOUT_MS || 300_000);
  const pollMs = Number(process.env.EMBEDDING_JOB_POLL_MS || 750);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await client.getJob(jobId);
    if (job.status === 'complete') {
      if (!job.embedding?.length || job.embedding.some((number) => !Number.isFinite(number))) {
        throw new Error('Embedding service completed the text job without a valid vector');
      }
      return { vector: job.embedding, modelName: job.model_name };
    }
    if (job.status === 'failed') throw new Error(job.error || 'Text embedding job failed');
    await delay(pollMs);
  }
  throw new Error(`Timed out waiting for text embedding job ${jobId} after ${timeoutMs} ms`);
}

export async function searchImages(query: string, limit = 10, librarySlug?: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('Search query must not be empty');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Search limit must be an integer from 1 to 100');

  const client = new EmbeddingServiceClient();
  const models = await client.models();
  if (!models.shared_vector_space) throw new Error('Configured image and text encoders do not share a vector space');
  const accepted = await client.submitText(normalizedQuery);
  const result = await waitForVector(client, accepted.id);
  if (result.modelName !== models.model) {
    throw new Error(`Text job used unexpected model pair "${result.modelName}" (expected "${models.model}")`);
  }
  const pairDigest = `image=${models.image_model}@${models.image_revision};text=${models.text_model}@${models.text_revision}`;
  const vectorLiteral = '[' + result.vector.join(',') + ']';
  const found = await pool.query(
    `SELECT a.id,a.library_id,l.slug AS library_slug,a.asset_type,a.title,a.description,
            a.keywords,a.creator,a.attribution,a.licence,a.local_path,a.s3_bucket,a.s3_key,
            e.model_name,e.model_digest,e.dimensions,
            1 - (e.embedding <=> $1::vector) AS similarity
       FROM asset_embeddings e
       JOIN assets a ON a.id=e.asset_id
       JOIN libraries l ON l.id=a.library_id
      WHERE e.modality='image' AND e.status='ready'
        AND e.model_name=$2 AND e.model_digest=$3
        AND e.dimensions=$4
        AND e.input_sha256=a.sha256
        AND ($5::text IS NULL OR l.slug=$5)
      ORDER BY e.embedding <=> $1::vector, a.id
      LIMIT $6`,
    [vectorLiteral, models.image_model, pairDigest, result.vector.length, librarySlug || null, limit],
  );
  return {
    query: normalizedQuery,
    model: {
      image: models.image_model,
      imageRevision: models.image_revision,
      text: models.text_model,
      textRevision: models.text_revision,
      sharedVectorSpace: true,
    },
    count: found.rowCount || 0,
    results: found.rows,
  };
}
