import {
  BookOpen,
  Folder,
  Menu,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { cn } from "../../../lib/utils.ts";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import BookAssistantPanel from "./components/BookAssistantPanel.tsx";
import BookCatalogPanel from "./components/BookCatalogPanel.tsx";
import BookProfilePanel, {
  type BookProfileInput,
} from "./components/BookProfilePanel.tsx";
import ChapterEditorPanel from "./components/ChapterEditorPanel.tsx";
import { formatChineseOrdinal } from "./bookWorkspaceModel.ts";
import type {
  BookPageNavigationTarget,
  BookPageSlice,
} from "./pagination/bookPagination.ts";
import useBookWorkspace from "./useBookWorkspace.ts";

const MIN_ASSISTANT_WIDTH = 300;
const MAX_ASSISTANT_WIDTH = 560;

function getDefaultAssistantWidth(): number {
  if (typeof window === "undefined") return 320;
  return Math.min(
    350,
    Math.max(MIN_ASSISTANT_WIDTH, Math.round(window.innerWidth * 0.17)),
  );
}

function getCatalogPanelWidth(viewportWidth: number): number {
  if (viewportWidth >= 1536) {
    return Math.min(270, Math.max(232, viewportWidth * 0.11));
  }
  if (viewportWidth >= 1024) {
    return Math.min(248, Math.max(216, viewportWidth * 0.12));
  }
  return 0;
}

export default function BookWorkspacePage() {
  const { projectId } = useParams();
  const {
    state,
    activeRun,
    openSidebar,
    switchProject,
    loadProjectNavigation,
    openConversationScope,
    createThread,
    switchThread,
    deleteThread,
    sendMessage,
    cancelRun,
  } = useWorkspaceOutlet();
  const {
    workspace,
    loading: bookLoading,
    error: bookError,
    createBookProfile,
    createVolume,
    createChapter,
    deleteVolume,
    deleteChapter,
    updateBookProfile,
    updateChapterTitle,
    saveChapterContent,
  } = useBookWorkspace(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversation");
  const project = state.projects?.projects.find(
    (item) => item.id === projectId,
  ) ?? null;
  const navigation = projectId
    ? state.projectNavigations[projectId] ?? null
    : null;
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const pageRequestId = useRef(0);
  const [activeChapterPageNumber, setActiveChapterPageNumber] =
    useState<number | null>(null);
  const [pageTarget, setPageTarget] =
    useState<BookPageNavigationTarget | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(true);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const [assistantFocused, setAssistantFocused] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(
    getDefaultAssistantWidth,
  );
  const [assistantResizing, setAssistantResizing] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState("");

  const projectConversationActive =
    state.conversationScope.kind === "project" &&
    state.conversationScope.projectId === projectId;
  const projectConversationSnapshot = projectConversationActive
    ? state.threads
    : navigation?.conversations ?? null;
  const runningThreadIds = new Set(
    state.runs
      .filter((run) => run.status === "running" || run.status === "cancelling")
      .map((run) => run.threadId),
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
      if (state.threads.threads.some((thread) => thread.id === conversationId)) {
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

  useEffect(() => {
    if (!workspace) return;
    if (workspace.state === "uninitialized") {
      if (activeChapterId !== null) setActiveChapterId(null);
      return;
    }
    if (
      activeChapterId &&
      workspace.chapters.some((chapter) => chapter.id === activeChapterId)
    ) return;
    if (activeChapterId !== null) setActiveChapterId(null);
  }, [activeChapterId, workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCatalogVisible((value) => !value);
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAssistantVisible((value) => !value);
        setAssistantFocused(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!projectId || (!state.loading && !project)) {
    return (
      <section className="m-1.5 grid min-h-0 min-w-0 flex-1 place-items-center rounded-xl border border-border bg-white text-sm text-neutral-500">
        项目不存在或已经被移除
      </section>
    );
  }

  if (!project || bookLoading || !workspace) {
    return (
      <section className="m-1.5 grid min-h-0 min-w-0 flex-1 place-items-center rounded-xl border border-border bg-white text-sm text-neutral-400">
        {bookError ?? "正在载入书籍工作区…"}
      </section>
    );
  }

  const scope = { kind: "project", projectId } as const;
  const readyWorkspace = workspace.state === "ready" ? workspace : null;
  const activeChapter = readyWorkspace?.chapters.find(
    (chapter) => chapter.id === activeChapterId,
  ) ?? null;
  const activeVolume = activeChapter?.volumeId
    ? readyWorkspace?.volumes.find(
        (volume) => volume.id === activeChapter.volumeId,
      )
    : null;
  const chapterNumber = activeChapter && activeVolume && readyWorkspace
    ? readyWorkspace.chapters
      .filter((chapter) => chapter.volumeId === activeVolume.id)
      .findIndex((chapter) => chapter.id === activeChapter.id) + 1
    : null;
  const activeVolumeNumber = activeVolume && readyWorkspace
    ? readyWorkspace.volumes.findIndex(
        (volume) => volume.id === activeVolume.id,
      ) + 1
    : null;
  const activeVolumeTitle = activeVolume && activeVolumeNumber !== null
    ? activeVolume.title === `第${activeVolumeNumber}卷`
      ? `第${activeVolumeNumber}卷`
      : `第${activeVolumeNumber}卷 · ${activeVolume.title}`
    : "未分卷";

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
    await sendMessage(content);
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
      snapshot.activeThreadId
        ? { conversation: snapshot.activeThreadId }
        : {},
      { replace: true },
    );
    setAssistantDraft("");
  };

  const selectChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setActiveChapterPageNumber(1);
    setPageTarget(null);
  };

  const showBookOverview = () => {
    setActiveChapterId(null);
    setActiveChapterPageNumber(null);
    setPageTarget(null);
  };

  const selectBookPage = (page: BookPageSlice) => {
    pageRequestId.current += 1;
    setActiveChapterId(page.chapterId);
    setActiveChapterPageNumber(page.chapterPageNumber);
    setPageTarget({
      chapterId: page.chapterId,
      position: page.from,
      chapterPageNumber: page.chapterPageNumber,
      requestId: pageRequestId.current,
    });
  };

  const addVolume = async () => {
    const nextNumber = readyWorkspace
      ? readyWorkspace.volumes.reduce(
          (maximum, volume) => Math.max(maximum, volume.sortOrder),
          -1,
        ) + 2
      : 1;
    await createVolume(formatChineseOrdinal(nextNumber, "卷"));
    await loadProjectNavigation(projectId);
  };

  const addChapter = async (volumeId: string) => {
    if (!readyWorkspace) return;
    const nextNumber = readyWorkspace.chapters
      .filter((chapter) => chapter.volumeId === volumeId)
      .reduce(
        (maximum, chapter) => Math.max(maximum, chapter.sortOrder),
        -1,
      ) + 2;
    const created = await createChapter(
      volumeId,
      formatChineseOrdinal(nextNumber, "章"),
    );
    if (created) selectChapter(created.id);
    await loadProjectNavigation(projectId);
  };

  const removeVolume = async (volumeId: string) => {
    await deleteVolume(volumeId);
    await loadProjectNavigation(projectId);
  };

  const removeChapter = async (chapterId: string) => {
    await deleteChapter(chapterId);
    if (activeChapterId === chapterId) showBookOverview();
    await loadProjectNavigation(projectId);
  };

  const saveBookProfile = async (input: BookProfileInput) => {
    if (workspace.state === "uninitialized") {
      await createBookProfile({
        ...input,
        status: "planning",
      });
      await loadProjectNavigation(projectId);
    } else {
      const titleChanged = input.title !== workspace.book.title;
      await updateBookProfile({
        ...input,
        status: workspace.book.status,
      });
      if (titleChanged) await loadProjectNavigation(projectId);
    }
  };

  const clampAssistantWidth = (width: number): number => {
    const catalogWidth = catalogVisible
      ? getCatalogPanelWidth(window.innerWidth)
      : 0;
    const availableMaximum = Math.max(
      MIN_ASSISTANT_WIDTH,
      window.innerWidth - 240 - catalogWidth - 420,
    );
    return Math.min(
      Math.max(width, MIN_ASSISTANT_WIDTH),
      Math.min(MAX_ASSISTANT_WIDTH, availableMaximum),
    );
  };

  const startAssistantResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = assistantWidth;
    setAssistantResizing(true);
    handle.setPointerCapture(event.pointerId);
    const resize = (moveEvent: PointerEvent) => {
      setAssistantWidth(clampAssistantWidth(
        startWidth + startX - moveEvent.clientX,
      ));
    };
    const finish = () => {
      setAssistantResizing(false);
      handle.removeEventListener("pointermove", resize);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };
    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  return (
    <section className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 border-border bg-white sm:m-1.5 sm:rounded-xl sm:border lg:ml-2 2xl:mr-3">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-2 sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-1">
          <button className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100 lg:hidden" type="button" aria-label="打开侧栏" onClick={openSidebar}><Menu size={19} /></button>
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <span
              className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-lg bg-neutral-100 px-2 text-neutral-500"
              title={`项目名称：${project.name}`}
            >
              <Folder className="shrink-0" size={12} />
              <span className="hidden text-[9px] text-neutral-400 sm:inline">
                项目
              </span>
              <strong className="truncate text-[11px] font-semibold text-neutral-700">
                {project.name}
              </strong>
            </span>
            <span className="text-neutral-300">/</span>
            <button
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1 text-left transition",
                workspace.state === "ready"
                  ? "max-w-44 font-medium text-neutral-700 hover:bg-violet-50 hover:text-violet-700"
                  : "text-neutral-400",
              )}
              type="button"
              title={readyWorkspace ? "查看书籍概览" : "请先设置书名"}
              disabled={!readyWorkspace}
              aria-current={readyWorkspace && !activeChapter ? "page" : undefined}
              onClick={showBookOverview}
            >
              <BookOpen className="shrink-0" size={12} />
              <span className="truncate">
                {readyWorkspace ? `《${readyWorkspace.book.title}》` : "待命名"}
              </span>
            </button>
            {readyWorkspace && (
              <>
                <span className="text-neutral-300">/</span>
                <span className="text-neutral-400">
                  {activeChapter ? activeVolumeTitle : "书籍概览"}
                </span>
              </>
            )}
            {chapterNumber !== null && (
              <>
                <span className="text-neutral-300">/</span>
                <span className="truncate text-neutral-600">第{chapterNumber}章</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-[10px] text-neutral-500 sm:flex">
            <i className={cn("size-1.5 rounded-full", state.status?.initialized ? "bg-emerald-500" : "bg-neutral-400")} />
            {state.status?.initialized ? "已连接" : "未配置"}
          </span>
          <button className={cn("grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100", catalogVisible && "bg-neutral-100")} type="button" title="显示或隐藏目录 (Ctrl+B)" aria-label="显示或隐藏目录" aria-pressed={catalogVisible} onClick={() => setCatalogVisible((value) => !value)}><PanelLeft size={17} /></button>
          <button className={cn("grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-neutral-100", assistantVisible && "bg-neutral-100")} type="button" title="显示或隐藏 AI (Ctrl+J)" aria-label="显示或隐藏 AI" aria-pressed={assistantVisible} onClick={() => {
            setAssistantVisible((value) => !value);
            setAssistantFocused(false);
          }}><PanelRight size={17} /></button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#f6f6f4]">
        {catalogVisible && !assistantFocused && (
          <BookCatalogPanel
            bookTitle={readyWorkspace?.book.title ?? null}
            volumes={readyWorkspace?.volumes ?? []}
            chapters={readyWorkspace?.chapters ?? []}
            activeChapterId={activeChapter?.id ?? null}
            activeChapterPageNumber={activeChapterPageNumber}
            onSelectChapter={selectChapter}
            onSelectPage={selectBookPage}
            onCreateVolume={readyWorkspace ? addVolume : null}
            onCreateChapter={addChapter}
            onShowOverview={showBookOverview}
            onDeleteVolume={removeVolume}
            onDeleteChapter={removeChapter}
            onClose={() => setCatalogVisible(false)}
          />
        )}

        {!assistantFocused && workspace.state === "uninitialized" && (
          <BookProfilePanel
            book={null}
            volumeCount={0}
            chapterCount={0}
            characterCount={0}
            onSave={saveBookProfile}
          />
        )}

        {!assistantFocused && readyWorkspace &&
          activeChapter && chapterNumber !== null && (
          <ChapterEditorPanel
            chapter={activeChapter}
            chapterNumber={chapterNumber}
            volumeTitle={activeVolumeTitle}
            pageTarget={pageTarget?.chapterId === activeChapter.id
              ? pageTarget
              : null}
            onPageChange={setActiveChapterPageNumber}
            onSaveTitle={(title) =>
              updateChapterTitle(activeChapter.id, title)}
            onSaveContent={(content) =>
              saveChapterContent(activeChapter.id, content)}
            onAskAi={(prompt) => {
              setAssistantDraft(prompt);
              setAssistantVisible(true);
            }}
          />
        )}

        {!assistantFocused && readyWorkspace && !activeChapter && (
          <BookProfilePanel
            book={readyWorkspace.book}
            volumeCount={readyWorkspace.volumes.length}
            chapterCount={readyWorkspace.chapters.length}
            characterCount={readyWorkspace.chapters.reduce(
              (total, chapter) => total + chapter.characterCount,
              0,
            )}
            onSave={saveBookProfile}
          />
        )}

        {assistantVisible && (
          <>
            {!assistantFocused && (
              <div className={cn("group relative z-20 hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent xl:block", assistantResizing && "bg-violet-50")} role="separator" tabIndex={0} aria-label="调整 AI 对话宽度" aria-orientation="vertical" aria-valuemin={MIN_ASSISTANT_WIDTH} aria-valuemax={MAX_ASSISTANT_WIDTH} aria-valuenow={Math.round(assistantWidth)} onPointerDown={startAssistantResize} onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setAssistantWidth((width) => clampAssistantWidth(width + 16));
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setAssistantWidth((width) => clampAssistantWidth(width - 16));
                }
              }}>
                <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-200 transition-colors group-hover:bg-violet-400 group-focus-visible:bg-violet-500", assistantResizing && "w-0.5 bg-violet-500")} />
              </div>
            )}
            <BookAssistantPanel
              projectName={project.name}
              bookTitle={readyWorkspace?.book.title ?? null}
              chapterNumber={chapterNumber}
              chapterTitle={activeChapter?.title ?? null}
              conversationSnapshot={projectConversationSnapshot}
              runningThreadIds={runningThreadIds}
              messages={projectConversationActive ? state.messages : []}
              connected={Boolean(state.status?.initialized)}
              running={projectConversationActive && Boolean(activeRun)}
              focused={assistantFocused}
              width={assistantWidth}
              draft={assistantDraft}
              onDraftChange={setAssistantDraft}
              onSend={sendAssistantMessage}
              onCancel={async () => {
                if (activeRun) await cancelRun(activeRun.runId);
              }}
              onCreateConversation={createProjectConversation}
              onSwitchConversation={switchProjectConversation}
              onDeleteConversation={deleteProjectConversation}
              onToggleFocus={() => {
                setAssistantFocused((value) => !value);
                setAssistantVisible(true);
              }}
            />
          </>
        )}

        {bookError && (
          <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-lg">{bookError}</div>
        )}
      </div>
    </section>
  );
}
