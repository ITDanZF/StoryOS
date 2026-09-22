export type AgentConfigurationRequest = {
  readonly provider: "deepseek" | "openai" | "qwen";
  readonly modelName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly workspacePath?: string;
  readonly embedding: EmbeddingConfigurationInput;
};

export type ChatModelConfigurationInput = {
  readonly provider: "deepseek" | "openai" | "qwen";
  readonly modelName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
};

export const ALIYUN_TEXT_EMBEDDING_MODEL = "text-embedding-v4" as const;

export const ALIYUN_EMBEDDING_DIMENSIONS = [
  64, 128, 256, 512, 768, 1024, 1536, 2048,
] as const;

export type AliyunEmbeddingDimensions = (typeof ALIYUN_EMBEDDING_DIMENSIONS)[number];

export const DEFAULT_ALIYUN_EMBEDDING_DIMENSIONS: AliyunEmbeddingDimensions = 1024;

export type AliyunEmbeddingConfigurationInput = {
  readonly enabled: true;
  readonly modelName: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly dimensions: AliyunEmbeddingDimensions;
};

export type EmbeddingConfigurationInput = AliyunEmbeddingConfigurationInput;

export type AgentConfigurationInput = {
  readonly schemaVersion: 2;
  readonly chat: ChatModelConfigurationInput;
  readonly embedding: EmbeddingConfigurationInput;
  readonly workspace: { readonly defaultProjectsRoot: string };
  readonly logLevel: string;
};

export type AgentServiceStatus = {
  /** Only workspace path changes require a restart; model changes apply to new tasks immediately. */
  readonly restartRequired?: boolean;
  readonly configured: boolean;
  readonly initialized: boolean;
  readonly provider?: string;
  readonly modelName?: string;
  readonly baseUrl?: string;
  readonly workspacePath?: string;
  readonly embedding: {
    readonly enabled: boolean;
    readonly configured: boolean;
    readonly modelName?: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
    readonly baseUrl?: string;
    readonly dimensions?: AliyunEmbeddingDimensions;
  };
};
