import {
  ALIYUN_TEXT_EMBEDDING_MODEL,
  type AgentConfigurationInput,
  type AliyunEmbeddingDimensions,
} from "../settings/contracts.ts";

export type InstanceStatus = "ready" | "needs-setup" | "missing" | "invalid";

export type StoryInstanceDto = {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly status: InstanceStatus;
  readonly lastOpenedAt: string | null;
};

export type InstanceSnapshot = {
  readonly activeInstanceId: string | null;
  readonly lastActiveInstanceId: string | null;
  readonly firstSelectionCompleted: boolean;
  readonly suggestedRootPath: string;
  readonly startupError?: string;
  readonly instances: readonly StoryInstanceDto[];
};

export type CreateInstanceRequest = {
  readonly name: string;
  readonly rootPath: string;
  readonly configuration: AgentConfigurationInput;
};

export type InstanceConfigurationDto = {
  readonly schemaVersion: 2;
  readonly chat: {
    readonly provider: AgentConfigurationInput["chat"]["provider"];
    readonly modelName: string;
    readonly baseUrl: string;
    readonly apiKeyConfigured: boolean;
  };
  readonly embedding:
    | { readonly enabled: false }
    | {
        readonly enabled: true;
        readonly modelName: typeof ALIYUN_TEXT_EMBEDDING_MODEL;
        readonly baseUrl: string;
        readonly dimensions: AliyunEmbeddingDimensions;
        readonly apiKeyConfigured: boolean;
      };
  readonly workspace: { readonly defaultProjectsRoot: string };
  readonly logLevel: string;
};

export type InstanceOpenResult = {
  readonly instance: StoryInstanceDto;
  readonly snapshot: InstanceSnapshot;
};

export type InstanceDesktopApi = {
  getSnapshot(): Promise<InstanceSnapshot>;
  create(request: CreateInstanceRequest): Promise<InstanceOpenResult>;
  getConfiguration(instanceId: string): Promise<InstanceConfigurationDto>;
  updateConfiguration(
    instanceId: string,
    configuration: AgentConfigurationInput,
  ): Promise<InstanceSnapshot>;
  open(instanceId: string): Promise<InstanceOpenResult>;
  rename(instanceId: string, name: string): Promise<InstanceSnapshot>;
  relocate(instanceId: string, rootPath: string): Promise<InstanceSnapshot>;
  remove(instanceId: string): Promise<InstanceSnapshot>;
  reveal(instanceId: string): Promise<void>;
  returnToPanel(): Promise<InstanceSnapshot>;
};
