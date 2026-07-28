import { BrowserWindow, ipcMain } from "electron";
import StoryAgentService from "../agent/StoryAgentService.ts";
import { AGENT_IPC_CHANNELS } from "../../shared/agent/contracts.ts";
import type { CreateProjectRequest, RenameProjectRequest } from "../agent/application/projectContracts.ts";
import type {
    ConversationRef,
    ConversationScope,
    CreateConversationRequest,
    SendConversationMessageRequest,
} from "../agent/application/conversationContracts.ts";
import type { AgentConfigurationRequest } from "../agent/StoryAgentService.ts";
import type { ToolApprovalDecision } from "../agent/security/ToolPolicy.ts";

function requireApprovalDecision(decision: ToolApprovalDecision): ToolApprovalDecision {
    if (!["allow_once", "allow_session", "deny"].includes(decision)) {
        throw new Error("Invalid tool approval decision.");
    }
    return decision;
}

function requireConversationScope(scope: ConversationScope): ConversationScope {
    if (!scope || typeof scope !== "object") {
        throw new Error("Conversation scope is required.");
    }
    if (scope.kind === "global") return Object.freeze({ kind: "global" });
    if (scope.kind !== "project") throw new Error("Invalid conversation scope.");
    const projectId = scope.projectId?.trim();
    if (!projectId) throw new Error("Project id is required.");
    return Object.freeze({ kind: "project", projectId });
}

function requireText(value: unknown, label: string): string {
    if (typeof value !== "string") throw new Error(`${label} is required.`);
    const normalized = value.trim();
    if (!normalized) throw new Error(`${label} is required.`);
    return normalized;
}

function requireConversationRef(request: ConversationRef): ConversationRef {
    const threadId = requireText(request?.threadId, "Thread id");
    return Object.freeze({
        scope: requireConversationScope(request.scope),
        threadId,
    });
}

