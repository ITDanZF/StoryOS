import { Extension } from "@tiptap/core";
import {
  EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from "@tiptap/pm/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
} from "@tiptap/pm/view";
import {
  CHAPTER_PAGE_SPEC,
  chapterPageContentHeight,
  chapterPageCountForStageHeight,
  type ChapterPaginationSnapshot,
  type ChapterPageSpec,
} from "./paginationModel.ts";
import {
  applyChapterPaginationLayout,
  assertChapterPaginationLayoutParity,
  createPaginationLayoutFingerprint,
} from "./paginationLayout.ts";
import {
  measurePaginationContentHeight,
  verifyPaginationProjection,
} from "./paginationVerifier.ts";
import { paginateEditorView } from "./paginationRuntime.ts";

type PaginationPluginState = {
  readonly snapshot: ChapterPaginationSnapshot;
  readonly decorations: DecorationSet;
};

type ApplyPaginationMeta = {
  readonly type: "apply";
  readonly snapshot: ChapterPaginationSnapshot;
  readonly decorations: DecorationSet;
};

const chapterPaginationKey = new PluginKey<PaginationPluginState>(
  "chapterPagination",
);

const EMPTY_SNAPSHOT: ChapterPaginationSnapshot = Object.freeze({
  generation: 0,
  layoutKey: "uninitialized",
  status: "pending",
  pages: Object.freeze([]),
  renderPageCount: 1,
});

export class ChapterPaginationController {
  private snapshot: ChapterPaginationSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private requestReflowCallback: (() => void) | null = null;
  private contentStreaming = false;

