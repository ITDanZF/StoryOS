import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  EmbeddingConfigurationInput,
} from "../../shared/contracts/settings/contracts.ts";
import DesktopController from "../desktop/DesktopController.ts";
import BusinessAccessGate from "./BusinessAccessGate.ts";
import ResourceScope from "./ResourceScope.ts";
import ApplicationDatabase from "../story/storage/global/ApplicationDatabase.ts";
import {
  createModelConnectionConfiguration,
  type ModelConnectionConfiguration,
} from "../agent/model/ModelConfiguration.ts";
import BookReaderApplication from "../story/application/books/BookReaderApplication.ts";
import type { ConversationApplicationEventHandler } from "../story/application/conversations/conversationContracts.ts";
import WorkSpace from "../story/workspace/index.ts";
import Configuration, { type InfoType } from "../story/config/index.ts";
import type BookTransferService from "../story/application/transfers/BookTransferService.ts";
import { withApplicationEnvironment } from "../agent/environment/AgentEnvironment.ts";
import type { ApplicationHostOptions } from "./ApplicationHostOptions.ts";
import ApplicationRuntimeFactory from "./ApplicationRuntimeFactory.ts";
import LiveEmbeddingConnection from "../agent/embedding/LiveEmbeddingConnection.ts";
import OpenAICompatibleEmbeddingGateway from "../agent/embedding/OpenAICompatibleEmbeddingGateway.ts";
export type {
  AgentConfigurationRequest,
  AgentServiceStatus,
} from "../../shared/contracts/settings/contracts.ts";

export default class StoryAgentService {
  private readonly configuration: Configuration;
  private readonly workspace: WorkSpace;
  private runtimeScope: ResourceScope | null = null;
  private readonly gate = new BusinessAccessGate();
  private readonly subscribers = new Set<ConversationApplicationEventHandler>();
  private readonly controllerUnsubscribers = new Map<
    ConversationApplicationEventHandler,
    () => void
  >();
  private controller: DesktopController | null = null;
  private applicationDatabase: ApplicationDatabase | null = null;
  private configured = false;
  private runtimeInitialization: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private activeConfiguration: InfoType | null = null;
  private developerPaused = false;
  private businessRequests = 0;
  private bookReader: BookReaderApplication | null = null;
  private transfers: BookTransferService | null = null;
  private embeddingConnection = new LiveEmbeddingConnection(null);

  private embeddingConfiguration(input: EmbeddingConfigurationInput) {
    return input.enabled
      ? {
          modelName: input.modelName,
          endpointUrl: input.endpointUrl,
          apiKey: input.apiKey,
          ...(input.dimensions !== undefined
            ? { dimensions: input.dimensions }
            : {}),
        }
      : null;
  }

  async testEmbedding(input: EmbeddingConfigurationInput): Promise<boolean> {
    const previous = this.configuration.loadConfig()?.embedding;
    const resolved =
      input.enabled &&
      !input.apiKey.trim() &&
      previous?.enabled &&
      previous.endpointUrl === input.endpointUrl
        ? { ...input, apiKey: previous.apiKey }
        : input;
    const configuration = this.embeddingConfiguration(resolved);
    if (!configuration) throw new Error("请先启用 Text Embedding。");
    await new OpenAICompatibleEmbeddingGateway(configuration).embedQuery(
      "StoryOS connection test",
    );
    return true;
  }

  requireBookReader(): BookReaderApplication {
    if (!this.bookReader)
      throw new Error("阅读服务尚未初始化，请重新打开应用。");
    return this.bookReader;
  }

  closeBookReaders(owner: number): void {
    this.bookReader?.closeOwner(owner);
    this.transfers?.closeOwner(owner);
  }

  canClose(): boolean {
    return !(
      this.businessRequests ||
      this.runtimeInitialization ||
      this.shutdownPromise ||
      this.controller?.hasActiveRun() ||
      this.transfers?.hasActiveTransfer ||
      this.developerPaused
    );
  }

  async runBusinessRequest<T>(run: () => T | Promise<T>): Promise<T> {
    if (this.developerPaused)
      throw new Error("数据库编辑会话期间，业务访问已暂停。");
    this.businessRequests += 1;
    try {
      return await withApplicationEnvironment(
        {
          ...this.options,
          defaultProjectsRoot:
            this.activeConfiguration?.workspace.defaultProjectsRoot,
        },
        () => this.gate.run(run),
      );
    } finally {
      this.businessRequests -= 1;
    }
  }

