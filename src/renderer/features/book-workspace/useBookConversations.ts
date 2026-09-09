import {
  useEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "react-router-dom";
import type {
  ProjectDto,
  BookWorkspaceChapterDto,
  ReadyBookWorkspaceSnapshot,
  ConversationTurnContext,
  ToolApprovalDecision,
} from "../../../shared/agent/contracts.ts";
import {
  decodeStoredChapterContent,
  extractTiptapText,
} from "../../../shared/book/richText.ts";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./editor/chapterEditorContext.ts";
import type useBookWorkspace from "./useBookWorkspace.ts";

type Input = {
  projectId: string | undefined;
  project: ProjectDto | null;
  activeChapter: BookWorkspaceChapterDto | null;
  readyWorkspace: ReadyBookWorkspaceSnapshot | null;
  chapterNumber: number | null;
  activeVolumeTitle: string;
  activeChapterPageNumber: number | null;
  editorBridgeRef: RefObject<ChapterEditorBridge | null>;
  editorContext: ChapterEditorLiveContext | null;
  assistantContextEnabled: boolean;
  reloadBookWorkspace: ReturnType<typeof useBookWorkspace>["load"];
  loadChapter: ReturnType<typeof useBookWorkspace>["loadChapter"];
  setAssistantDraft: Dispatch<SetStateAction<string>>;
  setAssistantVisible: Dispatch<SetStateAction<boolean>>;
};
/** Adapts existing conversation APIs to this workspace; does not own editor content. */
export default function useBookConversations({
  projectId,
  project,
  activeChapter,
  readyWorkspace,
  chapterNumber,
  activeVolumeTitle,
  activeChapterPageNumber,
  editorBridgeRef,
  editorContext,
  assistantContextEnabled,
  reloadBookWorkspace,
  loadChapter,
  setAssistantDraft,
  setAssistantVisible,
}: Input) {
  const {
    state,
    switchProject,
    loadProjectNavigation,
    openConversationScope,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
    resolveApproval,
  } = useWorkspaceOutlet();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversation");
  const navigation = projectId ? state.projectNavigations[projectId] : null;
  const projectConversationActive =
    state.conversationScope.kind === "project" &&
    state.conversationScope.projectId === projectId;
  const projectConversationSnapshot = projectConversationActive
    ? state.threads
    : (navigation?.conversations ?? null);
  const runningThreadIds = new Set(
    state.runs
      .filter((run) => run.status === "running" || run.status === "cancelling")
      .map((run) => run.threadId),
  );
  const activeConversationThreadId =
    projectConversationSnapshot?.activeThreadId ?? "";
  const pendingApprovals = state.pendingApprovals.filter(
    (approval) => approval.threadId === activeConversationThreadId,
  );
  useEffect(() => {
    if (!project || !projectId) return;
    const scope = { kind: "project", projectId } as const;
    if (state.projects?.activeProjectId !== projectId) {
      void switchProject(project.path);
      return;
    }
    if (!projectConversationActive) void openConversationScope(scope);
    if (!navigation) void loadProjectNavigation(projectId);
  }, [
    loadProjectNavigation,
    navigation,
    openConversationScope,
    project,
    projectConversationActive,
    projectId,
    state.projects?.activeProjectId,
    switchProject,
  ]);

  useEffect(() => {
    if (!projectId || !projectConversationActive || !state.threads) return;
    if (conversationId) {
      if (conversationId === state.threads.activeThreadId) return;
      if (
        state.threads.threads.some((thread) => thread.id === conversationId)
      ) {
        void switchThread(conversationId, {
          kind: "project",
          projectId,
        });
        return;
      }
      setSearchParams({}, { replace: true });
      return;
    }
    if (state.threads.activeThreadId) {
      setSearchParams(
        { conversation: state.threads.activeThreadId },
        { replace: true },
      );
    }
  }, [
    conversationId,
    projectConversationActive,
    projectId,
    setSearchParams,
    state.threads,
    switchThread,
  ]);

  const scope = { kind: "project", projectId } as const;
  const ensureProjectConversation = async () => {
    if (!projectConversationActive) {
      const snapshot = await openConversationScope(scope);
      if (!snapshot.activeThreadId) {
        const thread = await createThread(scope);
        setSearchParams({ conversation: thread.id });
      }
      return;
    }
    if (!state.threads?.activeThreadId) {
      const thread = await createThread(scope);
      setSearchParams({ conversation: thread.id });
    }
  };

  const sendAssistantMessage = async (content: string) => {
    await ensureProjectConversation();
    await editorBridgeRef.current?.flushPending();
    if (activeChapter) await reloadBookWorkspace();
    const refreshedChapter = activeChapter
      ? await loadChapter(activeChapter.id)
      : null;
    const liveEditorContext =
      editorBridgeRef.current?.getContext() ?? editorContext;
    const context: ConversationTurnContext = {
      kind: "book_editor",
      projectId,
      projectName: project.name,
      book: readyWorkspace
        ? { id: readyWorkspace.book.id, title: readyWorkspace.book.title }
        : null,
      chapter:
        assistantContextEnabled && refreshedChapter && chapterNumber !== null
          ? {
              id: refreshedChapter.id,
              title: refreshedChapter.title,
              number: chapterNumber,
              volumeTitle: activeVolumeTitle,
              revisionNumber: refreshedChapter.revisionNumber,
              pageNumber: activeChapterPageNumber,
              documentText:
                liveEditorContext?.documentText ??
                extractTiptapText(
                  decodeStoredChapterContent(refreshedChapter.content),
                ),
              selection: liveEditorContext?.selection ?? null,
            }
          : null,
    };
    await sendMessage(content, context);
  };

  const resolveBookApproval = async (
    approvalId: string,
    decision: ToolApprovalDecision,
  ) => {
    const approval = pendingApprovals.find(
      (item) => item.approvalId === approvalId,
    );
    if (
      approval?.toolName === "generate_book_chapter_content" &&
      decision !== "deny"
    ) {
      await editorBridgeRef.current?.flushPending();
    }
    await resolveApproval(approvalId, decision);
  };

  const createProjectConversation = async () => {
    const thread = await createThread(scope);
    setSearchParams({ conversation: thread.id });
    setAssistantDraft("");
    setAssistantVisible(true);
  };

  const switchProjectConversation = async (threadId: string) => {
    if (threadId === projectConversationSnapshot?.activeThreadId) return;
    await switchThread(threadId, scope);
    setSearchParams({ conversation: threadId });
    setAssistantDraft("");
    setAssistantVisible(true);
  };

  const deleteProjectConversation = async (threadId: string) => {
    const snapshot = await deleteThread(threadId, scope);
    setSearchParams(
      snapshot.activeThreadId ? { conversation: snapshot.activeThreadId } : {},
      { replace: true },
    );
    setAssistantDraft("");
  };

  return {
    projectConversationActive,
    projectConversationSnapshot,
    runningThreadIds,
    pendingApprovals,
    sendAssistantMessage,
    resolveBookApproval,
    createProjectConversation,
    switchProjectConversation,
    deleteProjectConversation,
  };
}
