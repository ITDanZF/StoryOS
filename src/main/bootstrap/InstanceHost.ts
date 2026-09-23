import type {
  CreateInstanceRequest,
  InstanceOpenResult,
  InstanceSnapshot,
} from "../../shared/contracts/instances/contracts.ts";
import type { AgentConfigurationInput } from "../../shared/contracts/settings/contracts.ts";
import type { ConversationApplicationEventHandler } from "../story/application/conversations/conversationContracts.ts";
import InstanceApplication from "../story/instances/InstanceApplication.ts";
import InstanceRegistry from "../story/instances/InstanceRegistry.ts";
import { InstanceError } from "../story/instances/instanceErrors.ts";
import type { ApplicationHostOptions } from "./ApplicationHostOptions.ts";
import { existsSync } from "node:fs";
import StoryAgentService from "./StoryAgentService.ts";

type InstanceService = Pick<
  StoryAgentService,
  | "initialize"
  | "canClose"
  | "shutdown"
  | "runBusinessRequest"
  | "closeBookReaders"
  | "subscribe"
  | "getStatus"
  | "configure"
  | "requireController"
  | "requireBookReader"
  | "pauseForDeveloper"
  | "resumeFromDeveloper"
>;

export default class InstanceHost {
  private activeService: InstanceService | null = null;
  private activeInstanceId: string | null = null;
  private startupError: string | null = null;
  private transitioning = false;
  private readonly listeners = new Set<ConversationApplicationEventHandler>();
  private readonly unsubscribers = new Map<
    ConversationApplicationEventHandler,
    () => void
  >();

  constructor(
    readonly registry: InstanceRegistry,
    readonly instances: InstanceApplication,
    private readonly options: Omit<ApplicationHostOptions, "agentHome">,
    private readonly createService: (
      options: ApplicationHostOptions,
    ) => InstanceService = (serviceOptions) =>
      new StoryAgentService(serviceOptions),
  ) {}

  getSnapshot(): InstanceSnapshot {
    return {
      ...this.instances.getSnapshot(this.activeInstanceId),
      ...(this.startupError ? { startupError: this.startupError } : {}),
    };
  }