  async pauseForDeveloper(): Promise<void> {
    if (this.developerPaused && !this.controller && !this.applicationDatabase)
      return;
    if (
      this.businessRequests ||
      this.runtimeInitialization ||
      this.shutdownPromise ||
      this.controller?.hasActiveRun() ||
      this.transfers?.hasActiveTransfer
    ) {
      throw new Error("仍有任务或数据操作进行中，请等待完成后再开启编辑会话。");
    }
    this.gate.stop();
    this.developerPaused = true;
    this.bookReader?.dispose();
    this.bookReader = null;
    const controller = this.controller;
    for (const unsubscribe of this.controllerUnsubscribers.values())
      unsubscribe();
    this.controllerUnsubscribers.clear();
    try {
      if (this.runtimeScope) await this.runtimeScope.close();
      else await controller?.closeForDeveloper();
      this.runtimeScope = null;
      this.controller = null;
      this.applicationDatabase?.close();
      this.applicationDatabase = null;
    } catch (error) {
      // Keep the gate closed if resource shutdown failed; never allow concurrent writes.
      throw new Error(`无法关闭业务数据库：${String(error)}`);
    }
  }

  async resumeFromDeveloper(): Promise<void> {
    if (!this.developerPaused) return;
    if (this.activeConfiguration)
      await this.initializeRuntime(
        createModelConnectionConfiguration(this.activeConfiguration.chat),
      );
    this.developerPaused = false;
    this.gate.resume();
  }

  constructor(private readonly options: ApplicationHostOptions) {
    this.configuration = new Configuration(options.agentHome);
    this.workspace = new WorkSpace(options.agentHome);
  }

  async initialize(): Promise<AgentServiceStatus> {
    await this.workspace.createHomeRoot();
    const config = this.configuration.loadConfig();
    this.configured = config !== null;
    if (config && !this.controller) {
      await this.initializeRuntime(
        createModelConnectionConfiguration(config.chat),
      );
      this.activeConfiguration = config;
      this.embeddingConnection = new LiveEmbeddingConnection(
        this.embeddingConfiguration(config.embedding),
      );
    }
    return this.getStatus();
  }

  async configure(
    request: AgentConfigurationRequest,
  ): Promise<AgentServiceStatus> {
    if (this.shutdownPromise || this.runtimeInitialization) {
      throw new Error("模型服务正在启动或关闭，请稍后重试。");
    }

    if (
      !request ||
      !["deepseek", "openai", "qwen"].includes(request.provider)
    ) {
      throw new Error("请选择支持的模型服务商。");
    }
    const modelName = this.requireValue(request.modelName, "模型名称");
    const baseUrl = this.requireValue(request.baseUrl, "接口地址");
    const previous = this.configuration.loadConfig();
    const canReuseKey =
      previous?.chat.provider === request.provider &&
      previous.chat.baseUrl === baseUrl;
    const apiKey = this.requireValue(
      (typeof request.apiKey === "string" ? request.apiKey.trim() : "") ||
        (canReuseKey ? previous?.chat.apiKey : "") ||
        "",
      "API Key",
    );
    if (
      request.workspacePath !== undefined &&
      typeof request.workspacePath !== "string"
    ) {
      throw new Error("工作区路径必须为文本。");
    }
    const workspacePath =
      request.workspacePath?.trim() ??
      previous?.workspace.defaultProjectsRoot ??
      "";
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new Error("请输入有效的完整接口地址。");
    }
    if (
      parsedBaseUrl.protocol !== "https:" &&
      parsedBaseUrl.protocol !== "http:"
    ) {
      throw new Error("接口地址必须使用 HTTP 或 HTTPS。");
    }

