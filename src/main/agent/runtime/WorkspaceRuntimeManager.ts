import path from "node:path";
import { createAgentOrchestrator } from "../Agent/orchestration/index.ts";
import AgentApplication from "../application/AgentApplication.ts";
import type { ApplicationEvent } from "../application/contracts.ts";
import type {
  ConversationApplicationEvent,
  ConversationApplicationEventHandler,
  ConversationScope,
} from "../application/conversationContracts.ts";
import NovelApplication from "../application/NovelApplication.ts";
import BookProvisioningService from "../application/BookProvisioningService.ts";
import type ProjectApplication from "../application/ProjectApplication.ts";
import type { BookRegistry } from "../application/bookRegistryPorts.ts";
import ThreadApplication from "../application/ThreadApplication.ts";
import Memory from "../Memory/index.ts";
import type { ModelConnectionConfiguration } from "../model/ModelConfiguration.ts";
import Model from "../model/Model.ts";
import SkillApplication from "../skills/SkillApplication.ts";
import SkillContextProviderService from "../skills/SkillContextProvider.ts";
import SkillDraftService from "../skills/SkillDraftService.ts";
import SkillInstallService from "../skills/SkillInstallService.ts";
import SkillLoader from "../skills/SkillLoader.ts";
import SkillScaffoldService from "../skills/SkillScaffoldService.ts";
import WorkspaceToolContext from "../tools/WorkspaceToolContext.ts";
import BookToolContext from "../tools/book/BookToolContext.ts";
import ChapterGenerationService from "../book-generation/ChapterGenerationService.ts";
import type { RendererEditorToolClient } from "../tools/editor/contracts.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import ProjectBookNovelStore from "../storage/book/ProjectBookNovelStore.ts";
import BookRuntimeManager from "./BookRuntimeManager.ts";
import SqliteRunStore from "../storage/project/SqliteRunStore.ts";
import SqliteConversationEventStore from "../storage/project/SqliteConversationEventStore.ts";
import SqliteThreadStore from "../storage/project/SqliteThreadStore.ts";
import SqliteTextIndexStore from "../storage/project/SqliteTextIndexStore.ts";
import {
  getWorkspaceLayout,
  type WorkspaceLayout,
} from "../workspace/ProjectLayout.ts";

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

