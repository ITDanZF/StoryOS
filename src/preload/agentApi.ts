import { contextBridge, ipcRenderer } from "electron";
import { AGENT_IPC_CHANNELS } from "../shared/agent/contracts.ts";
import type {
    AgentConfigurationRequest,
    AgentDesktopApi,
    ConversationApplicationEvent,
    ToolApprovalDecision,
} from "../shared/agent/contracts.ts";

const agentApi: AgentDesktopApi = {
    getStatus: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.status),
    configure: (request: AgentConfigurationRequest) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.configure, request),
    sendMessage: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.sendMessage, request),
    sendConversationMessage: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.sendConversationMessage, request),
    cancelRun: (runId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.cancelRun, runId),
    cancelConversationRun: (scope, runId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.cancelConversationRun, scope, runId),
    listRuns: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listRuns),
    listConversationRuns: (scope) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listConversationRuns, scope),
    resolveApproval: (approvalId: string, decision: ToolApprovalDecision) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.resolveApproval, approvalId, decision),
    resolveConversationApproval: (scope, approvalId, decision) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.resolveConversationApproval, scope, approvalId, decision),
    getThreadSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.threadSnapshot),
    getConversationSnapshot: (scope) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.conversationSnapshot, scope),
    listMessages: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listMessages, threadId),
    listConversationMessages: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.listConversationMessages, request),
    createThread: (title) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createThread, title),
    createConversation: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createConversation, request),
    switchThread: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.switchThread, threadId),
    switchConversation: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.switchConversation, request),
    deleteThread: (threadId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.deleteThread, threadId),
    deleteConversation: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.deleteConversation, request),
    getProjectSnapshot: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.projectSnapshot),
    getProjectNavigation: (projectId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.projectNavigation, projectId),
    getBookWorkspace: (projectId) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.bookWorkspace, projectId),
    createBookChapter: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createBookChapter, request),
    createBookVolume: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.createBookVolume, request),
    updateBookChapter: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.updateBookChapter, request),
    saveBookChapterContent: (request) => ipcRenderer.invoke(AGENT_IPC_CHANNELS.saveBookChapterContent, request),
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
    onEvent: (handler: (event: ConversationApplicationEvent) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, event: ConversationApplicationEvent) => handler(event);
        ipcRenderer.on(AGENT_IPC_CHANNELS.event, listener);
        return () => ipcRenderer.removeListener(AGENT_IPC_CHANNELS.event, listener);
    },
};

contextBridge.exposeInMainWorld("storyOSAgent", agentApi);

export default agentApi;
