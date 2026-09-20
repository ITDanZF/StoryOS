import useBookConversations from "./useBookConversations.ts";
import { Toast } from "../../components/ui/Notice.tsx";
import { hasOpenDialog, isEditableTarget } from "../../lib/keyboard.ts";
import useBookNavigation from "./useBookNavigation.ts";
import useBookWorkspaceLayout from "./useBookWorkspaceLayout.ts";
import BookWorkspaceHeader from "./components/BookWorkspaceHeader.tsx";
import { PageSurface } from "../../components/layout/PageSurface.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useParams } from "react-router-dom";
import { cn } from "../../../lib/utils.ts";
import { useWorkspaceOutlet } from "../../layouts/workspace/context.ts";
import BookAssistantPanel from "./components/BookAssistantPanel.tsx";
import BookCatalogPanel from "./components/BookCatalogPanel.tsx";
import BookProfilePanel, {
  type BookProfileInput,
} from "./components/BookProfilePanel.tsx";
import ChapterEditorPanel from "./components/ChapterEditorPanel.tsx";
import {
  createBookChapterGroups,
  findBookChapterLocation,
  formatChineseOrdinal,
} from "./bookWorkspaceModel.ts";
import useBookWorkspace from "./useBookWorkspace.ts";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./editor/chapterEditorContext.ts";
import useBookEditorToolHandler from "./ai/useBookEditorToolHandler.ts";
import useBookMutationSync from "./ai/useBookMutationSync.ts";
import useChapterGenerationPreview from "./ai/useChapterGenerationPreview.ts";

