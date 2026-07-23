import { contextBridge, ipcRenderer } from "electron";
import { AGENT_IPC_CHANNELS } from "../shared/agent/contracts.ts";
import type {
    AgentConfigurationRequest,
    AgentDesktopApi,
    ApplicationEvent,
    ToolApprovalDecision,
} from "../shared/agent/contracts.ts";

const agentApi: AgentDesktopApi = {
    getStatus: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.status),
    configure: (request: AgentConfigurationRequest) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.configure, request),
    sendMessage: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.sendMessage, request),
    cancelRun: (runId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.cancelRun, runId),
    listRuns: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listRuns),
    resolveApproval: (approvalId: string, decision: ToolApprovalDecision) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.resolveApproval, approvalId, decision),
    getThreadSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.threadSnapshot),
    listMessages: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listMessages, threadId),
    createThread: (title) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createThread, title),
    switchThread: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.switchThread, threadId),
    deleteThread: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.deleteThread, threadId),
    getProjectSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.projectSnapshot),
    getWorkspaceSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.workspaceSnapshot),
    createProject: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createProject, request),
    openProject: (projectPath) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.openProject, projectPath),
    openProjectDirectory: (projectPath) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.openProjectDirectory, projectPath),
    renameProject: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.renameProject, request),
    deleteProject: (projectPath) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.deleteProject, projectPath),
    switchProject: (projectPath) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.switchProject, projectPath),
    removeProject: (projectPath) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.removeProject, projectPath),
    getSkillSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.skillSnapshot),
    getSkill: (skillId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.getSkill, skillId),
    useSkill: (skillId, threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.useSkill, skillId, threadId),
    disableSkill: (skillId, threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.disableSkill, skillId, threadId),
    clearSkillState: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.clearSkillState, threadId),
    onEvent: (handler: (event: ApplicationEvent) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, event: ApplicationEvent) => handler(event);
        ipcRenderer.on(AGENT_IPC_CHANNELS.event, listener);
        return () => ipcRenderer.removeListener(AGENT_IPC_CHANNELS.event, listener);
    },
};

contextBridge.exposeInMainWorld("storyOSAgent", agentApi);

export default agentApi;