  getSnapshot = (): ChapterPaginationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(snapshot: ChapterPaginationSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  setRequestReflow(callback: (() => void) | null): void {
    this.requestReflowCallback = callback;
  }

  requestReflow(): void {
    this.requestReflowCallback?.();
  }

  setContentStreaming(streaming: boolean): void {
    if (this.contentStreaming === streaming) return;
    this.contentStreaming = streaming;
    if (!streaming) this.requestReflow();
  }

  isContentStreaming(): boolean {
    return this.contentStreaming;
  }
}

type ChapterPaginationOptions = {
  readonly controller: ChapterPaginationController;
  readonly pageSpec: ChapterPageSpec;
};

function mapPluginState(
  transaction: Transaction,
  current: PaginationPluginState,
): PaginationPluginState {
  const meta = transaction.getMeta(chapterPaginationKey) as
    | ApplyPaginationMeta
    | undefined;
  if (meta?.type === "apply") {
    return {
      snapshot: meta.snapshot,
      decorations: meta.decorations,
    };
  }
  if (!transaction.docChanged) return current;
  return {
    snapshot: current.snapshot,
    decorations: current.decorations.map(transaction.mapping, transaction.doc),
  };
}

function createGapDecorations(
  view: EditorView,
  snapshot: ChapterPaginationSnapshot,
  pageSpec: ChapterPageSpec,
): {
  readonly decorations: DecorationSet;
} {
  const decorations: Decoration[] = [];
  for (let pageIndex = 0; pageIndex < snapshot.pages.length - 1; pageIndex += 1) {
    const page = snapshot.pages[pageIndex];
    const nextPage = snapshot.pages[pageIndex + 1];
    const remainingContentHeight = Math.max(
      0,
      chapterPageContentHeight(pageSpec) - page.usedHeight,
    );
    const height = remainingContentHeight +
      pageSpec.marginBottom +
      pageSpec.pageGap +
      pageSpec.marginTop;
    const position = Math.max(
      1,
      Math.min(nextPage.from, view.state.doc.content.size - 1),
    );
    decorations.push(Decoration.widget(position, () => {
      const element = document.createElement("span");
      element.className = "chapter-pagination-gap";
      element.dataset.chapterPaginationGap = String(pageIndex + 1);
      element.style.height = `${height}px`;
      element.setAttribute("contenteditable", "false");
      element.setAttribute("aria-hidden", "true");
      return element;
    }, {
      key: `chapter-page-gap-${pageIndex}-${position}`,
      side: -1,
    }));
  }
  return {
    decorations: DecorationSet.create(view.state.doc, decorations),
  };
}

function createPaginationPlugin(
  options: ChapterPaginationOptions,
): Plugin<PaginationPluginState> {
  return new Plugin<PaginationPluginState>({
    key: chapterPaginationKey,
    state: {
      init: () => ({
        snapshot: EMPTY_SNAPSHOT,
        decorations: DecorationSet.empty,
      }),
      apply: mapPluginState,
    },
    props: {
      decorations(state) {
        return chapterPaginationKey.getState(state)?.decorations ?? null;
      },
    },
    view(view) {
      let generation = 0;
      let frame: number | null = null;
      let settleFrame: number | null = null;
      let verificationFrame: number | null = null;
      let disposed = false;
      let observedWidth = 0;
      let verificationFailureDocument = view.state.doc;
      let consecutiveVerificationFailures = 0;
      const measurementHost = document.createElement("div");
      measurementHost.className = "book-pagination-measure-host";
      measurementHost.style.width = `${options.pageSpec.width}px`;
      applyChapterPaginationLayout(measurementHost);
      document.body.append(measurementHost);
      const measurementView = new EditorView(measurementHost, {
        state: EditorState.create({ doc: view.state.doc }),
        editable: () => false,
        attributes: {
          class: "chapter-rich-text book-pagination-rich-text chapter-pagination-layout-root",
          "aria-hidden": "true",
        },
      });

      const publishWorkingProjection = () => {
        const current = options.controller.getSnapshot();
        const contentHeight = measurePaginationContentHeight(view);
        const renderPageCount = Math.max(
          1,
          current.pages.length,
          chapterPageCountForStageHeight(
            contentHeight,
            options.pageSpec,
          ),
        );
        if (
          current.status === "pending" &&
          current.renderPageCount === renderPageCount &&
          current.generation === generation
        ) return;
        options.controller.publish({
          ...current,
          generation,
          status: "pending",
          renderPageCount,
          error: undefined,
        });
      };

      const run = () => {
        frame = null;
        if (disposed) return;
        if (view.composing) {
          frame = window.requestAnimationFrame(run);
          return;
        }
        const editorRect = view.dom.getBoundingClientRect();
        if (!view.dom.isConnected || editorRect.width < 1 || editorRect.height < 1) {
          frame = window.requestAnimationFrame(run);
          return;
        }
        const requestedGeneration = generation;
        const requestedDocument = view.state.doc;
        try {
          // Measure a clean offscreen view. The visible editor keeps its last
          // stable page gaps until the next complete snapshot is ready.
          measurementView.updateState(EditorState.create({
            doc: view.state.doc,
          }));
          assertChapterPaginationLayoutParity(view.dom, measurementView.dom);
          const pages = paginateEditorView(measurementView, options.pageSpec);
          if (disposed || requestedGeneration !== generation) return;
          const snapshot: ChapterPaginationSnapshot = {
            generation: requestedGeneration,
            layoutKey: `${createPaginationLayoutFingerprint()}:${view.state.doc.content.size}:${requestedGeneration}`,
            status: "ready",
            pages,
            renderPageCount: Math.max(1, pages.length),
          };
          const layout = createGapDecorations(
            view,
            snapshot,
            options.pageSpec,
          );
          const transaction = view.state.tr
            .setMeta(chapterPaginationKey, {
              type: "apply",
              snapshot,
              decorations: layout.decorations,
            } satisfies ApplyPaginationMeta)
            .setMeta("addToHistory", false);
          view.dispatch(transaction);
          options.controller.publish({
            ...snapshot,
            status: "pending",
          });
          verificationFrame = window.requestAnimationFrame(() => {
            verificationFrame = null;
            if (disposed || requestedGeneration !== generation) return;
            const verification = verifyPaginationProjection(
              view,
              pages.length,
              options.pageSpec,
            );
            if (!verification.valid) {
              if (verificationFailureDocument === requestedDocument) {
                consecutiveVerificationFailures += 1;
              } else {
                verificationFailureDocument = requestedDocument;
                consecutiveVerificationFailures = 1;
              }
              if (
                options.controller.isContentStreaming() ||
                consecutiveVerificationFailures < 3
              ) {
                // A stream changes the document again before it can be considered
                // geometrically stable. Do not carry a transient overflow into
                // the final, post-stream verification pass.
                if (options.controller.isContentStreaming()) {
                  consecutiveVerificationFailures = 0;
                }
                options.controller.publish({
                  ...snapshot,
                  status: "pending",
                  error: undefined,
                });
                if (!options.controller.isContentStreaming()) schedule();
                return;
              }
              options.controller.publish({
                ...snapshot,
                status: "failed",
                error: verification.error,
              });
              return;
            }
            verificationFailureDocument = requestedDocument;
            consecutiveVerificationFailures = 0;
            options.controller.publish(snapshot);
          });
        } catch (cause) {
          if (disposed || requestedGeneration !== generation) return;
          options.controller.publish({
            generation: requestedGeneration,
            layoutKey: `failed:${requestedGeneration}`,
            status: "failed",
            pages: options.controller.getSnapshot().pages,
            renderPageCount: options.controller.getSnapshot().renderPageCount,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      };

      const schedule = () => {
        generation += 1;
        publishWorkingProjection();
        if (frame !== null) return;
        // Reflow on the next paint. The working projection has already prepared
        // enough paper without feeding that visual height back into measurement.
        frame = window.requestAnimationFrame(run);
      };

      // The editor can mount before its surrounding workspace has finished its
      // first layout. A measurement taken in that transient state may see all
      // caret coordinates on one visual line and incorrectly publish one page.
      // Reflow once more after two paints, and whenever the usable editor width
      // changes or the window becomes visible/focused again.
      const scheduleAfterLayoutSettles = () => {
        if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
        settleFrame = window.requestAnimationFrame(() => {
          settleFrame = window.requestAnimationFrame(() => {
            settleFrame = null;
            if (!disposed) schedule();
          });
        });
      };

      const resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (width < 1 || Math.abs(width - observedWidth) < 0.5) return;
        observedWidth = width;
        scheduleAfterLayoutSettles();
      });
      resizeObserver.observe(view.dom);

      const onWindowFocus = () => scheduleAfterLayoutSettles();
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") scheduleAfterLayoutSettles();
      };
      window.addEventListener("focus", onWindowFocus);
      document.addEventListener("visibilitychange", onVisibilityChange);

      const onCompositionEnd = () => schedule();
      view.dom.addEventListener("compositionend", onCompositionEnd);
      options.controller.setRequestReflow(schedule);
      void document.fonts.ready.then(() => {
        if (!disposed) schedule();
      });
      schedule();
      scheduleAfterLayoutSettles();

      return {
        update(nextView, previousState) {
          view = nextView;
          if (nextView.state.doc !== previousState.doc) {
            verificationFailureDocument = nextView.state.doc;
            consecutiveVerificationFailures = 0;
            schedule();
          }
        },
        destroy() {
          disposed = true;
          if (frame !== null) window.cancelAnimationFrame(frame);
          if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
          if (verificationFrame !== null) {
            window.cancelAnimationFrame(verificationFrame);
          }
          measurementView.destroy();
          measurementHost.remove();
          resizeObserver.disconnect();
          window.removeEventListener("focus", onWindowFocus);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          view.dom.removeEventListener("compositionend", onCompositionEnd);
          options.controller.setRequestReflow(null);
        },
      };
    },
  });
}

export const ChapterPaginationExtension = Extension.create<
  ChapterPaginationOptions
>({
  name: "chapterPagination",
  addOptions() {
    return {
      controller: new ChapterPaginationController(),
      pageSpec: CHAPTER_PAGE_SPEC,
    };
  },
  addProseMirrorPlugins() {
    return [createPaginationPlugin(this.options)];
  },
});