type RuntimeResourceScope = {
  projectDatabase: ProjectDatabase | null;
  bookStore: ProjectBookNovelStore | null;
  modelSessions: Memory | null;
  agent: AgentApplication | null;
  unsubscribe: (() => void) | null;
  closePromise: Promise<void> | null;
};

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export default class WorkspaceRuntimeManager {
  private readonly subscribers =
    new Set<ConversationApplicationEventHandler>();
  private globalRuntime: ActiveWorkspaceRuntime | null = null;
  private projectRuntime: ActiveWorkspaceRuntime | null = null;

  private constructor(
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly bookRuntimes: BookRuntimeManager,
    private readonly bookProvisioning: BookProvisioningService,
    private readonly modelConfiguration: ModelConnectionConfiguration,
    private readonly rendererEditorTools?: RendererEditorToolClient,
  ) {}

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
  ): Promise<WorkspaceRuntimeManager>;
  static async create(
    projects: ProjectApplication,
    books: BookRegistry,
    bookRuntimesOrAgentHome: BookRuntimeManager | string,
    provisioningOrConfiguration:
      | BookProvisioningService
      | ModelConnectionConfiguration,
    configurationOrRenderer?:
      | ModelConnectionConfiguration
      | RendererEditorToolClient,
    rendererEditorTools?: RendererEditorToolClient,
  ): Promise<WorkspaceRuntimeManager> {
    const bookRuntimes = typeof bookRuntimesOrAgentHome === "string"
      ? new BookRuntimeManager(bookRuntimesOrAgentHome, books)
      : bookRuntimesOrAgentHome;
    const bookProvisioning = typeof bookRuntimesOrAgentHome === "string"
      ? new BookProvisioningService(
          bookRuntimesOrAgentHome,
          books,
          bookRuntimes,
        )
      : provisioningOrConfiguration as BookProvisioningService;
    const modelConfiguration = typeof bookRuntimesOrAgentHome === "string"
      ? provisioningOrConfiguration as ModelConnectionConfiguration
      : configurationOrRenderer as ModelConnectionConfiguration;
    const editorTools = typeof bookRuntimesOrAgentHome === "string"
      ? configurationOrRenderer as RendererEditorToolClient | undefined
      : rendererEditorTools;
    const manager = new WorkspaceRuntimeManager(
      projects,
      books,
      bookRuntimes,
      bookProvisioning,
      modelConfiguration,
      editorTools,
    );
    try {
      manager.globalRuntime = await manager.createRuntime(null);
      const activeProjectPath = projects.getSnapshot().activeProjectPath;
      if (activeProjectPath) {
        manager.projectRuntime =
          await manager.createRuntime(activeProjectPath);
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

  async activate(projectPath: string | null): Promise<void> {
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

  async resolve(
    scope: ConversationScope,
  ): Promise<ActiveWorkspaceRuntime> {
    if (scope.kind === "global") return this.requireGlobalRuntime();
    const snapshot = this.projects.getSnapshot();
    const project = snapshot.projects.find(
      (item) => item.id === scope.projectId,
    );
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

  private async createRuntime(
    projectPath: string | null,
  ): Promise<ActiveWorkspaceRuntime> {
    const resources: RuntimeResourceScope = {
      projectDatabase: null,
      bookStore: null,
      modelSessions: null,
      agent: null,
      unsubscribe: null,
      closePromise: null,
    };

    try {
      const snapshot = this.projects.getSnapshot();
      const project =
        projectPath === null
          ? null
          : snapshot.projects.find((item) => samePath(item.path, projectPath));
      if (projectPath !== null && !project)
        throw new Error(`Project not found: ${projectPath}`);
      const layout = project
        ? getWorkspaceLayout(project.path)
        : getWorkspaceLayout(snapshot.systemWorkspace.path, true);
      const conversationScope: ConversationScope = project
        ? Object.freeze({ kind: "project", projectId: project.id })
        : Object.freeze({ kind: "global" });
      const publishScopedEvent = (event: ApplicationEvent): Promise<void> => {
        const scopedEvent = Object.freeze({
          ...event,
          conversationScope,
        }) as ConversationApplicationEvent;
        return Promise.allSettled(
          [...this.subscribers].map((subscriber) => subscriber(scopedEvent)),
        ).then(() => {
          // Subscriber failures are isolated from the active runtime.
        });
      };

      const projectDatabase = new ProjectDatabase(layout.projectDatabasePath);
      resources.projectDatabase = projectDatabase;
      const threads = new ThreadApplication(
        new SqliteThreadStore(projectDatabase.handle),
      );
      if (project && !threads.getActiveThreadId()) {
        threads.createThread({ title: "新对话" });
      }
      const bookStore = new ProjectBookNovelStore(
        project?.id ?? null,
        this.books,
        this.bookRuntimes,
        this.bookProvisioning,
      );
      resources.bookStore = bookStore;
      const novels = new NovelApplication(
        bookStore,
        project
          ? (mutation) => {
              void publishScopedEvent({
                type: "book_changed",
                eventId: mutation.id,
                projectId: project.id,
                mutation,
                timestamp: new Date().toISOString(),
              });
            }
          : undefined,
      );
      const modelSessions = new Memory({
        checkpointBackend: "sqlite",
        checkpointPath: layout.checkpointPath,
      });
      resources.modelSessions = modelSessions;
      const model = new Model({
        configuration: this.modelConfiguration,
        sessions: modelSessions,
      });
      const chapterGeneration = project
        ? new ChapterGenerationService(model, novels, publishScopedEvent)
        : undefined;
      const skills = await SkillApplication.create({
        loader: new SkillLoader({ projectSkillRoot: layout.skillsRoot }),
        scaffold: new SkillScaffoldService({
          userSkillRoot: layout.skillsRoot,
        }),
        draft: new SkillDraftService(model),
      });
      const skillInstaller = new SkillInstallService(skills);
      const skillContextProvider = new SkillContextProviderService(skills, {
        threadSkillStateProvider: threads,
      });
      const workspaceContext = new WorkspaceToolContext(
        layout.filesRoot,
        path.join(layout.stateRoot, "text-index"),
        new SqliteTextIndexStore(projectDatabase.handle),
      );
      const runStore = new SqliteRunStore(projectDatabase.handle);
      const conversationEvents = new SqliteConversationEventStore(projectDatabase.handle);
      const initialRuns = await runStore.loadRunSnapshots(100);
      const agent = new AgentApplication(
        createAgentOrchestrator({
          model,
          skillContextProvider,
          skillDefinitions: skills.listSkillDefinitions(),
          skillDefinitionsProvider: () => skills.listSkillDefinitions(),
          skillInstaller,
          workspaceContext,
          ...(project
            ? {
                bookContext: new BookToolContext(
                  project.id,
                  novels,
                  chapterGeneration,
                ),
              }
            : {}),
          ...(project && this.rendererEditorTools
            ? {
                rendererEditorTools: this.rendererEditorTools,
                rendererEditorProjectId: project.id,
              }
            : {}),
        }),
        {
          checkpointPath: layout.checkpointPath,
          eventRecorder: {
            record: async (event) => {
              await Promise.all([
                runStore.record(event),
                conversationEvents.record(event),
              ]);
            },
          },
          initialRuns,
          maxRetainedRuns: 100,
        },
      );
      resources.agent = agent;
      const unsubscribe = agent.subscribe(publishScopedEvent);
      resources.unsubscribe = unsubscribe;
      return Object.freeze({
        conversationScope,
        projectPath: project?.path ?? null,
        layout,
        threads,
        novels,
        agent,
        conversationEvents,
        skills,
        model,
        modelSessions,
        unsubscribe,
        close: () => this.closeResourceScope(resources),
      });
    } catch (error) {
      await this.closeResourceScope(resources);
      throw error;
    }
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
      this.globalRuntime?.agent.hasActiveRuns() ||
      this.projectRuntime?.agent.hasActiveRuns(),
    );
  }

  async close(): Promise<void> {
    this.assertCanLeaveProjectRuntime();
    if (this.globalRuntime?.agent.hasActiveRuns()) {
      throw new Error("全局对话仍有 AI 任务运行，请先停止任务后再关闭工作区。");
    }
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    const projectRuntime = this.projectRuntime;
    const globalRuntime = this.globalRuntime;
    this.projectRuntime = null;
    this.globalRuntime = null;
    await Promise.allSettled([
      this.closeRuntime(projectRuntime),
      this.closeRuntime(globalRuntime),
    ]);
    this.bookRuntimes.closeAll();
    this.subscribers.clear();
  }

  private requireCurrent(): ActiveWorkspaceRuntime {
    const runtime = this.projectRuntime ?? this.globalRuntime;
    if (!runtime)
      throw new Error("StoryOS workspace runtime is not initialized.");
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
      this.projectRuntime?.projectPath &&
      samePath(this.projectRuntime.projectPath, projectPath),
    );
  }

  private assertCanLeaveProjectRuntime(): void {
    if (this.projectRuntime?.agent.hasActiveRuns()) {
      throw new Error(
        "当前项目仍有 AI 任务运行，请先停止任务后再切换、重命名或删除项目。",
      );
    }
  }

  private async closeRuntime(
    runtime: ActiveWorkspaceRuntime | null,
  ): Promise<void> {
    if (!runtime) return;
    await runtime.close();
  }

  private closeResourceScope(resources: RuntimeResourceScope): Promise<void> {
    if (resources.closePromise) return resources.closePromise;
    resources.closePromise = (async () => {
      try {
        if (resources.agent) {
          await resources.agent.shutdown();
        }
      } finally {
        try {
          resources.unsubscribe?.();
        } finally {
          try {
            resources.modelSessions?.close();
          } finally {
            try {
              resources.bookStore?.close();
            } finally {
              resources.projectDatabase?.close();
            }
          }
        }
      }
    })();
    return resources.closePromise;
  }
}
