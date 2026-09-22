export type AliyunTextEmbeddingErrorCode =
  | "INVALID_ARGUMENT"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export type AliyunTextEmbeddingErrorOptions = {
  readonly retryable?: boolean;
  readonly status?: number | undefined;
  readonly requestId?: string | undefined;
  readonly providerCode?: string | undefined;
  readonly cause?: unknown;
};

export class AliyunTextEmbeddingError extends Error {
  readonly code: AliyunTextEmbeddingErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly providerCode: string | undefined;

  constructor(
    code: AliyunTextEmbeddingErrorCode,
    message: string,
    options: AliyunTextEmbeddingErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AliyunTextEmbeddingError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.requestId = options.requestId;
    this.providerCode = options.providerCode;
  }
}