export function registerAgentIpc(service: StoryAgentService): () => void {
    const registeredChannels: string[] = [];
    const handle = <TArgs extends unknown[]>(
        channel: string,
        listener: (...args: TArgs) => unknown,
    ) => {
        ipcMain.handle(channel, (_event, ...args) => listener(...args as TArgs));
        registeredChannels.push(channel);
    };

    handle(AGENT_IPC_CHANNELS.status, () => service.getStatus());
    handle(AGENT_IPC_CHANNELS.configure, (request: AgentConfigurationRequest) => service.configure(request));
    handle(AGENT_IPC_CHANNELS.sendMessage, (request: { threadId: string; content: string }) => service.requireController().sendMessage(request));
    handle(AGENT_IPC_CHANNELS.sendConversationMessage, (request: SendConversationMessageRequest) =>
        service.requireController().sendConversationMessage({
            ...requireConversationRef(request),
            content: requireText(request?.content, "Message content"),
        }));
    handle(AGENT_IPC_CHANNELS.cancelRun, (runId: string) => service.requireController().cancelRun(runId));
    handle(AGENT_IPC_CHANNELS.cancelConversationRun, (scope: ConversationScope, runId: string) =>
        service.requireController().cancelConversationRun(
            requireConversationScope(scope),
            requireText(runId, "Run id"),
        ));
    handle(AGENT_IPC_CHANNELS.listRuns, () => service.requireController().listRuns());
    handle(AGENT_IPC_CHANNELS.listConversationRuns, (scope: ConversationScope) =>
        service.requireController().listConversationRuns(requireConversationScope(scope)));
    handle(AGENT_IPC_CHANNELS.resolveApproval, (approvalId: string, decision: ToolApprovalDecision) => service.requireController().resolveApproval(approvalId, requireApprovalDecision(decision)));
    handle(AGENT_IPC_CHANNELS.resolveConversationApproval, (
        scope: ConversationScope,
        approvalId: string,
        decision: ToolApprovalDecision,
    ) => service.requireController().resolveConversationApproval(
        requireConversationScope(scope),
        requireText(approvalId, "Approval id"),
        requireApprovalDecision(decision),
    ));
    handle(AGENT_IPC_CHANNELS.threadSnapshot, () => service.requireController().getThreadSnapshot());
    handle(AGENT_IPC_CHANNELS.conversationSnapshot, (scope: ConversationScope) =>
        service.requireController().getConversationSnapshot(requireConversationScope(scope)));
    handle(AGENT_IPC_CHANNELS.listMessages, (threadId?: string) => service.requireController().listMessages(threadId));
    handle(AGENT_IPC_CHANNELS.listConversationMessages, (request: ConversationRef) =>
        service.requireController().listConversationMessages(requireConversationRef(request)));
    handle(AGENT_IPC_CHANNELS.createThread, (title: string) => service.requireController().createThread(title));
    handle(AGENT_IPC_CHANNELS.createConversation, (request: CreateConversationRequest) =>
        service.requireController().createConversation({
            scope: requireConversationScope(request?.scope),
            title: requireText(request?.title, "Thread title"),
        }));
    handle(AGENT_IPC_CHANNELS.switchThread, (threadId: string) => service.requireController().switchThread(threadId));
    handle(AGENT_IPC_CHANNELS.switchConversation, (request: ConversationRef) =>
        service.requireController().switchConversation(requireConversationRef(request)));
    handle(AGENT_IPC_CHANNELS.deleteThread, (threadId: string) => service.requireController().deleteThread(threadId));
    handle(AGENT_IPC_CHANNELS.deleteConversation, (request: ConversationRef) =>
        service.requireController().deleteConversation(requireConversationRef(request)));
    handle(AGENT_IPC_CHANNELS.projectSnapshot, () => service.requireController().getProjectSnapshot());
    handle(AGENT_IPC_CHANNELS.projectNavigation, (projectId: string) =>
        service.requireController().getProjectNavigation(
            requireText(projectId, "Project id"),
        ));
    handle(AGENT_IPC_CHANNELS.workspaceSnapshot, () => service.requireController().getWorkspaceSnapshot());
    handle(AGENT_IPC_CHANNELS.createProject, (request: CreateProjectRequest) => service.requireController().createProject(request));
    handle(AGENT_IPC_CHANNELS.openProject, (projectPath: string) => service.requireController().openProject(projectPath));
    handle(AGENT_IPC_CHANNELS.openProjectDirectory, (projectPath: string) => service.requireController().openProjectDirectory(projectPath));
    handle(AGENT_IPC_CHANNELS.renameProject, (request: RenameProjectRequest) => service.requireController().renameProject(request));
    handle(AGENT_IPC_CHANNELS.deleteProject, (projectPath: string) => service.requireController().deleteProject(projectPath));
    handle(AGENT_IPC_CHANNELS.switchProject, (projectPath: string | null) => service.requireController().switchProject(projectPath));
    handle(AGENT_IPC_CHANNELS.removeProject, (projectPath: string) => service.requireController().removeProject(projectPath));
    handle(AGENT_IPC_CHANNELS.skillSnapshot, () => service.requireController().getSkillSnapshot());
    handle(AGENT_IPC_CHANNELS.getSkill, (skillId: string) => service.requireController().getSkill(skillId));
    handle(AGENT_IPC_CHANNELS.useSkill, (skillId: string, threadId?: string) => service.requireController().useSkill(skillId, threadId));
    handle(AGENT_IPC_CHANNELS.disableSkill, (skillId: string, threadId?: string) => service.requireController().disableSkill(skillId, threadId));
    handle(AGENT_IPC_CHANNELS.clearSkillState, (threadId?: string) => service.requireController().clearSkillState(threadId));

    const unsubscribe = service.subscribe((event) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(AGENT_IPC_CHANNELS.event, event);
        }
    });

    return () => {
        unsubscribe();
        for (const channel of registeredChannels) ipcMain.removeHandler(channel);
    };
}
