import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type { ToolApprovalDecision } from "../../agent/tools/security/ToolPolicy.ts";
import type {
  ConversationRef,
  ConversationScope,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "../../story/application/conversations/conversationContracts.ts";
import type DesktopController from "../DesktopController.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
import {
  requireApprovalDecision,
  requireConversationRef,
  requireConversationScope,
  requireConversationTurnContext,
  requireText,
} from "./validation.ts";
export default class ConversationIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => Pick<
      DesktopController,
      | "sendMessage"
      | "sendConversationMessage"
      | "cancelRun"
      | "cancelConversationRun"
      | "listRuns"
      | "listConversationRuns"
      | "resolveApproval"
      | "resolveConversationApproval"
      | "getThreadSnapshot"
      | "getConversationSnapshot"
      | "listMessages"
      | "listConversationMessages"
      | "listConversationEvents"
      | "createThread"
      | "createConversation"
      | "switchThread"
      | "switchConversation"
      | "deleteThread"
      | "deleteConversation"
      | "getBookWorkspace"
      | "getWorkspaceSnapshot"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.sendMessage, (request: { threadId: string; content: string }) =>
      getController().sendMessage({
        threadId: requireText(request?.threadId, "Thread id"),
        content: requireText(request?.content, "Message content"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.sendConversationMessage, (request: SendConversationMessageRequest) =>
      getController().sendConversationMessage({
        ...requireConversationRef(request),
        content: requireText(request?.content, "Message content"),
        ...(request?.context === undefined
          ? {}
          : { context: requireConversationTurnContext(request.context) }),
      }),
    );
    handle(AGENT_IPC_CHANNELS.cancelRun, (runId: string) =>
      getController().cancelRun(requireText(runId, "Run id")),
    );
    handle(AGENT_IPC_CHANNELS.cancelConversationRun, (scope: ConversationScope, runId: string) =>
      getController().cancelConversationRun(
        requireConversationScope(scope),
        requireText(runId, "Run id"),
      ),
    );
    handle(AGENT_IPC_CHANNELS.listRuns, () => getController().listRuns());
    handle(AGENT_IPC_CHANNELS.listConversationRuns, (scope: ConversationScope) =>
      getController().listConversationRuns(requireConversationScope(scope)),
    );
    handle(
      AGENT_IPC_CHANNELS.resolveApproval,
      (approvalId: string, decision: ToolApprovalDecision) =>
        getController().resolveApproval(
          requireText(approvalId, "Approval id"),
          requireApprovalDecision(decision),
        ),
    );
    handle(
      AGENT_IPC_CHANNELS.resolveConversationApproval,
      (scope: ConversationScope, approvalId: string, decision: ToolApprovalDecision) =>
        getController().resolveConversationApproval(
          requireConversationScope(scope),
          requireText(approvalId, "Approval id"),
          requireApprovalDecision(decision),
        ),
    );
    handle(AGENT_IPC_CHANNELS.threadSnapshot, () => getController().getThreadSnapshot());
    handle(AGENT_IPC_CHANNELS.conversationSnapshot, (scope: ConversationScope) =>
      getController().getConversationSnapshot(requireConversationScope(scope)),
    );
    handle(AGENT_IPC_CHANNELS.listMessages, (threadId?: string) =>
      getController().listMessages(requireText(threadId, "Thread id")),
    );
    handle(AGENT_IPC_CHANNELS.listConversationMessages, (request: ConversationRef) =>
      getController().listConversationMessages(requireConversationRef(request)),
    );
    handle(AGENT_IPC_CHANNELS.listConversationEvents, (request: ConversationRef) =>
      getController().listConversationEvents(requireConversationRef(request)),
    );
    handle(AGENT_IPC_CHANNELS.createThread, (title: string) => getController().createThread(title));
    handle(AGENT_IPC_CHANNELS.createConversation, (request: CreateConversationRequest) =>
      getController().createConversation({
        scope: requireConversationScope(request?.scope),
        title: requireText(request?.title, "Thread title"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.switchThread, (threadId: string) =>
      getController().switchThread(requireText(threadId, "Thread id")),
    );
    handle(AGENT_IPC_CHANNELS.switchConversation, (request: ConversationRef) =>
      getController().switchConversation(requireConversationRef(request)),
    );
    handle(AGENT_IPC_CHANNELS.deleteThread, (threadId: string) =>
      getController().deleteThread(requireText(threadId, "Thread id")),
    );
    handle(AGENT_IPC_CHANNELS.deleteConversation, (request: ConversationRef) =>
      getController().deleteConversation(requireConversationRef(request)),
    );
    handle(AGENT_IPC_CHANNELS.bookWorkspace, (projectId: string) =>
      getController().getBookWorkspace(requireText(projectId, "Project id")),
    );
    handle(AGENT_IPC_CHANNELS.workspaceSnapshot, () => getController().getWorkspaceSnapshot());
  }
}