export default function BookWorkspacePage() {
  const { projectId } = useParams();
  const { state, activeRun, openSidebar, loadProjectNavigation, cancelRun } =
    useWorkspaceOutlet();
  const {
    workspace,
    error: bookError,
    load: reloadBookWorkspace,
    createBookProfile,
    createVolume,
    createChapter,
    deleteVolume,
    deleteChapter,
    updateBookProfile,
    updateChapterTitle,
    saveChapterContent,
    saveChapterDraft,
    loadChapter,
  } = useBookWorkspace(projectId);
  const project =
    state.projects?.projects.find((item) => item.id === projectId) ?? null;
  const {
    activeChapterId,
    activeChapterPageNumber,
    setActiveChapterPageNumber,
    pageTarget,
    livePagination,
    setLivePagination,
    openChapterFromTool,
    selectChapter,
    showBookOverview,
    selectBookPage,
    createBookPage,
    moveBookPage,
    deleteBookPage,
  } = useBookNavigation();
  const {
    containerRef,
    catalog,
    assistant,
    catalogVisible,
    setCatalogVisible,
    assistantVisible,
    setAssistantVisible,
    assistantFocused,
    setAssistantFocused,
  } = useBookWorkspaceLayout();
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantContextEnabled, setAssistantContextEnabled] = useState(true);
  // The live editor context is only read when a turn is sent. Keeping it in a
  // ref prevents caret moves and editor updates from re-rendering the entire
  // workspace, including the outline and assistant panel.
  const editorContextRef = useRef<ChapterEditorLiveContext | null>(null);
  const editorBridgeRef = useRef<ChapterEditorBridge | null>(null);
  const settingsBlocker = useBlocker(
    ({ nextLocation }) =>
      Boolean(editorBridgeRef.current) &&
      ["/settings", "/developer"].includes(nextLocation.pathname),
  );
  useEffect(() => {
    if (settingsBlocker.state !== "blocked") return;
    void editorBridgeRef.current
      .flushPending()
      .then(() => settingsBlocker.proceed())
      .catch(() => settingsBlocker.reset()); // The chapter save hook displays the persistence error.
  }, [settingsBlocker]);
  const readyWorkspace = workspace?.state === "ready" ? workspace : null;
  const chapterGroups = useMemo(
    () =>
      createBookChapterGroups(
        readyWorkspace?.volumes ?? [],
        readyWorkspace?.chapters ?? [],
      ),
    [readyWorkspace],
  );
  const activeChapterLocation = findBookChapterLocation(
    chapterGroups,
    activeChapterId,
  );
  const activeChapter = activeChapterLocation?.chapter ?? null;
  const chapterLoading = useRef<string | null>(null);
  useEffect(() => {
    if (
      !activeChapter ||
      activeChapter.contentLoaded ||
      chapterLoading.current === activeChapter.id
    )
      return;
    chapterLoading.current = activeChapter.id;
    void loadChapter(activeChapter.id)
      .catch((): void => undefined)
      .finally(() => {
        chapterLoading.current = null;
      });
  }, [
    activeChapter?.id,
    activeChapter?.currentRevisionId,
    activeChapter?.contentLoaded,
    loadChapter,
  ]);
  const activeVolume = activeChapterLocation?.group.volume ?? null;
  const chapterNumber = activeChapterLocation?.chapterNumber ?? null;
  const activeVolumeNumber = activeVolume
    ? chapterGroups
        .filter((group) => group.kind === "volume")
        .findIndex((group) => group.volume?.id === activeVolume.id) + 1
    : null;
  const activeVolumeTitle =
    activeVolume && activeVolumeNumber !== null
      ? activeVolume.title === `第${activeVolumeNumber}卷`
        ? `第${activeVolumeNumber}卷`
        : `第${activeVolumeNumber}卷 · ${activeVolume.title}`
      : "未分卷";

  const currentChapterGeneration = useMemo(
    () =>
      Object.values(state.chapterGenerations)
        .filter((generation) => generation.projectId === projectId)
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
        .at(-1) ?? null,
    [projectId, state.chapterGenerations],
  );

  useEffect(() => {
    if (!workspace) return;
    if (workspace.state === "uninitialized") {
      if (activeChapterId !== null) showBookOverview();
      return;
    }
    if (
      activeChapterId &&
      workspace.chapters.some((chapter) => chapter.id === activeChapterId)
    )
      return;
    if (activeChapterId !== null) showBookOverview();
  }, [activeChapterId, workspace]);

  useEffect(() => {
    setAssistantContextEnabled(true);
    editorContextRef.current = null;
  }, [activeChapterId]);

  const aiPreviewContent = useChapterGenerationPreview({
    generation: currentChapterGeneration,
    workspace,
    reloadWorkspace: reloadBookWorkspace,
    openChapter: openChapterFromTool,
  });

  useBookEditorToolHandler({
    projectId,
    projectName: project?.name ?? null,
    workspace: readyWorkspace,
    activeChapter,
    chapterNumber,
    volumeTitle: activeVolumeTitle,
    pageNumber: activeChapterPageNumber,
    editorBridgeRef,
    openChapter: openChapterFromTool,
    reloadWorkspace: reloadBookWorkspace,
  });
  useBookMutationSync({
    projectId,
    changeVersion: projectId ? (state.bookChangeVersions[projectId] ?? 0) : 0,
    reloadWorkspace: reloadBookWorkspace,
    reloadNavigation: loadProjectNavigation,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        hasOpenDialog() ||
        isEditableTarget(event.target)
      )
        return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      )
        return;
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

  const {
    projectConversationActive,
    projectConversationSnapshot,
    runningThreadIds,
    pendingApprovals,
    sendAssistantMessage,
    resolveBookApproval,
    createProjectConversation,
    switchProjectConversation,
    deleteProjectConversation,
  } = useBookConversations({
    projectId,
    project,
    activeChapter,
    readyWorkspace,
    chapterNumber,
    activeVolumeTitle,
    activeChapterPageNumber,
    editorBridgeRef,
    editorContextRef,
    assistantContextEnabled,
    reloadBookWorkspace,
    loadChapter,
    setAssistantDraft,
    setAssistantVisible,
  });

  if (!projectId || (!state.loading && !project)) {
    return (
      <section className="m-1.5 grid min-h-0 min-w-0 flex-1 place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        项目不存在或已经被移除
      </section>
    );
  }

  if (!project || !workspace) {
    return (
      <section className="m-1.5 grid min-h-0 min-w-0 flex-1 place-items-center rounded-xl border border-border bg-card text-sm text-text-subtle">
        {bookError ?? "正在载入书籍工作区…"}
      </section>
    );
  }

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
    const nextNumber =
      readyWorkspace.chapters
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

  return (
    <PageSurface>
      <BookWorkspaceHeader
        projectName={project.name}
        bookTitle={readyWorkspace?.book.title ?? null}
        hasBook={Boolean(readyWorkspace)}
        chapterSelected={Boolean(activeChapter)}
        chapterNumber={chapterNumber}
        activeVolumeTitle={activeVolumeTitle}
        connected={Boolean(state.status?.initialized)}
        catalogVisible={catalogVisible}
        assistantVisible={assistantVisible}
        openSidebar={openSidebar}
        showBookOverview={showBookOverview}
        setCatalogVisible={setCatalogVisible}
        setAssistantVisible={setAssistantVisible}
        setAssistantFocused={setAssistantFocused}
      />

      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-canvas"
      >
        {catalogVisible && !assistantFocused && (
          <BookCatalogPanel
            resize={catalog}
            bookTitle={readyWorkspace?.book.title ?? null}
            groups={chapterGroups}
            activeChapterId={activeChapter?.id ?? null}
            activeChapterPageNumber={activeChapterPageNumber}
            livePagination={livePagination}
            onSelectChapter={selectChapter}
            onSelectPage={selectBookPage}
            onCreatePage={createBookPage}
            onMovePage={moveBookPage}
            onDeletePage={deleteBookPage}
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

        {!assistantFocused && activeChapter && !activeChapter.contentLoaded && (
          <div
            role="status"
            className="motion-reveal grid flex-1 place-items-center text-sm text-muted-foreground"
          >
            {bookError ?? "正在载入章节正文…"}
          </div>
        )}
        {!assistantFocused &&
          readyWorkspace &&
          activeChapter &&
          activeChapter.contentLoaded &&
          chapterNumber !== null && (
            <ChapterEditorPanel
              chapter={activeChapter}
              aiGenerating={
                currentChapterGeneration?.chapterId === activeChapter.id &&
                currentChapterGeneration.status === "streaming"
              }
              aiPreviewContent={
                currentChapterGeneration?.chapterId === activeChapter.id
                  ? aiPreviewContent
                  : null
              }
              chapterNumber={chapterNumber}
              volumeTitle={activeVolumeTitle}
              pageTarget={
                pageTarget?.chapterId === activeChapter.id ? pageTarget : null
              }
              onPageChange={setActiveChapterPageNumber}
              onPaginationChange={(layoutKey, pages) => {
                setLivePagination({
                  chapterId: activeChapter.id,
                  layoutKey,
                  pages,
                });
              }}
              onSaveTitle={(title) =>
                updateChapterTitle(activeChapter.id, title)
              }
              onSaveDraft={(content, base) =>
                saveChapterDraft(activeChapter.id, content, base)
              }
              onSaveContent={(content, expectedCurrentRevisionId) =>
                saveChapterContent(
                  activeChapter.id,
                  content,
                  expectedCurrentRevisionId,
                )
              }
              onAskAi={(prompt) => {
                setAssistantDraft(prompt);
                setAssistantVisible(true);
              }}
              onEditorContextChange={(context) => {
                editorContextRef.current = context;
              }}
              onEditorBridgeChange={(bridge) => {
                editorBridgeRef.current = bridge;
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
              <div
                className={cn(
                  "group relative z-20 hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent xl:block",
                  assistant.resizing && "bg-accent",
                )}
                {...assistant.handleProps}
                aria-label="调整 AI 对话宽度"
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-accent group-focus-visible:bg-accent",
                    assistant.resizing && "w-0.5 bg-accent",
                  )}
                />
              </div>
            )}
            <BookAssistantPanel
              projectName={project.name}
              bookTitle={readyWorkspace?.book.title ?? null}
              chapterNumber={chapterNumber}
              chapterTitle={activeChapter?.title ?? null}
              conversationSnapshot={projectConversationSnapshot}
              runningThreadIds={runningThreadIds}
              connected={Boolean(state.status?.initialized)}
              running={projectConversationActive && Boolean(activeRun)}
              focused={assistantFocused}
              width={assistant.width}
              draft={assistantDraft}
              contextEnabled={assistantContextEnabled}
              pendingApproval={pendingApprovals[0] ?? null}
              onDraftChange={setAssistantDraft}
              onContextEnabledChange={setAssistantContextEnabled}
              onSend={sendAssistantMessage}
              onCancel={async () => {
                if (activeRun) await cancelRun(activeRun.runId);
              }}
              onResolveApproval={resolveBookApproval}
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

        {bookError && <Toast tone="danger">{bookError}</Toast>}
      </div>
    </PageSurface>
  );
}
