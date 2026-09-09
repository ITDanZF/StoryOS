import type { ReadyBookWorkspaceSnapshot } from "../../../shared/agent/contracts.ts";
import type { BookReaderApi, BookReadingState, ReaderSnapshot } from "../../../shared/book/reader.ts";

export function createPreviewBookReader(getBook: (bookId: string) => ReadyBookWorkspaceSnapshot): BookReaderApi {
  const sessions = new Map<string, { bookId: string; source: ReadyBookWorkspaceSnapshot; sequence: number }>();
  const states = new Map<string, BookReadingState>();
  const requireSession = (id: string) => {
    const session = sessions.get(id);
    if (!session) throw new Error("阅读会话已失效。");
    getBook(session.bookId);
    return session;
  };
  return {
    openBookReader: async bookId => {
      const source = structuredClone(getBook(bookId));
      const snapshotId = crypto.randomUUID();
      sessions.clear();
      sessions.set(snapshotId, { bookId, source, sequence: 0 });
      const result: ReaderSnapshot = { snapshotId, book: source.book, volumes: [...source.volumes],
        chapters: source.chapters.map(c => ({ id: c.id, title: c.title, volumeId: c.volumeId, sortOrder: c.sortOrder,
          revisionId: c.currentRevisionId, contentHash: c.currentRevisionId, characterCount: c.characterCount })),
        readingState: states.get(bookId) ?? null };
      return result;
    },
    readBookReaderChapter: async ({ snapshotId, chapterId }) => {
      const session = requireSession(snapshotId);
      const chapter = session.source.chapters.find(c => c.id === chapterId);
      if (!chapter) throw new Error("章节不属于当前书籍。");
      return { content: chapter.content, contentHash: chapter.currentRevisionId, revisionId: chapter.currentRevisionId, characterCount: chapter.characterCount };
    },
    getBookReaderStatus: async snapshotId => {
      try { const s = requireSession(snapshotId); return JSON.stringify(getBook(s.bookId)) === JSON.stringify(s.source) ? "unchanged" : "changed"; }
      catch { return "unavailable"; }
    },
    saveBookReadingState: async request => {
      const s = requireSession(request.snapshotId);
      if (request.sequence <= s.sequence) return;
      states.set(s.bookId, { bookId: s.bookId, schemaVersion: 1, anchor: request.anchor, preferences: request.preferences, lastReadAt: new Date().toISOString() });
      s.sequence = request.sequence;
    },
    closeBookReader: async id => { sessions.delete(id); },
  };
}
