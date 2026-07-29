import type { ApplicationEvent, RunSnapshot } from "../../main/agent/application/contracts.ts";
import type {
    ConversationApplicationEvent,
    ConversationRef,
    ConversationScope,
    ConversationSnapshot,
    CreateConversationRequest,
    SendConversationMessageRequest,
} from "../../main/agent/application/conversationContracts.ts";
import type { CreateProjectRequest, ProjectDto, ProjectSnapshot, RenameProjectRequest } from "../../main/agent/application/projectContracts.ts";
import type { ProjectNavigationSnapshot } from "../../main/agent/application/projectNavigationContracts.ts";
import type { MessageDto, ThreadDto, ThreadSnapshot } from "../../main/agent/application/threadContracts.ts";
import type { ThreadSkillState } from "../../main/agent/application/threadPorts.ts";
import type { ToolApprovalDecision } from "../../main/agent/security/ToolPolicy.ts";
import type { SkillDetail } from "../../main/agent/skills/SkillTypes.ts";
import type { SkillSnapshot } from "../../main/agent/skills/SkillApplication.ts";
import type { AgentConfigurationRequest, AgentServiceStatus } from "../../main/agent/StoryAgentService.ts";
import type {
    BookChapterRevisionResult,
    BookWorkspaceChapterDto,
    BookWorkspaceSnapshot,
    CreateBookChapterRequest,
    CreateBookVolumeRequest,
    SaveBookChapterContentRequest,
    UpdateBookChapterRequest,
} from "../../main/agent/application/bookWorkspaceContracts.ts";
import type { VolumeDto } from "../../main/agent/application/novelContracts.ts";

export const AGENT_IPC_CHANNELS = Object.freeze({
    status: "agent:status",
    configure: "agent:configure",
    sendMessage: "agent:send-message",
    sendConversationMessage: "agent:conversation-send-message",
    cancelRun: "agent:cancel-run",
    cancelConversationRun: "agent:conversation-cancel-run",
    listRuns: "agent:list-runs",
    listConversationRuns: "agent:conversation-list-runs",
    resolveApproval: "agent:resolve-approval",
    resolveConversationApproval: "agent:conversation-resolve-approval",
    threadSnapshot: "agent:thread-snapshot",
    conversationSnapshot: "agent:conversation-snapshot",
    listMessages: "agent:list-messages",
    listConversationMessages: "agent:conversation-list-messages",
    createThread: "agent:create-thread",
    createConversation: "agent:conversation-create",
    switchThread: "agent:switch-thread",
    switchConversation: "agent:conversation-switch",
    deleteThread: "agent:delete-thread",
    deleteConversation: "agent:conversation-delete",
    projectSnapshot: "agent:project-snapshot",
    projectNavigation: "agent:project-navigation",
    bookWorkspace: "agent:book-workspace",
    createBookChapter: "agent:book-chapter-create",
    createBookVolume: "agent:book-volume-create",
    updateBookChapter: "agent:book-chapter-update",
    saveBookChapterContent: "agent:book-chapter-save-content",
    workspaceSnapshot: "agent:workspace-snapshot",
    createProject: "agent:create-project",
    openProject: "agent:open-project",
    openProjectDirectory: "agent:open-project-directory",
    renameProject: "agent:rename-project",
    deleteProject: "agent:delete-project",
    switchProject: "agent:switch-project",
    removeProject: "agent:remove-project",
    skillSnapshot: "agent:skill-snapshot",
    getSkill: "agent:get-skill",
    useSkill: "agent:use-skill",
    disableSkill: "agent:disable-skill",
    clearSkillState: "agent:clear-skill-state",
    event: "agent:event",
} as const);

export type WorkspaceSnapshot = {
    readonly projects: ProjectSnapshot;
    readonly threads: ThreadSnapshot;
};

