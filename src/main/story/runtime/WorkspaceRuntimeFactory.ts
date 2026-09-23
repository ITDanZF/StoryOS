import SqliteApplicationEventRecorder from "../storage/project/SqliteApplicationEventRecorder.ts";
import path from "node:path";
import type { ApplicationEvent } from "../../../shared/contracts/conversations/applicationContracts.ts";
import ResourceScope from "../../bootstrap/ResourceScope.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import SqliteTextIndexStore from "../storage/project/SqliteTextIndexStore.ts";
import AgentApplication from "../application/conversations/AgentApplication.ts";
import Memory from "../../agent/checkpoints/index.ts";
import SqliteCheckpointRecovery from "../../agent/checkpoints/SqliteCheckpointRecovery.ts";
import LiveModelConnection from "../../agent/model/LiveModelConnection.ts";
import Model from "../../agent/model/Model.ts";
import type { ModelConnectionConfiguration } from "../../agent/model/ModelConfiguration.ts";
import { createAgentOrchestrator } from "../integration/createStoryAgentOrchestrator.ts";
import BookToolContext from "../integration/tools/book/BookToolContext.ts";
import type { RendererEditorToolClient } from "../integration/tools/editor/contracts.ts";
import WorkspaceToolContext from "../integration/StoryWorkspaceToolContext.ts";
import BookProvisioningService from "../application/books/BookProvisioningService.ts";
import type { BookRegistry } from "../application/books/bookRegistryPorts.ts";
import ChapterGenerationService from "../application/books/ChapterGenerationService.ts";
import NovelApplication from "../application/books/NovelApplication.ts";
import ProjectBookNovelStore from "../storage/book/ProjectBookNovelStore.ts";
import type {
  ConversationApplicationEvent,
  ConversationApplicationEventHandler,
  ConversationScope,
} from "../application/conversations/conversationContracts.ts";
import ThreadApplication from "../application/conversations/ThreadApplication.ts";
import SqliteConversationEventStore from "../storage/project/SqliteConversationEventStore.ts";
import SqliteRunStore from "../storage/project/SqliteRunStore.ts";
import SqliteThreadStore from "../storage/project/SqliteThreadStore.ts";
import type ProjectApplication from "../application/projects/ProjectApplication.ts";
import { getWorkspaceLayout } from "../workspace/ProjectLayout.ts";
import SkillApplication from "../../agent/skills/SkillApplication.ts";
import SkillContextProviderService from "../../agent/skills/SkillContextProvider.ts";
import SkillDraftService from "../../agent/skills/SkillDraftService.ts";
import SkillInstallService from "../../agent/skills/SkillInstallService.ts";
import SkillLoader from "../../agent/skills/SkillLoader.ts";
import SkillScaffoldService from "../../agent/skills/SkillScaffoldService.ts";
import type NovelVectorPassageQuery from "../application/vectors/NovelVectorPassageQuery.ts";
import BookRuntimeManager from "./BookRuntimeManager.ts";
import type { ActiveWorkspaceRuntime } from "./WorkspaceRuntimeManager.ts";

export type WorkspaceNovelVectorHooks = {
  readonly onRevisionSaved: (bookId: string) => void;
  readonly passages: NovelVectorPassageQuery;
};
function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
export default class WorkspaceRuntimeFactory {
  constructor(
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly bookRuntimes: BookRuntimeManager,
    private readonly bookProvisioning: BookProvisioningService,
    private readonly modelConfiguration: ModelConnectionConfiguration,
    private readonly modelConnection: LiveModelConnection,
    private readonly subscribers: ReadonlySet<ConversationApplicationEventHandler>,
    private readonly rendererEditorTools?: RendererEditorToolClient,
    private readonly novelVectors?: WorkspaceNovelVectorHooks,
  ) {}
  async create(projectPath: string | null): Promise<ActiveWorkspaceRuntime> {
    const resources = new ResourceScope();

    try {
      const snapshot = this.projects.getSnapshot();
      const project =
        projectPath === null
          ? null
          : snapshot.projects.find((item) => samePath(item.path, projectPath));
      if (projectPath !== null && !project) throw new Error(`Project not found: ${projectPath}`);
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
          [...this.subscribers].map((subscriber) =>
            Promise.resolve().then(() => subscriber(scopedEvent)),
          ),
        ).then(() => {
          // Subscriber failures are isolated from the active runtime.
        });
      };

      const projectDatabase = new ProjectDatabase(layout.projectDatabasePath);
      resources.add("projectDatabase", () => projectDatabase.close());
      const threads = new ThreadApplication(
        new SqliteThreadStore(projectDatabase.handle, () =>
          project ? (this.books.getBookForProject(project.id)?.id ?? null) : null,
        ),
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
      resources.add("bookStore", () => bookStore.close());
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
        this.novelVectors?.onRevisionSaved,
      );
      const modelSessions = new Memory({
        checkpointBackend: "sqlite",
        checkpointPath: layout.checkpointPath,
      });
      resources.add("modelSessions", () => modelSessions.close());
      const model = new Model({
        configuration: this.modelConfiguration,
        connection: this.modelConnection,
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
      const runStore = new SqliteRunStore(projectDatabase.handle, 500, () => ({
        ...this.modelConnection.getIdentity(),
        bookId: project ? (this.books.getBookForProject(project.id)?.id ?? null) : null,
      }));
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
                  this.novelVectors?.passages,
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
          checkpointRecovery: new SqliteCheckpointRecovery(layout.checkpointPath),
          withRunContext: (operation) => this.modelConnection.withNewTask(operation),
          eventRecorder: new SqliteApplicationEventRecorder(
            projectDatabase.handle,
            runStore,
            conversationEvents,
          ),
          initialRuns,
          maxRetainedRuns: 100,
        },
      );
      resources.add("agent", () => agent.shutdown());
      const unsubscribe = agent.subscribe(publishScopedEvent);
      resources.add("unsubscribe", () => unsubscribe());
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
        close: () => resources.close(),
      });
    } catch (error) {
      try {
        await resources.close();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Workspace startup and cleanup failed");
      }
      throw error;
    }
  }
}
