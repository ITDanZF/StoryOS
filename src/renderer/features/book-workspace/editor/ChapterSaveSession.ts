import type { ChapterDraft } from "../../../../shared/book/drafts.ts";
import type { BookSaveState } from "../bookWorkspaceModel.ts";

export type ChapterSaveHandlers = {
  save: (
    content: string,
    revisionId: string | null,
  ) => Promise<{ revision: { id: string } }>;
  saveDraft?: (content: string, revisionId: string | null) => Promise<void>;
  onState: (state: BookSaveState) => void;
};

/** One chapter owns its revision, pending content, timers and serial save chain. */
export class ChapterSaveSession {
  readonly recoveredContent: string | null;
  pendingContent: string | null;
  private savedContent: string;
  private revisionId: string | null;
  private sequence: Promise<void> = Promise.resolve();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    content: string,
    revisionId: string | null,
    draft: ChapterDraft | null | undefined,
    public handlers: ChapterSaveHandlers,
  ) {
    this.savedContent = content;
    this.revisionId = revisionId;
    this.recoveredContent =
      draft?.baseRevisionId === revisionId ? draft.content : null;
    this.pendingContent = this.recoveredContent;
  }
  get hasUnsavedChanges() {
    return (
      this.pendingContent !== null && this.pendingContent !== this.savedContent
    );
  }
  acceptExternal(content: string, revisionId: string | null) {
    this.savedContent = content;
    this.revisionId = revisionId;
    if (this.pendingContent === content) this.pendingContent = null;
  }
  cancelScheduledSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
  schedule(content: string) {
    this.pendingContent = content;
    this.handlers.onState("saving");
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      void this.handlers
        .saveDraft?.(content, this.revisionId)
        .catch(() => this.handlers.onState("error"));
    }, 300);
    this.cancelScheduledSave();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist(content).catch((): void => undefined);
    }, 5000);
  }
  private persist(content: string): Promise<void> {
    this.handlers.onState("saving");
    // Revision is read when this write executes, after the preceding write resolves.
    this.sequence = this.sequence
      .catch((): void => undefined)
      .then(async () => {
        if (content !== this.savedContent) {
          const result = await this.handlers.save(content, this.revisionId);
          this.savedContent = content;
          this.revisionId = result.revision.id;
        }
        if (this.pendingContent === content) {
          this.pendingContent = null;
          this.handlers.onState("saved");
        }
      })
      .catch((cause: unknown) => {
        this.handlers.onState("error");
        throw cause;
      });
    return this.sequence;
  }
  flush = (): Promise<void> => {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    this.cancelScheduledSave();
    return this.pendingContent !== null
      ? this.persist(this.pendingContent)
      : this.sequence;
  };
}