export type AgentDesktopApi = {
    getStatus(): Promise<AgentServiceStatus>;
    configure(request: AgentConfigurationRequest): Promise<AgentServiceStatus>;
    sendMessage(request: { threadId: string; content: string }): Promise<{ runId: string }>;
    sendConversationMessage(request: SendConversationMessageRequest): Promise<{ runId: string }>;
    cancelRun(runId: string): Promise<boolean>;
    cancelConversationRun(scope: ConversationScope, runId: string): Promise<boolean>;
    listRuns(): Promise<readonly RunSnapshot[]>;
    listConversationRuns(scope: ConversationScope): Promise<readonly RunSnapshot[]>;
    resolveApproval(approvalId: string, decision: ToolApprovalDecision): Promise<boolean>;
    resolveConversationApproval(scope: ConversationScope, approvalId: string, decision: ToolApprovalDecision): Promise<boolean>;
    getThreadSnapshot(): Promise<ThreadSnapshot>;
    getConversationSnapshot(scope: ConversationScope): Promise<ConversationSnapshot>;
    listMessages(threadId?: string): Promise<readonly MessageDto[]>;
    listConversationMessages(request: ConversationRef): Promise<readonly MessageDto[]>;
    createThread(title: string): Promise<ThreadDto>;
    createConversation(request: CreateConversationRequest): Promise<ThreadDto>;
    switchThread(threadId: string): Promise<ThreadSnapshot>;
    switchConversation(request: ConversationRef): Promise<ConversationSnapshot>;
    deleteThread(threadId: string): Promise<ThreadSnapshot>;
    deleteConversation(request: ConversationRef): Promise<ConversationSnapshot>;
    getProjectSnapshot(): Promise<ProjectSnapshot>;
    getProjectNavigation(projectId: string): Promise<ProjectNavigationSnapshot>;
    getBookWorkspace(projectId: string): Promise<BookWorkspaceSnapshot>;
    createBookChapter(request: CreateBookChapterRequest): Promise<BookWorkspaceSnapshot>;
    createBookVolume(request: CreateBookVolumeRequest): Promise<BookWorkspaceSnapshot>;
    updateBookChapter(request: UpdateBookChapterRequest): Promise<BookWorkspaceSnapshot>;
    saveBookChapterContent(request: SaveBookChapterContentRequest): Promise<BookChapterRevisionResult>;
    getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
    createProject(request: CreateProjectRequest): Promise<WorkspaceSnapshot>;
    openProject(projectPath: string): Promise<WorkspaceSnapshot>;
    openProjectDirectory(projectPath: string): Promise<void>;
    renameProject(request: RenameProjectRequest): Promise<WorkspaceSnapshot>;
    deleteProject(projectPath: string): Promise<WorkspaceSnapshot>;
    switchProject(projectPath: string | null): Promise<WorkspaceSnapshot>;
    removeProject(projectPath: string): Promise<WorkspaceSnapshot>;
    getSkillSnapshot(): Promise<SkillSnapshot>;
    getSkill(skillId: string): Promise<SkillDetail | null>;
    useSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
    disableSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
    clearSkillState(threadId?: string): Promise<ThreadSkillState>;
    onEvent(handler: (event: ConversationApplicationEvent) => void): () => void;
};

export type {
    AgentConfigurationRequest,
    AgentServiceStatus,
    ApplicationEvent,
    BookChapterRevisionResult,
    BookWorkspaceChapterDto,
    BookWorkspaceSnapshot,
    ConversationApplicationEvent,
    ConversationRef,
    ConversationScope,
    ConversationSnapshot,
    CreateConversationRequest,
    CreateBookChapterRequest,
    CreateBookVolumeRequest,
    MessageDto,
    CreateProjectRequest,
    ProjectDto,
    ProjectSnapshot,
    ProjectNavigationSnapshot,
    RenameProjectRequest,
    RunSnapshot,
    SaveBookChapterContentRequest,
    SendConversationMessageRequest,
    SkillDetail,
    SkillSnapshot,
    ThreadDto,
    ThreadSkillState,
    ThreadSnapshot,
    ToolApprovalDecision,
    UpdateBookChapterRequest,
    VolumeDto,
};
