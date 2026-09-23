import path from "node:path";
import AgentApplication from "../application/conversations/AgentApplication.ts";
import Memory from "../../agent/checkpoints/index.ts";
import LiveModelConnection from "../../agent/model/LiveModelConnection.ts";
import Model from "../../agent/model/Model.ts";
import type { ModelConnectionConfiguration } from "../../agent/model/ModelConfiguration.ts";
import type { RendererEditorToolClient } from "../integration/tools/editor/contracts.ts";
import BookProvisioningService from "../application/books/BookProvisioningService.ts";
import type { BookRegistry } from "../application/books/bookRegistryPorts.ts";
import NovelApplication from "../application/books/NovelApplication.ts";
import type {
  ConversationApplicationEventHandler,
  ConversationScope,
} from "../application/conversations/conversationContracts.ts";
import ThreadApplication from "../application/conversations/ThreadApplication.ts";
import SqliteConversationEventStore from "../storage/project/SqliteConversationEventStore.ts";
import type ProjectApplication from "../application/projects/ProjectApplication.ts";
import { type WorkspaceLayout } from "../workspace/ProjectLayout.ts";
import SkillApplication from "../../agent/skills/SkillApplication.ts";
import BookRuntimeManager from "./BookRuntimeManager.ts";
import WorkspaceRuntimeFactory, {
  type WorkspaceNovelVectorHooks,
} from "./WorkspaceRuntimeFactory.ts";

