import type { paths } from './generated/embedding-service.js';

type HealthResponse = paths['/health']['get']['responses'][200]['content']['application/json'];
type ModelsResponse = paths['/v1/models']['get']['responses'][200]['content']['application/json'];
type TextRequest = paths['/v1/jobs/text']['post']['requestBody']['content']['application/json'];
type ImageRequest = paths['/v1/jobs/image']['post']['requestBody']['content']['application/json'];
type JobAccepted = paths['/v1/jobs/text']['post']['responses'][202]['content']['application/json'];
type JobResponse = paths['/v1/jobs/{job_id}']['get']['responses'][200]['content']['application/json'];

export class EmbeddingServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'EmbeddingServiceError';
  }
}

export class EmbeddingServiceClient {
  constructor(
    private readonly baseUrl = process.env.EMBEDDING_SERVICE_URL ?? 'http://127.0.0.1:8091',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  health(): Promise<HealthResponse> {
    return this.request('/health');
  }

  models(): Promise<ModelsResponse> {
    return this.request('/v1/models');
  }

  submitText(text: string): Promise<JobAccepted> {
    const body: TextRequest = { text };
    return this.request('/v1/jobs/text', { method: 'POST', body: JSON.stringify(body) });
  }

  submitImage(imageBase64: string, filename?: string): Promise<JobAccepted> {
    const body: ImageRequest = { image_base64: imageBase64, filename };
    return this.request('/v1/jobs/image', { method: 'POST', body: JSON.stringify(body) });
  }

  getJob(jobId: string): Promise<JobResponse> {
    return this.request('/v1/jobs/' + encodeURIComponent(jobId));
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
    const response = await this.fetchImpl(new URL(path, baseUrl), {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new EmbeddingServiceError(detail || ('Embedding service returned HTTP ' + response.status), response.status);
    }
    return (await response.json()) as T;
  }
}
