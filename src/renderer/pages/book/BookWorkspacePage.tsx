import {
  BookPlus,
  Menu,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { cn } from "../../../lib/utils.ts";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import BookAssistantPanel from "./components/BookAssistantPanel.tsx";
import BookCatalogPanel from "./components/BookCatalogPanel.tsx";
import ChapterEditorPanel from "./components/ChapterEditorPanel.tsx";
import useBookWorkspace from "./useBookWorkspace.ts";

const MIN_ASSISTANT_WIDTH = 300;
const DEFAULT_ASSISTANT_WIDTH = 350;
const MAX_ASSISTANT_WIDTH = 560;

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
    sendMessage,
    cancelRun,
  } = useWorkspaceOutlet();
  const {
    workspace,
    loading: bookLoading,
    error: bookError,
    createVolume,
    createChapter,
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
  const [catalogVisible, setCatalogVisible] = useState(true);
  const [assistantVisible, setAssistantVisible] = useState(true);
  const [assistantFocused, setAssistantFocused] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(
    DEFAULT_ASSISTANT_WIDTH,
  );
  const [assistantResizing, setAssistantResizing] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState("");

  const projectConversationActive =
    state.conversationScope.kind === "project" &&
    state.conversationScope.projectId === projectId;

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
    if (
      activeChapterId &&
      workspace.chapters.some((chapter) => chapter.id === activeChapterId)
    ) return;
    setActiveChapterId(workspace.chapters[0]?.id ?? null);
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
  const activeChapter = workspace.chapters.find(
    (chapter) => chapter.id === activeChapterId,
  ) ?? null;
  const chapterNumber = activeChapter
    ? workspace.chapters.findIndex((chapter) => chapter.id === activeChapter.id) + 1
    : null;
  const activeVolume = activeChapter?.volumeId
    ? workspace.volumes.find((volume) => volume.id === activeChapter.volumeId)
    : null;
  const activeVolumeTitle = activeVolume?.title ?? "未分卷";

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
    setAssistantVisible(true);
  };

  const addVolume = async () => {
    const defaultTitle = `第${workspace.volumes.length + 1}卷`;
    const title = window.prompt("请输入卷名", defaultTitle)?.trim();
    if (!title) return;
    await createVolume(title);
    await loadProjectNavigation(projectId);
  };

  const addChapter = async (volumeId: string | null) => {
    const created = await createChapter(volumeId);
    if (created) setActiveChapterId(created.id);
    await loadProjectNavigation(projectId);
  };

  const clampAssistantWidth = (width: number): number => {
    const catalogWidth = catalogVisible ? 248 : 0;
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
          <div className="flex min-w-0 items-center gap-2 text-xs sm:text-[13px]">
            <strong className="truncate">{project.name}</strong>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-400">{activeChapter ? activeVolumeTitle : workspace.book.title}</span>
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
            bookTitle={workspace.book.title}
            volumes={workspace.volumes}
            chapters={workspace.chapters}
            activeChapterId={activeChapter?.id ?? null}
            onSelectChapter={setActiveChapterId}
            onCreateVolume={addVolume}
            onCreateChapter={addChapter}
            onClose={() => setCatalogVisible(false)}
          />
        )}

        {!assistantFocused && activeChapter && chapterNumber !== null && (
          <ChapterEditorPanel
            chapter={activeChapter}
            chapterNumber={chapterNumber}
            volumeTitle={activeVolumeTitle}
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

        {!assistantFocused && !activeChapter && (
          <div className="grid min-h-0 min-w-0 flex-1 place-items-center bg-[#f6f6f4] p-6 text-center">
            <div>
              <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-neutral-200"><BookPlus size={22} /></span>
              <h2 className="m-0 text-base font-semibold text-neutral-800">开始你的第一章</h2>
              <p className="mt-2 text-xs leading-5 text-neutral-400">当前书籍还没有章节，正文和修订记录会保存在项目 SQLite 中。</p>
              <div className="mt-5 flex justify-center gap-2">
                <button className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-xs font-medium text-neutral-700 hover:bg-neutral-50" type="button" onClick={() => void addVolume()}>新建第一卷</button>
                <button className="h-9 rounded-lg border-0 bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-violet-700" type="button" onClick={() => void addChapter(null)}>新建第一章</button>
              </div>
            </div>
          </div>
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
              chapterNumber={chapterNumber}
              chapterTitle={activeChapter?.title ?? null}
              conversationTitle={projectConversationActive
                ? state.threads?.activeThread?.title ?? "项目对话"
                : "正在载入项目对话…"}
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
