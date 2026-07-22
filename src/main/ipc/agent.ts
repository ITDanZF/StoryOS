import { BrowserWindow, ipcMain } from "electron";
import StoryAgentService from "../agent/StoryAgentService.ts";
import { AGENT_IPC_CHANNELS } from "../../shared/agent/contracts.ts";
import type { CreateProjectRequest } from "../agent/application/projectContracts.ts";
import type { AgentConfigurationRequest } from "../agent/StoryAgentService.ts";
import type { ToolApprovalDecision } from "../agent/security/ToolPolicy.ts";

function requireApprovalDecision(decision: ToolApprovalDecision): ToolApprovalDecision {
    if (!["allow_once", "allow_session", "deny"].includes(decision)) {
        throw new Error("Invalid tool approval decision.");
    }
    return decision;
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
    handle(AGENT_IPC_CHANNELS.cancelRun, (runId: string) => service.requireController().cancelRun(runId));
    handle(AGENT_IPC_CHANNELS.listRuns, () => service.requireController().listRuns());
    handle(AGENT_IPC_CHANNELS.resolveApproval, (approvalId: string, decision: ToolApprovalDecision) => service.requireController().resolveApproval(approvalId, requireApprovalDecision(decision)));
    handle(AGENT_IPC_CHANNELS.threadSnapshot, (projectPath?: string | null) => service.requireController().getThreadSnapshot(projectPath));
    handle(AGENT_IPC_CHANNELS.listMessages, (threadId?: string) => service.requireController().listMessages(threadId));
    handle(AGENT_IPC_CHANNELS.createThread, (title: string, projectPath?: string | null) => service.requireController().createThread(title, projectPath));
    handle(AGENT_IPC_CHANNELS.switchThread, (threadId: string) => service.requireController().switchThread(threadId));
    handle(AGENT_IPC_CHANNELS.deleteThread, (threadId: string) => service.requireController().deleteThread(threadId));
    handle(AGENT_IPC_CHANNELS.projectSnapshot, () => service.requireController().getProjectSnapshot());
    handle(AGENT_IPC_CHANNELS.createProject, (request: CreateProjectRequest) => service.requireController().createProject(request));
    handle(AGENT_IPC_CHANNELS.openProject, (projectPath: string) => service.requireController().openProject(projectPath));
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
