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

export type EmbeddingConfigurationInput =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly modelName: string;
      readonly endpointUrl: string;
      readonly apiKey: string;
      readonly dimensions?: number;
    };

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
    readonly modelName?: string;
    readonly endpointUrl?: string;
    readonly dimensions?: number;
  };
};
