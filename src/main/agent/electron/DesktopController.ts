import { shell } from "electron";
import type ProjectApplication from "../application/ProjectApplication.ts";
import type { CreateProjectRequest, RenameProjectRequest } from "../application/projectContracts.ts";
import type {
  ConversationApplicationEventHandler,
  ConversationRef,
  ConversationScope,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "../application/conversationContracts.ts";
import type { ToolApprovalDecision } from "../security/ToolPolicy.ts";
import type WorkspaceRuntimeManager from "../runtime/WorkspaceRuntimeManager.ts";
import type {
  ActiveWorkspaceRuntime,
} from "../runtime/WorkspaceRuntimeManager.ts";

export type DesktopControllerDependencies = {
  readonly projects: ProjectApplication;
  readonly runtime: WorkspaceRuntimeManager;
};

export default class DesktopController {
  constructor(private readonly dependencies: DesktopControllerDependencies) {}

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    return this.dependencies.runtime.subscribe(handler);
  }

  sendMessage(request: { readonly threadId: string; readonly content: string }) {
    return this.sendMessageWithRuntime(this.dependencies.runtime, request);
  }

  async sendConversationMessage(request: SendConversationMessageRequest) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return this.sendMessageWithRuntime(runtime, request);
  }

  private sendMessageWithRuntime(
    runtime: Pick<ActiveWorkspaceRuntime, "threads" | "agent">,
    request: { readonly threadId: string; readonly content: string },
  ) {
    const threadId = request.threadId.trim();
    const content = request.content.trim();
    if (!threadId) throw new Error("Thread id is required.");
    if (!content) throw new Error("Message content is required.");
    const { threads, agent } = runtime;
    threads.appendMessage({ threadId, role: "user", content });
    const runId = agent.startRun({ threadId, input: content });
    void agent.waitForRun(runId).then((answer) => {
      threads.appendMessage({ threadId, role: "assistant", content: answer });
    }).catch(() => {
      // Run failures are emitted by AgentApplication; partial assistant replies are not persisted.
    });
    return Object.freeze({ runId });
  }

  async getConversationSnapshot(scope: ConversationScope) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.getSnapshot(),
    });
  }

  async listConversationMessages(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.threads.listMessages(request.threadId);
  }

  async createConversation(request: CreateConversationRequest) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.threads.createThread({ title: request.title });
  }

  async switchConversation(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.switchThread(request.threadId),
    });
  }

  async deleteConversation(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.deleteThread(request.threadId),
    });
  }

  async getProjectNavigation(projectId: string) {
    const project = this.dependencies.projects.getSnapshot().projects.find(
      (item) => item.id === projectId,
    );
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error(`Project book not found: ${projectId}`);
    return Object.freeze({
      project,
      book: Object.freeze({
        id: book.id,
        title: book.title,
        status: book.status,
        volumeCount: runtime.novels.listVolumes(book.id).length,
        chapterCount: runtime.novels.listChapters(book.id).length,
        updatedAt: book.updatedAt,
      }),
      conversations: runtime.threads.getSnapshot(),
    });
  }

  cancelRun(runId: string): boolean { return this.dependencies.runtime.agent.cancelRun(runId); }
  listRuns() { return this.dependencies.runtime.agent.listRuns(); }
  resolveApproval(approvalId: string, decision: ToolApprovalDecision) {
    return this.dependencies.runtime.agent.resolveApproval(approvalId, decision);
  }
  async cancelConversationRun(scope: ConversationScope, runId: string) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.cancelRun(runId);
  }
  async listConversationRuns(scope: ConversationScope) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.listRuns();
  }
  async resolveConversationApproval(
    scope: ConversationScope,
    approvalId: string,
    decision: ToolApprovalDecision,
  ) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.resolveApproval(approvalId, decision);
  }
  getThreadSnapshot() { return this.dependencies.runtime.threads.getSnapshot(); }
  listMessages(threadId?: string) { return this.dependencies.runtime.threads.listMessages(threadId); }
  createThread(title: string) { return this.dependencies.runtime.threads.createThread({ title }); }
  switchThread(threadId: string) { return this.dependencies.runtime.threads.switchThread(threadId); }
  deleteThread(threadId: string) { return this.dependencies.runtime.threads.deleteThread(threadId); }
  getProjectSnapshot() { return this.dependencies.projects.getSnapshot(); }
  getWorkspaceSnapshot() {
    return Object.freeze({ projects: this.dependencies.projects.getSnapshot(), threads: this.dependencies.runtime.threads.getSnapshot() });
  }

  async createProject(request: CreateProjectRequest) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.createProject(request);
    try {
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProject(projectPath: string) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.openProject(projectPath);
    try {
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProjectDirectory(projectPath: string): Promise<void> {
    const project = this.dependencies.projects.getProject(projectPath);
    const errorMessage = await shell.openPath(project.path);
    if (errorMessage) throw new Error(`Could not open project directory: ${errorMessage}`);
  }

  async renameProject(request: RenameProjectRequest) {
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === request.projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(request.projectPath);
    const result = this.dependencies.projects.renameProject(request);
    try {
      if (wasActive) await this.dependencies.runtime.activate(result.project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.rollbackProjectRename(result);
      if (wasActive) await this.dependencies.runtime.activate(result.previousProject.path);
      throw error;
    }
  }

  async deleteProject(projectPath: string) {
    const project = this.dependencies.projects.getProject(projectPath);
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === project.path;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(project.path);
    try {
      await shell.trashItem(project.path);
    } catch (error) {
      if (wasActive) await this.dependencies.runtime.activate(project.path);
      throw error;
    }
    const snapshot = this.dependencies.projects.removeProject(project.path);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }

  async switchProject(projectPath: string | null) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    await this.dependencies.runtime.activate(projectPath);
    try {
      this.dependencies.projects.switchProject(projectPath);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async removeProject(projectPath: string) {
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(projectPath);
    const snapshot = this.dependencies.projects.removeProject(projectPath);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }

  shutdown(): Promise<void> { return this.dependencies.runtime.shutdown(); }

  getSkillSnapshot() { return this.dependencies.runtime.skills.getSnapshot(); }
  getSkill(skillId: string) { return this.dependencies.runtime.skills.getSkill(skillId); }
  useSkill(skillId: string, threadId?: string) { return this.dependencies.runtime.threads.useSkill(skillId, threadId); }
  disableSkill(skillId: string, threadId?: string) { return this.dependencies.runtime.threads.disableSkill(skillId, threadId); }
  clearSkillState(threadId?: string) { return this.dependencies.runtime.threads.clearSkillState(threadId); }
}
