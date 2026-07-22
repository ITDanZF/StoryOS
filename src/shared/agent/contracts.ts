import type { ApplicationEvent, RunSnapshot } from "../../main/agent/application/contracts.ts";
import type { CreateProjectRequest, ProjectDto, ProjectSnapshot } from "../../main/agent/application/projectContracts.ts";
import type { MessageDto, ThreadDto, ThreadSnapshot } from "../../main/agent/application/threadContracts.ts";
import type { ThreadSkillState } from "../../main/agent/application/threadPorts.ts";
import type { ToolApprovalDecision } from "../../main/agent/security/ToolPolicy.ts";
import type { SkillDetail } from "../../main/agent/skills/SkillTypes.ts";
import type { SkillSnapshot } from "../../main/agent/skills/SkillApplication.ts";
import type { AgentConfigurationRequest, AgentServiceStatus } from "../../main/agent/StoryAgentService.ts";

export const AGENT_IPC_CHANNELS = Object.freeze({
    status: "agent:status",
    configure: "agent:configure",
    sendMessage: "agent:send-message",
    cancelRun: "agent:cancel-run",
    listRuns: "agent:list-runs",
    resolveApproval: "agent:resolve-approval",
    threadSnapshot: "agent:thread-snapshot",
    listMessages: "agent:list-messages",
    createThread: "agent:create-thread",
    switchThread: "agent:switch-thread",
    deleteThread: "agent:delete-thread",
    projectSnapshot: "agent:project-snapshot",
    createProject: "agent:create-project",
    openProject: "agent:open-project",
    switchProject: "agent:switch-project",
    removeProject: "agent:remove-project",
    skillSnapshot: "agent:skill-snapshot",
    getSkill: "agent:get-skill",
    useSkill: "agent:use-skill",
    disableSkill: "agent:disable-skill",
    clearSkillState: "agent:clear-skill-state",
    event: "agent:event",
} as const);

export type AgentDesktopApi = {
    getStatus(): Promise<AgentServiceStatus>;
    configure(request: AgentConfigurationRequest): Promise<AgentServiceStatus>;
    sendMessage(request: { threadId: string; content: string }): Promise<{ runId: string }>;
    cancelRun(runId: string): Promise<boolean>;
    listRuns(): Promise<readonly RunSnapshot[]>;
    resolveApproval(approvalId: string, decision: ToolApprovalDecision): Promise<boolean>;
    getThreadSnapshot(projectPath?: string | null): Promise<ThreadSnapshot>;
    listMessages(threadId?: string): Promise<readonly MessageDto[]>;
    createThread(title: string, projectPath?: string | null): Promise<ThreadDto>;
    switchThread(threadId: string): Promise<ThreadSnapshot>;
    deleteThread(threadId: string): Promise<ThreadSnapshot>;
    getProjectSnapshot(): Promise<ProjectSnapshot>;
    createProject(request: CreateProjectRequest): Promise<ProjectDto>;
    openProject(projectPath: string): Promise<ProjectDto>;
    switchProject(projectPath: string | null): Promise<ProjectSnapshot>;
    removeProject(projectPath: string): Promise<ProjectSnapshot>;
    getSkillSnapshot(): Promise<SkillSnapshot>;
    getSkill(skillId: string): Promise<SkillDetail | null>;
    useSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
    disableSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
    clearSkillState(threadId?: string): Promise<ThreadSkillState>;
    onEvent(handler: (event: ApplicationEvent) => void): () => void;
};

export type {
    AgentConfigurationRequest,
    AgentServiceStatus,
    ApplicationEvent,
    MessageDto,
    CreateProjectRequest,
    ProjectDto,
    ProjectSnapshot,
    RunSnapshot,
    SkillDetail,
    SkillSnapshot,
    ThreadDto,
    ThreadSkillState,
    ThreadSnapshot,
    ToolApprovalDecision,
};
