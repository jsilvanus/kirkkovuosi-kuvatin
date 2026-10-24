import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pool } from './db.js';
import { EmbeddingServiceClient } from './embedding-service-client.js';

const ollamaBase = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function modelDigest(model: string): Promise<string> {
  try {
    const response = await fetch(`${ollamaBase}/api/tags`);
    if (!response.ok) return '';
    const data = await response.json() as { models?: Array<{ name: string; digest: string }> };
    return data.models?.find((item) => item.name === model)?.digest || '';
  } catch {
    return '';
  }
}

async function embedTextWithOllama(model: string, input: string): Promise<number[]> {
  const response = await fetch(`${ollamaBase}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { embeddings?: number[][] };
  const vector = data.embeddings?.[0];
  if (!vector?.length || vector.some((number) => !Number.isFinite(number))) {
    throw new Error('Ollama returned an invalid embedding');
  }
  return vector;
}

async function waitForEmbedding(client: EmbeddingServiceClient, jobId: string) {
  const timeoutMs = Number(process.env.EMBEDDING_JOB_TIMEOUT_MS || 300_000);
  const pollMs = Number(process.env.EMBEDDING_JOB_POLL_MS || 750);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await client.getJob(jobId);
    if (job.status === 'complete') {
      if (!job.embedding?.length || job.embedding.some((number) => !Number.isFinite(number))) {
        throw new Error('Embedding service completed the job without a valid vector');
      }
      return { job, vector: job.embedding };
    }
    if (job.status === 'failed') throw new Error(job.error || 'Embedding service job failed');
    await delay(pollMs);
  }
  throw new Error(`Timed out waiting for embedding job ${jobId} after ${timeoutMs} ms`);
}

async function storeEmbedding(input: {
  assetId: string;
  modelName: string;
  modelDigest: string;
  modality: 'image' | 'text';
  inputSha256: string;
  vector: number[];
}) {
  const { assetId, modelName, modelDigest, modality, inputSha256, vector } = input;
  await pool.query(
    `INSERT INTO asset_embeddings
       (asset_id, model_name, model_digest, modality, dimensions, input_sha256, status, embedding, error)
     VALUES ($1,$2,$3,$4,$5,$6,'ready',$7::vector,NULL)
     ON CONFLICT (asset_id,model_name,model_digest,modality,input_sha256)
     DO UPDATE SET dimensions=EXCLUDED.dimensions,status='ready',embedding=EXCLUDED.embedding,error=NULL,updated_at=now()`,
    [assetId, modelName, modelDigest, modality, vector.length, inputSha256, '[' + vector.join(',') + ']'],
  );
}

async function recordFailure(input: {
  assetId: string;
  modelName: string;
  modelDigest: string;
  modality: 'image' | 'text';
  inputSha256: string;
  error: string;
}) {
  await pool.query(
    `INSERT INTO asset_embeddings
       (asset_id,model_name,model_digest,modality,dimensions,input_sha256,status,embedding,error)
     VALUES ($1,$2,$3,$4,1,$5,'failed',NULL,$6)
     ON CONFLICT (asset_id,model_name,model_digest,modality,input_sha256)
     DO UPDATE SET status='failed',embedding=NULL,error=EXCLUDED.error,updated_at=now()
     WHERE asset_embeddings.status <> 'ready'`,
    [input.assetId, input.modelName, input.modelDigest, input.modality, input.inputSha256, input.error.slice(0, 2000)],
  );
}

export async function embedAssets(
  models = (process.env.EMBEDDING_MODELS || 'nomic-embed-text').split(',').map((value) => value.trim()).filter(Boolean),
  options: { imageEmbeddings?: boolean } = {},
) {
  const assets = await pool.query(
    `SELECT id,title,description,keywords,creator,sha256,local_path,file_status
       FROM assets
      WHERE file_status IN ('verified','uploaded','metadata-only')
      ORDER BY library_id,id`,
  );
  const report: Array<Record<string, unknown>> = [];
  const imageEnabled = options.imageEmbeddings ?? (process.env.IMAGE_EMBEDDINGS !== 'false');
  const client = imageEnabled ? new EmbeddingServiceClient() : undefined;
  let modelPair: { image_model: string; text_model: string; shared_vector_space: boolean } | undefined;
  let modelPairError: string | undefined;
  if (client) {
    try {
      const response = await client.models();
      if (!response.shared_vector_space) throw new Error('Configured embedding models do not share a vector space');
      modelPair = response as typeof modelPair;
    } catch (error) {
      modelPairError = String(error);
    }
  }

  for (const asset of assets.rows) {
    const textInput = [asset.title, asset.description, (asset.keywords || []).join(', '), asset.creator || '']
      .filter(Boolean).join('\n');
    const textInputHash = hash(textInput);
    for (const model of models) {
      const digest = await modelDigest(model);
      try {
        const existing = await pool.query(
          `SELECT 1 FROM asset_embeddings
            WHERE asset_id=$1 AND model_name=$2 AND model_digest=$3 AND modality='text'
              AND input_sha256=$4 AND status='ready'`,
          [asset.id, model, digest, textInputHash],
        );
        if (existing.rowCount) {
          report.push({ assetId: asset.id, model, modality: 'text', status: 'unchanged' });
          continue;
        }
        const vector = await embedTextWithOllama(model, textInput);
        await storeEmbedding({
          assetId: asset.id, modelName: model, modelDigest: digest, modality: 'text',
          inputSha256: textInputHash, vector,
        });
        report.push({ assetId: asset.id, model, modality: 'text', status: 'embedded', dimensions: vector.length });
      } catch (error) {
        report.push({ assetId: asset.id, model, modality: 'text', status: 'failed', error: String(error) });
      }
    }

    if (!imageEnabled || !client || !modelPair) {
      if (imageEnabled && modelPairError) {
        report.push({ assetId: asset.id, modality: 'image', status: 'failed', error: modelPairError });
      }
      continue;
    }
    if (!asset.local_path || !asset.sha256 || !['verified', 'uploaded'].includes(asset.file_status)) {
      report.push({ assetId: asset.id, modality: 'image', status: 'skipped', reason: 'No verified local image file' });
      continue;
    }

    const modelName = modelPair.image_model;
    const pairDigest = `image=${modelPair.image_model};text=${modelPair.text_model}`;
    try {
      const bytes = await readFile(asset.local_path);
      const imageHash = hash(bytes);
      if (imageHash !== asset.sha256) throw new Error('Local file SHA-256 does not match the verified asset checksum');
      const existing = await pool.query(
        `SELECT 1 FROM asset_embeddings
          WHERE asset_id=$1 AND model_name=$2 AND model_digest=$3 AND modality='image'
            AND input_sha256=$4 AND status='ready'`,
        [asset.id, modelName, pairDigest, imageHash],
      );
      if (existing.rowCount) {
        report.push({ assetId: asset.id, model: modelName, modality: 'image', status: 'unchanged' });
        continue;
      }
      const accepted = await client.submitImage(bytes.toString('base64'), asset.local_path.split(/[\\/]/).pop());
      const { vector } = await waitForEmbedding(client, accepted.id);
      await storeEmbedding({
        assetId: asset.id, modelName, modelDigest: pairDigest, modality: 'image',
        inputSha256: imageHash, vector,
      });
      report.push({ assetId: asset.id, model: modelName, modality: 'image', status: 'embedded', dimensions: vector.length });
    } catch (error) {
      const message = String(error);
      try {
        await recordFailure({
          assetId: asset.id, modelName, modelDigest: pairDigest, modality: 'image',
          inputSha256: asset.sha256, error: message,
        });
      } catch (recordError) {
        report.push({ assetId: asset.id, modality: 'image', status: 'failure-record-error', error: String(recordError) });
      }
      report.push({ assetId: asset.id, model: modelName, modality: 'image', status: 'failed', error: message });
    }
  }
  return report;
}
