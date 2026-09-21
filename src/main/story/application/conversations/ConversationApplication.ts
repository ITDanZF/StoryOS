import type { DesktopControllerDependencies } from "../../../desktop/DesktopControllerDependencies.ts";
import type { ActiveWorkspaceRuntime } from "../../runtime/WorkspaceRuntimeManager.ts";
import type { ToolApprovalDecision } from "../../../agent/tools/security/ToolPolicy.ts";
import type {
  ConversationRef,
  ConversationScope,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "./conversationContracts.ts";
export default class ConversationApplication {
  constructor(private readonly dependencies: Pick<DesktopControllerDependencies, "runtime">) {}
  sendMessage(request: { readonly threadId: string; readonly content: string }) {
    return this.sendMessageWithRuntime(this.dependencies.runtime, request);
  }

  async sendConversationMessage(request: SendConversationMessageRequest) {
    if (
      request.context &&
      (request.scope.kind !== "project" || request.context.projectId !== request.scope.projectId)
    ) {
      throw new Error("Conversation context does not match its project scope.");
    }
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    const result = this.sendMessageWithRuntime(runtime, request);
    return Object.freeze({
      ...result,
      threads: runtime.threads.getSnapshot(),
    });
  }

  private sendMessageWithRuntime(
    runtime: Pick<ActiveWorkspaceRuntime, "threads" | "agent">,
    request: {
      readonly threadId: string;
      readonly content: string;
      readonly context?: SendConversationMessageRequest["context"];
    },
  ) {
    const threadId = request.threadId.trim();
    const content = request.content.trim();
    if (!threadId) throw new Error("Thread id is required.");
    if (!content) throw new Error("Message content is required.");
    const { agent } = runtime;
    const userMessage = { id: crypto.randomUUID(), content };
    const runId = agent.startRun({
      threadId,
      message: {
        messageId: userMessage.id,
        content: userMessage.content,
      },
      ...(request.context ? { context: request.context } : {}),
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

  async listConversationEvents(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.conversationEvents.listByThread(
      request.threadId,
      request.afterSequence,
      request.limit,
      request.beforeSequence,
    );
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

  cancelRun(runId: string): boolean {
    return this.dependencies.runtime.agent.cancelRun(runId);
  }

  listRuns() {
    return this.dependencies.runtime.agent.listRuns();
  }

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

  getThreadSnapshot() {
    return this.dependencies.runtime.threads.getSnapshot();
  }

  listMessages(threadId?: string) {
    return this.dependencies.runtime.threads.listMessages(threadId);
  }

  createThread(title: string) {
    return this.dependencies.runtime.threads.createThread({ title });
  }

  switchThread(threadId: string) {
    return this.dependencies.runtime.threads.switchThread(threadId);
  }

  deleteThread(threadId: string) {
    return this.dependencies.runtime.threads.deleteThread(threadId);
  }
}