  requireService(): InstanceService {
    if (this.transitioning) {
      throw new InstanceError(
        "INSTANCE_SWITCH_IN_PROGRESS",
        "正在切换实例，请稍后重试。",
      );
    }
    if (!this.activeService)
      throw new InstanceError("INSTANCE_NOT_OPEN", "尚未打开实例。");
    return this.activeService;
  }

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    this.listeners.add(handler);
    if (this.activeService)
      this.unsubscribers.set(handler, this.activeService.subscribe(handler));
    return () => {
      this.listeners.delete(handler);
      this.unsubscribers.get(handler)?.();
      this.unsubscribers.delete(handler);
    };
  }

  async create(request: CreateInstanceRequest): Promise<InstanceOpenResult> {
    return this.transition(async () => {
      this.checkBusy();
      const directoryCreated = !existsSync(request.rootPath);
      const entry = this.instances.create(request);
      try {
        return await this.openNow(entry.id);
      } catch (cause) {
        if (directoryCreated) this.instances.discardCreated(entry.id, true);
        throw cause;
      }
    });
  }

  async open(instanceId: string): Promise<InstanceOpenResult> {
    return this.transition(() => this.openNow(instanceId));
  }

  async openLast(): Promise<InstanceOpenResult | null> {
    const snapshot = this.getSnapshot();
    if (!snapshot.firstSelectionCompleted || !snapshot.lastActiveInstanceId)
      return null;
    try {
      return await this.open(snapshot.lastActiveInstanceId);
    } catch (cause) {
      this.startupError =
        cause instanceof Error ? cause.message : String(cause);
      return null;
    }
  }

  rename(instanceId: string, name: string): InstanceSnapshot {
    if (this.transitioning)
      throw new InstanceError("INSTANCE_SWITCH_IN_PROGRESS", "正在切换实例。");
    this.instances.rename(instanceId, name);
    return this.getSnapshot();
  }

  getConfiguration(instanceId: string) {
    return this.instances.getConfiguration(instanceId);
  }

  async updateConfiguration(
    instanceId: string,
    configuration: AgentConfigurationInput,
  ): Promise<InstanceSnapshot> {
    if (this.transitioning)
      throw new InstanceError("INSTANCE_SWITCH_IN_PROGRESS", "正在切换实例。");
    if (instanceId === this.activeInstanceId) {
      const service = this.requireService();
      await service.configure({
        provider: configuration.chat.provider,
        modelName: configuration.chat.modelName,
        baseUrl: configuration.chat.baseUrl,
        apiKey: configuration.chat.apiKey,
        workspacePath: configuration.workspace.defaultProjectsRoot,
        embedding: configuration.embedding,
      });
    } else {
      this.instances.updateConfiguration(instanceId, configuration);
    }
    return this.getSnapshot();
  }

  remove(instanceId: string): Promise<InstanceSnapshot> {
    return this.transition(async () => {
      this.registry.get(instanceId);
      if (instanceId === this.activeInstanceId) {
        this.checkBusy();
        const service = this.activeService;
        this.activeService = null;
        this.activeInstanceId = null;
        this.clearSubscriptions();
        try {
          await service?.shutdown();
        } catch (cause) {
          this.activeService = service;
          this.activeInstanceId = instanceId;
          if (service) this.bindSubscriptions(service);
          throw new InstanceError(
            "INSTANCE_BUSY",
            "无法关闭当前实例，请稍后重试。",
            { cause },
          );
        }
      }
      this.instances.remove(instanceId);
      return this.getSnapshot();
    });
  }

  relocate(instanceId: string, rootPath: string): InstanceSnapshot {
    if (this.transitioning)
      throw new InstanceError("INSTANCE_SWITCH_IN_PROGRESS", "正在切换实例。");
    if (instanceId === this.activeInstanceId)
      throw new InstanceError("INSTANCE_BUSY", "不能重新定位当前实例。");
    this.instances.relocate(instanceId, rootPath);
    return this.getSnapshot();
  }

  returnToPanel(): InstanceSnapshot {
    return this.getSnapshot();
  }

  async shutdown(): Promise<void> {
    const service = this.activeService;
    this.activeService = null;
    this.activeInstanceId = null;
    this.clearSubscriptions();
    await service?.shutdown();
  }

  private async transition<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transitioning) {
      throw new InstanceError(
        "INSTANCE_SWITCH_IN_PROGRESS",
        "正在切换实例，请稍后重试。",
      );
    }
    this.transitioning = true;
    try {
      return await operation();
    } finally {
      this.transitioning = false;
    }
  }

  private checkBusy(): void {
    if (this.activeService && !this.activeService.canClose()) {
      throw new InstanceError(
        "INSTANCE_BUSY",
        "当前实例仍有任务或数据操作进行中。",
      );
    }
  }

  private async openNow(instanceId: string): Promise<InstanceOpenResult> {
    const entry = this.registry.get(instanceId);
    const snapshot = this.getSnapshot();
    const selected = snapshot.instances.find((item) => item.id === instanceId);
    if (selected?.status !== "ready") {
      throw new InstanceError(
        "INSTANCE_METADATA_INVALID",
        "实例尚未完成初始化或目录不可用。",
      );
    }
    if (instanceId === this.activeInstanceId && this.activeService) {
      return { instance: selected, snapshot };
    }
    this.checkBusy();
    const previousId = this.activeInstanceId;
    const previous = this.activeService;
    try {
      await previous?.shutdown();
    } catch (cause) {
      throw new InstanceError(
        "INSTANCE_BUSY",
        "无法关闭当前实例，请稍后重试。",
        { cause },
      );
    }
    this.clearSubscriptions();
    this.activeService = null;
    this.activeInstanceId = null;
    let next: InstanceService | null = null;
    try {
      next = this.createService({ ...this.options, agentHome: entry.rootPath });
      await next.initialize();
      this.activeService = next;
      this.activeInstanceId = instanceId;
      this.bindSubscriptions(next);
      this.registry.markOpened(instanceId);
      this.startupError = null;
      const opened = this.getSnapshot();
      const instance = opened.instances.find((item) => item.id === instanceId);
      if (!instance)
        throw new InstanceError(
          "INSTANCE_NOT_FOUND",
          "实例打开后未出现在注册表中。",
        );
      return { instance, snapshot: opened };
    } catch (cause) {
      await next?.shutdown().catch((): void => undefined);
      this.activeService = null;
      this.activeInstanceId = null;
      this.clearSubscriptions();
      if (previousId) {
        try {
          const restored = this.createService({
            ...this.options,
            agentHome: this.registry.get(previousId).rootPath,
          });
          await restored.initialize();
          this.activeService = restored;
          this.activeInstanceId = previousId;
          this.bindSubscriptions(restored);
        } catch (recoveryCause) {
          throw new InstanceError(
            "INSTANCE_RECOVERY_FAILED",
            "打开新实例及恢复原实例均失败。",
            {
              cause: new AggregateError([cause, recoveryCause]),
            },
          );
        }
      }
      throw new InstanceError("INSTANCE_OPEN_FAILED", "无法打开实例。", {
        cause,
      });
    }
  }

  private bindSubscriptions(service: InstanceService): void {
    for (const handler of this.listeners)
      this.unsubscribers.set(handler, service.subscribe(handler));
  }

  private clearSubscriptions(): void {
    for (const unsubscribe of this.unsubscribers.values()) unsubscribe();
    this.unsubscribers.clear();
  }
}
