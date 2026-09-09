export type AgentConfigurationRequest = {
  readonly provider: "deepseek" | "openai" | "qwen";
  readonly modelName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly workspacePath?: string;
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
};
