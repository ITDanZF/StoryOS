import path from "node:path";
import { createAgentOrchestrator } from "../Agent/orchestration/index.ts";
import AgentApplication from "../application/AgentApplication.ts";
import type { ApplicationEventHandler } from "../application/contracts.ts";
import type ProjectApplication from "../application/ProjectApplication.ts";
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
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import SqliteRunStore from "../storage/project/SqliteRunStore.ts";
import SqliteThreadStore from "../storage/project/SqliteThreadStore.ts";
import SqliteTextIndexStore from "../storage/project/SqliteTextIndexStore.ts";
import {
  getWorkspaceLayout,
  type WorkspaceLayout,
} from "../workspace/ProjectLayout.ts";

export type ActiveWorkspaceRuntime = {
  readonly projectPath: string | null;
  readonly layout: WorkspaceLayout;
  readonly threads: ThreadApplication;
  readonly agent: AgentApplication;
  readonly skills: SkillApplication;
  readonly model: Model;
  readonly modelSessions: Memory;
  readonly unsubscribe: () => void;
  readonly close: () => Promise<void>;
};

type RuntimeResourceScope = {
  projectDatabase: ProjectDatabase | null;
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
  private readonly subscribers = new Set<ApplicationEventHandler>();
  private current: ActiveWorkspaceRuntime | null = null;

  private constructor(
    private readonly projects: ProjectApplication,
    private readonly modelConfiguration: ModelConnectionConfiguration,
  ) {}

  static async create(
    projects: ProjectApplication,
    modelConfiguration: ModelConnectionConfiguration,
  ): Promise<WorkspaceRuntimeManager> {
    const manager = new WorkspaceRuntimeManager(projects, modelConfiguration);
    await manager.activate(projects.getSnapshot().activeProjectPath);
    return manager;
  }

  subscribe(handler: ApplicationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  get threads(): ThreadApplication {
    return this.requireCurrent().threads;
  }
  get agent(): AgentApplication {
    return this.requireCurrent().agent;
  }
  get skills(): SkillApplication {
    return this.requireCurrent().skills;
  }
  get activeProjectPath(): string | null {
    return this.requireCurrent().projectPath;
  }

  async activate(projectPath: string | null): Promise<void> {
    if (this.current && this.matchesCurrent(projectPath)) return;
    this.assertCanLeaveCurrent();

    const next = await this.createRuntime(projectPath);
    const previous = this.current;
    this.current = next;
    await this.closeRuntime(previous);
  }

  private async createRuntime(
    projectPath: string | null,
  ): Promise<ActiveWorkspaceRuntime> {
    const resources: RuntimeResourceScope = {
      projectDatabase: null,
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

      const projectDatabase = new ProjectDatabase(layout.databasePath);
      resources.projectDatabase = projectDatabase;
      const threads = new ThreadApplication(
        new SqliteThreadStore(projectDatabase.handle),
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
      const initialRuns = await runStore.loadRunSnapshots(100);
      const agent = new AgentApplication(
        createAgentOrchestrator({
          model,
          skillContextProvider,
          skillDefinitions: skills.listSkillDefinitions(),
          skillDefinitionsProvider: () => skills.listSkillDefinitions(),
          skillInstaller,
          workspaceContext,
        }),
        {
          checkpointPath: layout.checkpointPath,
          eventRecorder: runStore,
          initialRuns,
          maxRetainedRuns: 100,
        },
      );
      resources.agent = agent;
      const unsubscribe = agent.subscribe((event) =>
        Promise.allSettled(
          [...this.subscribers].map((subscriber) => subscriber(event)),
        ).then(() => {
          // Subscriber failures are isolated from the active agent run.
        }),
      );
      resources.unsubscribe = unsubscribe;
      return Object.freeze({
        projectPath: project?.path ?? null,
        layout,
        threads,
        agent,
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
      !this.current?.projectPath ||
      !samePath(this.current.projectPath, projectPath)
    )
      return;
    this.assertCanLeaveCurrent();
    await this.closeCurrent();
  }

  hasActiveRun(): boolean {
    return this.current?.agent.hasActiveRuns() ?? false;
  }

  async close(): Promise<void> {
    this.assertCanLeaveCurrent();
    await this.closeCurrent();
  }

  async shutdown(): Promise<void> {
    await this.closeCurrent();
    this.subscribers.clear();
  }

  private requireCurrent(): ActiveWorkspaceRuntime {
    if (!this.current)
      throw new Error("StoryOS workspace runtime is not initialized.");
    return this.current;
  }

  private matchesCurrent(projectPath: string | null): boolean {
    if (!this.current) return false;
    if (this.current.projectPath === null || projectPath === null) {
      return this.current.projectPath === projectPath;
    }
    return samePath(this.current.projectPath, projectPath);
  }

  private assertCanLeaveCurrent(): void {
    if (this.current?.agent.hasActiveRuns()) {
      throw new Error(
        "当前项目仍有 AI 任务运行，请先停止任务后再切换、重命名或删除项目。",
      );
    }
  }

  private async closeCurrent(): Promise<void> {
    const current = this.current;
    this.current = null;
    await this.closeRuntime(current);
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
            resources.projectDatabase?.close();
          }
        }
      }
    })();
    return resources.closePromise;
  }
}