export type ActiveWorkspaceRuntime = {
  readonly conversationScope: ConversationScope;
  readonly projectPath: string | null;
  readonly layout: WorkspaceLayout;
  readonly threads: ThreadApplication;
  readonly novels: NovelApplication;
  readonly agent: AgentApplication;
  readonly conversationEvents: SqliteConversationEventStore;
  readonly skills: SkillApplication;
  readonly model: Model;
  readonly modelSessions: Memory;
  readonly unsubscribe: () => void;
  readonly close: () => Promise<void>;
};

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export default class WorkspaceRuntimeManager {
  private ownsBookRuntimes = false;
  private stopping = false;
  private closePromise: Promise<void> | null = null;
  private readonly subscribers = new Set<ConversationApplicationEventHandler>();
  private globalRuntime: ActiveWorkspaceRuntime | null = null;
  private projectRuntime: ActiveWorkspaceRuntime | null = null;
  private activationQueue: Promise<void> = Promise.resolve();
  private readonly modelConnection: LiveModelConnection;

  private constructor(
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly bookRuntimes: BookRuntimeManager,
    private readonly bookProvisioning: BookProvisioningService,
    private readonly modelConfiguration: ModelConnectionConfiguration,
    private readonly rendererEditorTools?: RendererEditorToolClient,
    private readonly novelVectors?: WorkspaceNovelVectorHooks,
  ) {
    this.modelConnection = new LiveModelConnection(modelConfiguration);
  }

  prepareModelConfiguration(configuration: ModelConnectionConfiguration): () => void {
    return this.modelConnection.prepareUpdate(configuration);
  }

  static create(
    projects: ProjectApplication,
    books: BookRegistry,
    agentHome: string,
    modelConfiguration: ModelConnectionConfiguration,
    rendererEditorTools?: RendererEditorToolClient,
  ): Promise<WorkspaceRuntimeManager>;
  static create(
    projects: ProjectApplication,
    books: BookRegistry,
    bookRuntimes: BookRuntimeManager,
    bookProvisioning: BookProvisioningService,
    modelConfiguration: ModelConnectionConfiguration,
    rendererEditorTools?: RendererEditorToolClient,
    novelVectors?: WorkspaceNovelVectorHooks,
  ): Promise<WorkspaceRuntimeManager>;
  static async create(
    projects: ProjectApplication,
    books: BookRegistry,
    bookRuntimesOrAgentHome: BookRuntimeManager | string,
    provisioningOrConfiguration: BookProvisioningService | ModelConnectionConfiguration,
    configurationOrRenderer?: ModelConnectionConfiguration | RendererEditorToolClient,
    rendererEditorTools?: RendererEditorToolClient,
    novelVectors?: WorkspaceNovelVectorHooks,
  ): Promise<WorkspaceRuntimeManager> {
    const bookRuntimes =
      typeof bookRuntimesOrAgentHome === "string"
        ? new BookRuntimeManager(bookRuntimesOrAgentHome, books)
        : bookRuntimesOrAgentHome;
    const bookProvisioning =
      typeof bookRuntimesOrAgentHome === "string"
        ? new BookProvisioningService(bookRuntimesOrAgentHome, books, bookRuntimes)
        : (provisioningOrConfiguration as BookProvisioningService);
    const modelConfiguration =
      typeof bookRuntimesOrAgentHome === "string"
        ? (provisioningOrConfiguration as ModelConnectionConfiguration)
        : (configurationOrRenderer as ModelConnectionConfiguration);
    const editorTools =
      typeof bookRuntimesOrAgentHome === "string"
        ? (configurationOrRenderer as RendererEditorToolClient | undefined)
        : rendererEditorTools;
    const vectors = typeof bookRuntimesOrAgentHome === "string" ? undefined : novelVectors;
    const manager = new WorkspaceRuntimeManager(
      projects,
      books,
      bookRuntimes,
      bookProvisioning,
      modelConfiguration,
      editorTools,
      vectors,
    );
    manager.ownsBookRuntimes = typeof bookRuntimesOrAgentHome === "string";
    try {
      manager.globalRuntime = await manager.createRuntime(null);
      const activeProjectPath = projects.getSnapshot().activeProjectPath;
      if (activeProjectPath) {
        manager.projectRuntime = await manager.createRuntime(activeProjectPath);
      }
      return manager;
    } catch (error) {
      await manager.shutdown();
      throw error;
    }
  }

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  get threads(): ThreadApplication {
    return this.requireCurrent().threads;
  }
  get novels(): NovelApplication {
    return this.requireCurrent().novels;
  }
  get agent(): AgentApplication {
    return this.requireCurrent().agent;
  }
  get skills(): SkillApplication {
    return this.requireCurrent().skills;
  }
  get activeProjectPath(): string | null {
    return this.projectRuntime?.projectPath ?? null;
  }

  activate(projectPath: string | null): Promise<void> {
    if (this.stopping) return Promise.reject(new Error("Workspace runtime is closing."));
    // Concurrent IPC reads must share the runtime created by the preceding activation.
    const next = this.activationQueue.then(() => this.activateNow(projectPath));
    this.activationQueue = next.catch((): void => undefined);
    return next;
  }

  private async activateNow(projectPath: string | null): Promise<void> {
    if (projectPath === null) {
      if (!this.projectRuntime) return;
      this.assertCanLeaveProjectRuntime();
      const previous = this.projectRuntime;
      this.projectRuntime = null;
      await this.closeRuntime(previous);
      return;
    }
    if (this.matchesProjectRuntime(projectPath)) return;
    this.assertCanLeaveProjectRuntime();

    const next = await this.createRuntime(projectPath);
    const previous = this.projectRuntime;
    this.projectRuntime = next;
    await this.closeRuntime(previous);
  }

  async resolve(scope: ConversationScope): Promise<ActiveWorkspaceRuntime> {
    if (scope.kind === "global") return this.requireGlobalRuntime();
    const snapshot = this.projects.getSnapshot();
    const project = snapshot.projects.find((item) => item.id === scope.projectId);
    if (!project) throw new Error(`Project not found: ${scope.projectId}`);
    const previousPath = snapshot.activeProjectPath;
    await this.activate(project.path);
    try {
      if (this.projects.getSnapshot().activeProjectId !== project.id) {
        this.projects.switchProject(project.path);
      }
      return this.requireProjectRuntime(scope.projectId);
    } catch (error) {
      await this.activate(previousPath);
      throw error;
    }
  }

  private createRuntime(projectPath: string | null): Promise<ActiveWorkspaceRuntime> {
    return new WorkspaceRuntimeFactory(
      this.projects,
      this.books,
      this.bookRuntimes,
      this.bookProvisioning,
      this.modelConfiguration,
      this.modelConnection,
      this.subscribers,
      this.rendererEditorTools,
      this.novelVectors,
    ).create(projectPath);
  }

  async closeForProjectMutation(projectPath: string): Promise<void> {
    if (
      !this.projectRuntime?.projectPath ||
      !samePath(this.projectRuntime.projectPath, projectPath)
    )
      return;
    this.assertCanLeaveProjectRuntime();
    const runtime = this.projectRuntime;
    this.projectRuntime = null;
    await this.closeRuntime(runtime);
  }

  hasActiveRun(): boolean {
    return Boolean(
      this.globalRuntime?.agent.hasActiveRuns() || this.projectRuntime?.agent.hasActiveRuns(),
    );
  }

  async close(): Promise<void> {
    this.assertCanLeaveProjectRuntime();
    if (this.globalRuntime?.agent.hasActiveRuns()) {
      throw new Error("全局对话仍有 AI 任务运行，请先停止任务后再关闭工作区。");
    }
    await this.shutdown();
  }

  shutdown(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.stopping = true;
    this.closePromise = this.activationQueue.then(() => this.performShutdown());
    return this.closePromise;
  }

  private async performShutdown(): Promise<void> {
    const projectRuntime = this.projectRuntime;
    const globalRuntime = this.globalRuntime;
    this.projectRuntime = null;
    this.globalRuntime = null;
    const results = await Promise.allSettled([
      this.closeRuntime(projectRuntime),
      this.closeRuntime(globalRuntime),
    ]);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    try {
      if (this.ownsBookRuntimes) this.bookRuntimes.closeAll();
    } catch (reason) {
      failures.push({ status: "rejected", reason });
    }
    this.subscribers.clear();
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Workspace shutdown failed",
      );
  }

  async closeForDeveloper(): Promise<void> {
    if (this.hasActiveRun()) throw new Error("仍有 AI 任务运行，请等待完成。");
    await this.shutdown();
  }

  private requireCurrent(): ActiveWorkspaceRuntime {
    const runtime = this.projectRuntime ?? this.globalRuntime;
    if (!runtime) throw new Error("StoryOS workspace runtime is not initialized.");
    return runtime;
  }

  private requireGlobalRuntime(): ActiveWorkspaceRuntime {
    if (!this.globalRuntime) {
      throw new Error("StoryOS global conversation runtime is not initialized.");
    }
    return this.globalRuntime;
  }

  private requireProjectRuntime(projectId: string): ActiveWorkspaceRuntime {
    const runtime = this.projectRuntime;
    if (
      !runtime ||
      runtime.conversationScope.kind !== "project" ||
      runtime.conversationScope.projectId !== projectId
    ) {
      throw new Error(`Project runtime is not active: ${projectId}`);
    }
    return runtime;
  }

  private matchesProjectRuntime(projectPath: string): boolean {
    return Boolean(
      this.projectRuntime?.projectPath && samePath(this.projectRuntime.projectPath, projectPath),
    );
  }

  private assertCanLeaveProjectRuntime(): void {
    if (this.projectRuntime?.agent.hasActiveRuns()) {
      throw new Error("当前项目仍有 AI 任务运行，请先停止任务后再切换、重命名或删除项目。");
    }
  }

  private async closeRuntime(runtime: ActiveWorkspaceRuntime | null): Promise<void> {
    if (!runtime) return;
    await runtime.close();
  }
}
