import { AliyunTextEmbeddingError } from "./errors.ts";
import {
  ALIYUN_EMBEDDING_DIMENSIONS,
  ALIYUN_TEXT_EMBEDDING_MODEL,
  DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS,
  type AliyunEmbeddingDimensions,
  type AliyunEmbeddingItem,
  type AliyunEmbeddingResponse,
  type AliyunEmbeddingUsage,
  type AliyunTextEmbeddingClient,
  type AliyunTextEmbeddingOptions,
} from "./types.ts";

const MAX_BATCH_SIZE = 10;
const VALID_DIMENSIONS = new Set<number>(ALIYUN_EMBEDDING_DIMENSIONS);

type ResolvedOptions = {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly dimensions: AliyunEmbeddingDimensions;
  readonly batchSize: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly fetch: typeof globalThis.fetch;
};

type ProviderEmbedding = {
  readonly index: number;
  readonly embedding: number[];
};

type BatchResult = {
  readonly data: readonly ProviderEmbedding[];
  readonly model: string;
  readonly usage?: AliyunEmbeddingUsage;
  readonly requestId?: string;
};

class AliyunTextEmbeddingClientImpl implements AliyunTextEmbeddingClient {
  readonly model = ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly dimensions: AliyunEmbeddingDimensions;
  private readonly options: ResolvedOptions;

  constructor(options: AliyunTextEmbeddingOptions) {
    this.options = resolveOptions(options);
    this.dimensions = this.options.dimensions;
  }

  async embed(text: string): Promise<readonly number[]> {
    validateText(text, 0);
    const response = await this.embedBatch([text]);
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new AliyunTextEmbeddingError(
        "INVALID_RESPONSE",
        "The provider returned no embedding for the input",
      );
    }
    return embedding;
  }

  async embedBatch(texts: readonly string[]): Promise<AliyunEmbeddingResponse> {
    if (texts.length === 0) {
      throw new AliyunTextEmbeddingError(
        "INVALID_ARGUMENT",
        "At least one input text is required",
      );
    }
    texts.forEach(validateText);

    const data: AliyunEmbeddingItem[] = [];
    const requestIds: string[] = [];
    let promptTokens = 0;
    let totalTokens = 0;
    let hasPromptTokens = false;
    let hasTotalTokens = false;
    let responseModel: string = this.model;

    for (let offset = 0; offset < texts.length; offset += this.options.batchSize) {
      const batch = texts.slice(offset, offset + this.options.batchSize);
      const result = await this.requestBatch(batch);
      responseModel = result.model;
      if (result.requestId) requestIds.push(result.requestId);
      if (result.usage?.promptTokens !== undefined) {
        promptTokens += result.usage.promptTokens;
        hasPromptTokens = true;
      }
      if (result.usage?.totalTokens !== undefined) {
        totalTokens += result.usage.totalTokens;
        hasTotalTokens = true;
      }
      data.push(
        ...result.data.map((item) => ({
          index: offset + item.index,
          embedding: item.embedding,
        })),
      );
    }

    const usage = buildUsage(promptTokens, totalTokens, hasPromptTokens, hasTotalTokens);
    return {
      data,
      model: responseModel,
      dimensions: this.dimensions,
      ...(usage === undefined ? {} : { usage }),
      requestIds,
    };
  }

  private async requestBatch(texts: readonly string[]): Promise<BatchResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(texts);
        if (!response.ok) {
          const error = await mapHttpError(response);
          if (error.retryable && attempt < this.options.maxRetries) {
            await wait(retryDelay(response, attempt));
            continue;
          }
          throw error;
        }
        return await parseResponse(response, texts.length, this.dimensions);
      } catch (error) {
        const mapped = mapRequestError(error);
        if (mapped.retryable && attempt < this.options.maxRetries) {
          await wait(exponentialDelay(attempt));
          continue;
        }
        throw mapped;
      }
    }
  }

  private async fetchWithTimeout(texts: readonly string[]): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.options.fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
          encoding_format: "float",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAliyunTextEmbeddingClient(
  options: AliyunTextEmbeddingOptions,
): AliyunTextEmbeddingClient {
  return new AliyunTextEmbeddingClientImpl(options);
}

function resolveOptions(options: AliyunTextEmbeddingOptions): ResolvedOptions {
  if (!options.apiKey.trim()) {
    throw new AliyunTextEmbeddingError("INVALID_ARGUMENT", "apiKey is required");
  }
  if (options.model !== undefined && options.model !== ALIYUN_TEXT_EMBEDDING_MODEL) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      `Only '${ALIYUN_TEXT_EMBEDDING_MODEL}' is supported`,
    );
  }
  const dimensions = options.dimensions ?? DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS;
  if (!VALID_DIMENSIONS.has(dimensions)) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      `Unsupported embedding dimensions: ${dimensions}`,
    );
  }
  const batchSize = options.batchSize ?? MAX_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      `batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`,
    );
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      "timeoutMs must be a positive integer",
    );
  }
  const maxRetries = options.maxRetries ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      "maxRetries must be an integer between 0 and 10",
    );
  }

  return {
    apiKey: options.apiKey,
    endpoint: resolveEndpoint(options.baseUrl),
    dimensions,
    batchSize,
    timeoutMs,
    maxRetries,
    fetch: options.fetch ?? globalThis.fetch,
  };
}

function resolveEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      "baseUrl must be an absolute http(s) URL",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      "baseUrl must use HTTP or HTTPS",
    );
  }
  return `${trimmed.replace(/\/+$/, "")}/embeddings`;
}

function validateText(text: string, index: number): void {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new AliyunTextEmbeddingError(
      "INVALID_ARGUMENT",
      `Input text at index ${index} must not be empty`,
    );
  }
}

async function parseResponse(
  response: Response,
  expectedCount: number,
  dimensions: number,
): Promise<BatchResult> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw invalidResponse(response, "The provider returned invalid JSON", error);
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw invalidResponse(response, "The provider response has no data array");
  }

  const items = payload.data.map((value, position) =>
    parseEmbedding(value, position, dimensions, response),
  );
  if (items.length !== expectedCount) {
    throw invalidResponse(
      response,
      `Expected ${expectedCount} embeddings but received ${items.length}`,
    );
  }
  items.sort((left, right) => left.index - right.index);
  items.forEach((item, position) => {
    if (item.index !== position) {
      throw invalidResponse(response, "The provider returned invalid indexes");
    }
  });

  const usage = parseUsage(payload.usage);
  const requestId =
    response.headers.get("x-request-id") ??
    (typeof payload.id === "string" ? payload.id : undefined);
  return {
    data: items,
    model: typeof payload.model === "string" ? payload.model : ALIYUN_TEXT_EMBEDDING_MODEL,
    ...(usage === undefined ? {} : { usage }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function parseEmbedding(
  value: unknown,
  position: number,
  dimensions: number,
  response: Response,
): ProviderEmbedding {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.index) ||
    !Array.isArray(value.embedding) ||
    value.embedding.length !== dimensions ||
    !value.embedding.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    throw invalidResponse(response, `Invalid embedding data at response position ${position}`);
  }
  return {
    index: value.index as number,
    embedding: value.embedding as number[],
  };
}

function parseUsage(value: unknown): AliyunEmbeddingUsage | undefined {
  if (!isRecord(value)) return undefined;
  const promptTokens = numberOrUndefined(value.prompt_tokens);
  const totalTokens = numberOrUndefined(value.total_tokens);
  return buildUsage(
    promptTokens ?? 0,
    totalTokens ?? 0,
    promptTokens !== undefined,
    totalTokens !== undefined,
  );
}

function buildUsage(
  promptTokens: number,
  totalTokens: number,
  hasPromptTokens: boolean,
  hasTotalTokens: boolean,
): AliyunEmbeddingUsage | undefined {
  if (!hasPromptTokens && !hasTotalTokens) return undefined;
  return {
    ...(hasPromptTokens ? { promptTokens } : {}),
    ...(hasTotalTokens ? { totalTokens } : {}),
  };
}

async function mapHttpError(response: Response): Promise<AliyunTextEmbeddingError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let providerCode: string | undefined;
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      providerCode = typeof payload.code === "string" ? payload.code : undefined;
      if (providerCode === undefined && isRecord(payload.error)) {
        providerCode =
          typeof payload.error.code === "string" ? payload.error.code : undefined;
      }
    }
  } catch {
    // Error bodies stay internal so keys and input text are not copied into the thrown error.
  }

  const common = { status: response.status, requestId, providerCode };
  if (response.status === 401 || response.status === 403) {
    return new AliyunTextEmbeddingError("AUTHENTICATION_FAILED", "Aliyun authentication failed", common);
  }
  if (response.status === 429) {
    return new AliyunTextEmbeddingError("RATE_LIMITED", "Aliyun rate limit exceeded", {
      ...common,
      retryable: true,
    });
  }
  const retryable = response.status === 408 || response.status >= 500;
  return new AliyunTextEmbeddingError(
    "PROVIDER_ERROR",
    `Aliyun embedding request failed with status ${response.status}`,
    { ...common, retryable },
  );
}

function mapRequestError(error: unknown): AliyunTextEmbeddingError {
  if (error instanceof AliyunTextEmbeddingError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new AliyunTextEmbeddingError("TIMEOUT", "Aliyun embedding request timed out", {
      retryable: true,
      cause: error,
    });
  }
  return new AliyunTextEmbeddingError("NETWORK_ERROR", "Aliyun embedding request failed", {
    retryable: true,
    cause: error,
  });
}

function invalidResponse(
  response: Response,
  message: string,
  cause?: unknown,
): AliyunTextEmbeddingError {
  return new AliyunTextEmbeddingError("INVALID_RESPONSE", message, {
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
    cause,
  });
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return exponentialDelay(attempt);
}

function exponentialDelay(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 4_000) * (0.75 + Math.random() * 0.5);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