    const embeddingInput = request.embedding;
    if (!embeddingInput || typeof embeddingInput.enabled !== "boolean") {
      throw new Error("请选择 Text Embedding 配置状态。");
    }
    const embedding =
      embeddingInput.enabled &&
      !embeddingInput.apiKey.trim() &&
      previous?.embedding.enabled &&
      previous.embedding.endpointUrl === embeddingInput.endpointUrl
        ? { ...embeddingInput, apiKey: previous.embedding.apiKey }
        : embeddingInput;
    const config: InfoType = {
      schemaVersion: 2,
      chat: { provider: request.provider, modelName, baseUrl, apiKey },
      embedding,
      workspace: { defaultProjectsRoot: workspacePath },
      logLevel: previous?.logLevel ?? "info",
    };
    const modelConfiguration = createModelConnectionConfiguration(config.chat);
    const applyModelConfiguration =
      this.controller?.prepareModelConfiguration(modelConfiguration);
    const applyEmbeddingConfiguration = this.embeddingConnection.prepareUpdate(
      this.embeddingConfiguration(config.embedding),
    );
    this.configuration.saveConfig(config);
    this.configured = true;
    if (!applyModelConfiguration) {
      await this.initializeRuntime(modelConfiguration);
      this.activeConfiguration = config;
      applyEmbeddingConfiguration();
    } else {
      applyModelConfiguration();
      applyEmbeddingConfiguration();
      this.activeConfiguration = {
        ...config,
        workspace: this.activeConfiguration?.workspace ?? config.workspace,
      };
    }
    return this.getStatus();
  }

  getStatus(): AgentServiceStatus {
    const config = this.configuration.loadConfig();
    return Object.freeze({
      restartRequired: Boolean(
        this.controller &&
        this.activeConfiguration &&
        config &&
        config.workspace.defaultProjectsRoot !==
          this.activeConfiguration.workspace.defaultProjectsRoot,
      ),
      configured: this.configured,
      initialized: this.controller !== null,
      ...(config?.chat.provider ? { provider: config.chat.provider } : {}),
      ...(config?.chat.modelName ? { modelName: config.chat.modelName } : {}),
      ...(config?.chat.baseUrl ? { baseUrl: config.chat.baseUrl } : {}),
      ...(config?.workspace.defaultProjectsRoot
        ? { workspacePath: config.workspace.defaultProjectsRoot }
        : {}),
      embedding: config?.embedding.enabled
        ? {
            enabled: true,
            configured: true,
            modelName: config.embedding.modelName,
            endpointUrl: config.embedding.endpointUrl,
            ...(config.embedding.dimensions !== undefined
              ? { dimensions: config.embedding.dimensions }
              : {}),
          }
        : { enabled: false, configured: false },
    });
  }

  requireController(): DesktopController {
    if (this.developerPaused)
      throw new Error("数据库编辑会话期间，业务访问已暂停。");
    if (!this.controller) throw new Error("Agent is not configured.");
    return this.controller;
  }

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    if (this.controller) {
      this.controllerUnsubscribers.set(
        handler,
        this.controller.subscribe(handler),
      );
    }
    return () => {
      this.subscribers.delete(handler);
      this.controllerUnsubscribers.get(handler)?.();
      this.controllerUnsubscribers.delete(handler);
    };
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.gate.stop();
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    await this.gate.waitForIdle();
    if (this.runtimeInitialization) {
      await Promise.allSettled([this.runtimeInitialization]);
    }
    this.bookReader?.dispose();
    this.bookReader = null;
    const controller = this.controller;
    this.controller = null;
    for (const unsubscribe of this.controllerUnsubscribers.values()) {
      try {
        unsubscribe();
      } catch {
        // One faulty listener must not block runtime shutdown.
      }
    }
    this.controllerUnsubscribers.clear();
    try {
      if (this.runtimeScope) await this.runtimeScope.close();
      else await controller?.shutdown();
      this.runtimeScope = null;
    } finally {
      try {
        this.applicationDatabase?.close();
        this.applicationDatabase = null;
      } finally {
        this.subscribers.clear();
      }
    }
  }

  private initializeRuntime(
    modelConfiguration: ModelConnectionConfiguration,
  ): Promise<void> {
    if (this.shutdownPromise) {
      return Promise.reject(new Error("Agent service is shutting down."));
    }
    if (this.runtimeInitialization) {
      return this.runtimeInitialization;
    }
    const initialization = withApplicationEnvironment(
      {
        ...this.options,
        defaultProjectsRoot:
          this.activeConfiguration?.workspace.defaultProjectsRoot ??
          this.configuration.loadConfig()?.workspace.defaultProjectsRoot,
      },
      () => this.performInitializeRuntime(modelConfiguration),
    );
    const tracked = initialization.finally(() => {
      if (this.runtimeInitialization === tracked) {
        this.runtimeInitialization = null;
      }
    });
    this.runtimeInitialization = tracked;
    return tracked;
  }

  private async performInitializeRuntime(
    modelConfiguration: ModelConnectionConfiguration,
  ): Promise<void> {
    await this.workspace.createAgentWorkSpace();
    const created = await new ApplicationRuntimeFactory(this.options).create(
      modelConfiguration,
    );
    this.applicationDatabase = created.applicationDatabase;
    this.runtimeScope = created.scope;
    this.controller = created.controller;
    this.bookReader = created.bookReader;
    this.transfers = created.bookTransfer;
    try {
      for (const subscriber of this.subscribers)
        this.controllerUnsubscribers.set(
          subscriber,
          created.controller.subscribe(subscriber),
        );
    } catch (error) {
      await created.scope.close();
      this.controller = null;
      this.applicationDatabase = null;
      this.bookReader = null;
      throw error;
    }
  }

  private requireValue(value: string, label: string): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) throw new Error(`请填写${label}。`);
    return normalized;
  }
}
