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
import type { ConversationTurnContext } from "../agent/application/conversationTurnContext.ts";
import type { AgentConfigurationRequest } from "../agent/StoryAgentService.ts";
import type { ToolApprovalDecision } from "../agent/security/ToolPolicy.ts";
import type {
    CreateBookChapterRequest,
    CreateBookRequest,
    CreateBookVolumeRequest,
    DeleteBookChapterRequest,
    DeleteBookVolumeRequest,
    SaveBookChapterContentRequest,
    UpdateBookRequest,
    UpdateBookChapterRequest,
} from "../agent/application/bookWorkspaceContracts.ts";
import type { NovelStatus } from "../agent/application/novelPorts.ts";
import type RendererEditorToolBridge from "../agent/electron/RendererEditorToolBridge.ts";
import type { RendererEditorToolResponse } from "../agent/tools/editor/contracts.ts";

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

function requireContent(value: unknown): string {
    if (typeof value !== "string") {
        throw new Error("Chapter content must be a string.");
    }
    return value;
}

function requireNullableRevisionId(value: unknown): string | null {
    if (value === null) return null;
    return requireText(value, "Expected chapter revision id");
}

function requireConversationTurnContext(
    value: ConversationTurnContext,
): ConversationTurnContext {
    if (!value || typeof value !== "object" || value.kind !== "book_editor") {
        throw new Error("Invalid conversation context.");
    }
    const book = value.book === null ? null : Object.freeze({
        id: requireText(value.book?.id, "Book id"),
        title: requireText(value.book?.title, "Book title"),
    });
    const chapter = value.chapter === null ? null : Object.freeze({
        id: requireText(value.chapter?.id, "Chapter id"),
        title: requireText(value.chapter?.title, "Chapter title"),
        number: requirePositiveInteger(value.chapter?.number, "Chapter number"),
        volumeTitle: requireText(value.chapter?.volumeTitle, "Volume title"),
        revisionNumber: value.chapter?.revisionNumber === null
            ? null
            : requirePositiveInteger(value.chapter?.revisionNumber, "Revision number"),
        pageNumber: value.chapter?.pageNumber === null
            ? null
            : requirePositiveInteger(value.chapter?.pageNumber, "Page number"),
        documentText: requireString(value.chapter?.documentText, "Chapter text"),
        selection: value.chapter?.selection === null ? null : Object.freeze({
            from: requireNonNegativeInteger(value.chapter?.selection?.from, "Selection start"),
            to: requireNonNegativeInteger(value.chapter?.selection?.to, "Selection end"),
            text: requireText(value.chapter?.selection?.text, "Selection text"),
        }),
    });
    if (chapter?.selection && chapter.selection.to <= chapter.selection.from) {
        throw new Error("Selection end must be after selection start.");
    }
    return Object.freeze({
        kind: "book_editor",
        projectId: requireText(value.projectId, "Project id"),
        projectName: requireText(value.projectName, "Project name"),
        book,
        chapter,
    });
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== "string") throw new Error(`${label} must be a string.`);
    return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
    if (!Number.isInteger(value) || (value as number) < 0) {
        throw new Error(`${label} must be a non-negative integer.`);
    }
    return value as number;
}

function requirePositiveInteger(value: unknown, label: string): number {
    const result = requireNonNegativeInteger(value, label);
    if (result === 0) throw new Error(`${label} must be a positive integer.`);
    return result;
}

function requireNovelStatus(value: unknown): NovelStatus {
    if (!["planning", "writing", "completed", "archived"].includes(
        value as string,
    )) {
        throw new Error("Invalid book status.");
    }
    return value as NovelStatus;
}

export function registerAgentIpc(
    service: StoryAgentService,
    rendererEditorTools?: RendererEditorToolBridge,
): () => void {
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
            ...(request?.context === undefined
                ? {}
                : { context: requireConversationTurnContext(request.context) }),
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
    handle(AGENT_IPC_CHANNELS.listConversationEvents, (request: ConversationRef) =>
        service.requireController().listConversationEvents(requireConversationRef(request)));
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
    handle(AGENT_IPC_CHANNELS.bookWorkspace, (projectId: string) =>
        service.requireController().getBookWorkspace(
            requireText(projectId, "Project id"),
        ));
    handle(AGENT_IPC_CHANNELS.createBook, (
        request: CreateBookRequest,
    ) => service.requireController().createBook({
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Book title"),
        synopsis: requireContent(request?.synopsis),
        status: requireNovelStatus(request?.status),
    }));
    handle(AGENT_IPC_CHANNELS.createBookChapter, (
        request: CreateBookChapterRequest,
    ) => service.requireController().createBookChapter({
        projectId: requireText(request?.projectId, "Project id"),
        volumeId: requireText(request?.volumeId, "Volume id"),
        title: requireText(request?.title, "Chapter title"),
    }));
    handle(AGENT_IPC_CHANNELS.createBookVolume, (
        request: CreateBookVolumeRequest,
    ) => service.requireController().createBookVolume({
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Volume title"),
    }));
    handle(AGENT_IPC_CHANNELS.deleteBookVolume, (
        request: DeleteBookVolumeRequest,
    ) => service.requireController().deleteBookVolume({
        projectId: requireText(request?.projectId, "Project id"),
        volumeId: requireText(request?.volumeId, "Volume id"),
    }));
    handle(AGENT_IPC_CHANNELS.deleteBookChapter, (
        request: DeleteBookChapterRequest,
    ) => service.requireController().deleteBookChapter({
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
    }));
    handle(AGENT_IPC_CHANNELS.updateBook, (
        request: UpdateBookRequest,
    ) => service.requireController().updateBook({
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Book title"),
        synopsis: requireContent(request?.synopsis),
        status: requireNovelStatus(request?.status),
    }));
    handle(AGENT_IPC_CHANNELS.updateBookChapter, (
        request: UpdateBookChapterRequest,
    ) => service.requireController().updateBookChapter({
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
        title: requireText(request?.title, "Chapter title"),
    }));
    handle(AGENT_IPC_CHANNELS.saveBookChapterContent, (
        request: SaveBookChapterContentRequest,
    ) => service.requireController().saveBookChapterContent({
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
        content: requireContent(request?.content),
        expectedCurrentRevisionId: requireNullableRevisionId(
            request?.expectedCurrentRevisionId,
        ),
    }));
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
    const onEditorToolResponse = (
        _event: Electron.IpcMainEvent,
        response: RendererEditorToolResponse,
    ) => rendererEditorTools?.acceptResponse(response);
    ipcMain.on(AGENT_IPC_CHANNELS.editorToolResponse, onEditorToolResponse);

    return () => {
        unsubscribe();
        ipcMain.removeListener(
            AGENT_IPC_CHANNELS.editorToolResponse,
            onEditorToolResponse,
        );
        for (const channel of registeredChannels) ipcMain.removeHandler(channel);
    };
}
