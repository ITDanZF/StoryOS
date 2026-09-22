export const ALIYUN_TEXT_EMBEDDING_MODEL = "text-embedding-v4" as const;

export const ALIYUN_EMBEDDING_DIMENSIONS = [
  64, 128, 256, 512, 768, 1024, 1536, 2048,
] as const;

export type AliyunEmbeddingDimensions = (typeof ALIYUN_EMBEDDING_DIMENSIONS)[number];

export const DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS: AliyunEmbeddingDimensions = 1024;

export type AliyunTextEmbeddingOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model?: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly dimensions?: AliyunEmbeddingDimensions;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetch?: typeof globalThis.fetch;
};

export type AliyunEmbeddingItem = {
  readonly index: number;
  readonly embedding: readonly number[];
};

export type AliyunEmbeddingUsage = {
  readonly promptTokens?: number;
  readonly totalTokens?: number;
};

export type AliyunEmbeddingResponse = {
  readonly data: readonly AliyunEmbeddingItem[];
  readonly model: string;
  readonly dimensions: AliyunEmbeddingDimensions;
  readonly usage?: AliyunEmbeddingUsage;
  readonly requestIds: readonly string[];
};

export type AliyunTextEmbeddingClient = {
  readonly model: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly dimensions: AliyunEmbeddingDimensions;
  embed(text: string): Promise<readonly number[]>;
  embedBatch(texts: readonly string[]): Promise<AliyunEmbeddingResponse>;
};
