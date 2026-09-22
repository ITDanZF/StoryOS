import useBookConversations from "./useBookConversations.ts";
import { Toast } from "../../components/ui/Notice.tsx";
import useBookNavigation from "./useBookNavigation.ts";
import useBookWorkspaceLayout from "./useBookWorkspaceLayout.ts";
import BookWorkspaceHeader from "./components/BookWorkspaceHeader.tsx";
import { PageSurface } from "../../components/layout/PageSurface.tsx";
import { useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { cn } from "../../../lib/utils.ts";
import "../../components/motion/motion.css";
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
  flattenBookChapterGroups,
  formatBookVolumeTitle,
  formatChineseOrdinal,
} from "./bookWorkspaceModel.ts";
import useBookWorkspace from "./useBookWorkspace.ts";
import type {
  ChapterEditorBridge,
  ChapterEditorLiveContext,
} from "./editor/chapterEditorContext.ts";
import useBookEditorToolHandler from "./ai/useBookEditorToolHandler.ts";
import useBookGenerationEvents from "./ai/useBookGenerationEvents.ts";
import useBookMutationSync from "./ai/useBookMutationSync.ts";
import useChapterReadingSession from "./useChapterReadingSession.ts";
import useFlushEditorOnLeave from "./useFlushEditorOnLeave.ts";

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
    prefetchChapter,
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
    revealChapter,
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
  // The live editor context is only read when a turn is sent. Keeping it in a
  // ref prevents caret moves and editor updates from re-rendering the entire
  // workspace, including the outline and assistant panel.
  const editorContextRef = useRef<ChapterEditorLiveContext | null>(null);
  const editorBridgeRef = useRef<ChapterEditorBridge | null>(null);
  useFlushEditorOnLeave(editorBridgeRef);
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
  const { displayedChapter, displayedLocation, chapterContentPending } =
    useChapterReadingSession({
      projectId,
      workspace,
      activeChapterId,
      chapterGroups,
      loadChapter,
      prefetchChapter,
      showBookOverview,
      editorBridgeRef,
    });
  const chapterNumber = activeChapterLocation?.chapterNumber ?? null;
  const activeVolumeTitle = formatBookVolumeTitle(
    chapterGroups,
    activeChapterLocation,
  );
  const editorChapterNumber = displayedLocation?.chapterNumber ?? null;
  const editorVolumeTitle =
    displayedChapter?.id === activeChapter?.id
      ? activeVolumeTitle
      : formatBookVolumeTitle(chapterGroups, displayedLocation);

  useBookGenerationEvents(projectId, revealChapter);

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
    lastMutation: projectId ? (state.lastBookMutations[projectId] ?? null) : null,
    reloadWorkspace: reloadBookWorkspace,
    reloadNavigation: loadProjectNavigation,
    onRevealChapter: revealChapter,
  });

  const {
    assistantDraft,
    setAssistantDraft,
    assistantContextEnabled,
    setAssistantContextEnabled,
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
    livePagination,
    activeChapterId,
    editorBridgeRef,
    editorContextRef,
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
        <BookCatalogPanel
          visible={catalogVisible && !assistantFocused}
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

        {!assistantFocused && workspace.state === "uninitialized" && (
          <BookProfilePanel
            book={null}
            chapters={[]}
            volumeCount={0}
            chapterCount={0}
            characterCount={0}
            onSelectChapter={null}
            onSave={saveBookProfile}
          />
        )}

        {!assistantFocused && chapterContentPending && (
          <div
            role="status"
            className="motion-reveal grid flex-1 place-items-center text-sm text-muted-foreground"
          >
            {bookError ?? "正在载入章节正文…"}
          </div>
        )}
        {!assistantFocused &&
          readyWorkspace &&
          displayedChapter &&
          editorChapterNumber !== null && (
            <ChapterEditorPanel
              chapter={displayedChapter}
              chapterNumber={editorChapterNumber}
              volumeTitle={editorVolumeTitle}
              readOnly={displayedChapter.id !== activeChapter?.id}
              pageTarget={
                pageTarget?.chapterId === displayedChapter.id ? pageTarget : null
              }
              onPageChange={setActiveChapterPageNumber}
              onPaginationChange={(layoutKey, pages) => {
                setLivePagination({
                  chapterId: displayedChapter.id,
                  layoutKey,
                  pages,
                });
              }}
              onSaveTitle={(title) =>
                updateChapterTitle(displayedChapter.id, title)
              }
              onSaveDraft={(content, base) =>
                saveChapterDraft(displayedChapter.id, content, base)
              }
              onSaveContent={(content, expectedCurrentRevisionId) =>
                saveChapterContent(
                  displayedChapter.id,
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
            chapters={flattenBookChapterGroups(chapterGroups)}
            volumeCount={readyWorkspace.volumes.length}
            chapterCount={readyWorkspace.chapters.length}
            characterCount={readyWorkspace.chapters.reduce(
              (total, chapter) => total + chapter.characterCount,
              0,
            )}
            onSelectChapter={selectChapter}
            onSave={saveBookProfile}
          />
        )}

        <div
          className={cn(
            "flex h-full min-h-0",
            assistantFocused
              ? "min-w-0 flex-1"
              : cn(
                  "motion-sidebar relative z-20 shrink-0",
                  "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30",
                  assistantVisible && "max-xl:shadow-2xl",
                ),
          )}
          data-open={assistantFocused || assistantVisible}
          style={assistantFocused
            ? undefined
            : { width: assistantVisible ? `min(${assistant.width}px, 94vw)` : 0 }}
        >
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
        </div>

        {bookError && <Toast tone="danger">{bookError}</Toast>}
      </div>
    </PageSurface>
  );
}
