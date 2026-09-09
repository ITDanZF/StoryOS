import { z } from "zod";
import type {
  ReaderChapterContent,
  ReaderManifest,
  ReaderSaveRequest,
  ReaderSnapshot,
} from "../../../../shared/book/reader.ts";
import type { BookReadingStateStore } from "../../storage/global/SqliteBookReadingStateStore.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";

const id = z.string().min(1).max(200);
const saveSchema = z.object({
  snapshotId: id,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  anchor: z
    .object({
      chapterId: id,
      revisionId: id,
      position: z.number().int().nonnegative().max(100_000_000),
      textOffset: z.number().int().nonnegative().max(100_000_000),
      quote: z.string().max(256),
      prefix: z.string().max(96),
      suffix: z.string().max(96),
    })
    .nullable(),
  preferences: z.object({
    mode: z.enum(["three-dimensional", "plain"]),
    spread: z.enum(["auto", "single", "double"]),
    fontSize: z.union([
      z.literal(16),
      z.literal(18),
      z.literal(20),
      z.literal(22),
      z.literal(24),
      z.literal(26),
    ]),
    lineHeight: z.union([z.literal(1.6), z.literal(1.8), z.literal(2)]),
    theme: z.enum(["paper", "dark"]),
  }),
});
type Session = {
  owner: number;
  bookId: string;
  manifest: ReaderManifest;
  sequence: number;
  stateVersion: number;
  touchedAt: number;
};
const fingerprint = (manifest: ReaderManifest) => JSON.stringify(manifest);

export default class BookReaderApplication {
  private readonly sessions = new Map<string, Session>();
  constructor(
    private readonly runtimes: BookRuntimeManager,
    private readonly states: BookReadingStateStore,
  ) {}

  open(owner: number, bookId: string): ReaderSnapshot {
    id.parse(bookId);
    this.prune();
    // One active reader per window; a newer reader supersedes delayed saves from the old one.
    this.closeOwner(owner);
    if (this.sessions.size >= 16) throw new Error("同时打开的阅读会话过多。");
    const manifest = this.runtimes.readReaderManifest(bookId);
    const snapshotId = crypto.randomUUID();
    const readingState = this.states.get(bookId);
    this.sessions.set(snapshotId, {
      owner,
      bookId,
      manifest,
      sequence: 0,
      stateVersion: readingState?.stateVersion ?? 0,
      touchedAt: Date.now(),
    });
    return { ...manifest, snapshotId, readingState };
  }
  read(owner: number, request: { snapshotId: string; chapterId: string }): ReaderChapterContent {
    const session = this.requireSession(owner, request?.snapshotId);
    id.parse(request?.chapterId);
    const chapter = session.manifest.chapters.find((c) => c.id === request.chapterId);
    if (!chapter) throw new Error("章节不属于当前阅读快照。");
    const lease = this.runtimes.acquire(session.bookId);
    try {
      if (!lease.persistence.getChapter(chapter.id))
        throw new Error("章节已删除，请重新打开书籍。");
      if (!chapter.revisionId)
        return {
          revisionId: null,
          contentHash: null,
          content: "",
          characterCount: 0,
        };
      const revision = lease.persistence.getRevision(chapter.revisionId);
      if (!revision || revision.chapterId !== chapter.id)
        throw new Error("章节修订已失效，请刷新正文。");
      return {
        revisionId: revision.id,
        contentHash: revision.contentHash,
        content: revision.content,
        characterCount: revision.characterCount,
      };
    } finally {
      lease.close();
    }
  }
  status(owner: number, snapshotId: string): "unchanged" | "changed" | "unavailable" {
    const session = this.requireSession(owner, snapshotId);
    try {
      return fingerprint(this.runtimes.readReaderManifest(session.bookId)) ===
        fingerprint(session.manifest)
        ? "unchanged"
        : "changed";
    } catch {
      return "unavailable";
    }
  }
  save(owner: number, input: ReaderSaveRequest): void {
    const request = saveSchema.parse(input) as ReaderSaveRequest;
    const session = this.requireSession(owner, request.snapshotId);
    if (request.sequence <= session.sequence) return;
    const anchor = request.anchor;
    if (
      anchor &&
      !session.manifest.chapters.some(
        (c) => c.id === anchor.chapterId && c.revisionId === anchor.revisionId,
      )
    ) {
      throw new Error("阅读位置不属于当前修订。");
    }
    const lease = this.runtimes.acquire(session.bookId);
    try {
      this.states.save(
        {
          bookId: session.bookId,
          schemaVersion: 1,
          anchor: request.anchor,
          preferences: request.preferences,
          lastReadAt: new Date().toISOString(),
        },
        session.stateVersion,
      );
      session.stateVersion += 1;
      session.sequence = request.sequence;
    } finally {
      lease.close();
    }
  }
  close(owner: number, snapshotId: string): void {
    const session = this.sessions.get(snapshotId);
    if (session && session.owner !== owner) throw new Error("阅读会话不属于当前窗口。");
    this.sessions.delete(snapshotId);
  }
  closeOwner(owner: number): void {
    for (const [key, session] of this.sessions)
      if (session.owner === owner) this.sessions.delete(key);
  }
  dispose(): void {
    this.sessions.clear();
  }
  private prune(): void {
    for (const [key, session] of this.sessions)
      if (Date.now() - session.touchedAt > 60 * 60_000) this.sessions.delete(key);
  }
  private requireSession(owner: number, snapshotId: string): Session {
    id.parse(snapshotId);
    this.prune();
    const session = this.sessions.get(snapshotId);
    if (!session || session.owner !== owner) throw new Error("阅读会话已失效，请重新打开书籍。");
    session.touchedAt = Date.now();
    return session;
  }
}
