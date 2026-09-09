import { decodeStoredChapterContent } from "../../../../shared/book/richText.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import NovelApplication from "../books/NovelApplication.ts";
import BookDatabase from "../../storage/book/BookDatabase.ts";
import SqliteNovelStore from "../../storage/book/SqliteNovelStore.ts";
import type { BookExportSnapshot } from "./PortableBook.ts";
export default class BookExportSnapshotReader {
  constructor(private readonly runtimes: BookRuntimeManager) {}
  readBookSnapshot(bookId: string): BookExportSnapshot {
    const lease = this.runtimes.acquire(bookId);
    try {
      const novels = new NovelApplication(lease.persistence);
      const novel = novels.getProjectBook();
      if (!novel) throw new Error(`Book contains no novel record: ${bookId}`);
      const volumes = novels.listVolumes(novel.id);
      const chapters = novels.listChapters(novel.id);
      const mapChapter = (chapter: (typeof chapters)[number]) => {
        const revision = novels.getCurrentRevision(chapter.id);
        const document = decodeStoredChapterContent(revision?.content ?? "");
        return Object.freeze({
          id: chapter.id,
          title: chapter.title,
          status: chapter.status,
          sortOrder: chapter.sortOrder,
          document,
          characterCount: revision?.characterCount ?? 0,
        });
      };
      const volumeSnapshots = volumes.map((volume) =>
        Object.freeze({
          id: volume.id,
          title: volume.title,
          summary: volume.summary,
          sortOrder: volume.sortOrder,
          chapters: Object.freeze(
            chapters.filter((chapter) => chapter.volumeId === volume.id).map(mapChapter),
          ),
        }),
      );
      const ungroupedChapters = chapters
        .filter((chapter) => chapter.volumeId === null)
        .map(mapChapter);
      return Object.freeze({
        bookId,
        title: novel.title,
        synopsis: novel.synopsis,
        status: novel.status,
        volumes: Object.freeze(volumeSnapshots),
        ungroupedChapters: Object.freeze(ungroupedChapters),
        characterCount: chapters.reduce(
          (total, chapter) => total + (novels.getCurrentRevision(chapter.id)?.characterCount ?? 0),
          0,
        ),
      });
    } finally {
      lease.close();
    }
  }

  readSnapshotFromDatabase(databasePath: string, bookId: string): BookExportSnapshot {
    BookDatabase.validateExisting(databasePath);
    const database = new BookDatabase(databasePath);
    try {
      const novels = new NovelApplication(
        new SqliteNovelStore(database.handle, this.runtimes.deviceId),
      );
      const novel = novels.getProjectBook();
      if (!novel) throw new Error("Book database contains no novel record.");
      const volumes = novels.listVolumes(novel.id);
      const chapters = novels.listChapters(novel.id);
      const mapChapter = (chapter: (typeof chapters)[number]) => {
        const revision = novels.getCurrentRevision(chapter.id);
        const document = decodeStoredChapterContent(revision?.content ?? "");
        return Object.freeze({
          id: chapter.id,
          title: chapter.title,
          status: chapter.status,
          sortOrder: chapter.sortOrder,
          document,
          characterCount: revision?.characterCount ?? 0,
        });
      };
      return Object.freeze({
        bookId,
        title: novel.title,
        synopsis: novel.synopsis,
        status: novel.status,
        volumes: Object.freeze(
          volumes.map((volume) =>
            Object.freeze({
              id: volume.id,
              title: volume.title,
              summary: volume.summary,
              sortOrder: volume.sortOrder,
              chapters: Object.freeze(
                chapters.filter((chapter) => chapter.volumeId === volume.id).map(mapChapter),
              ),
            }),
          ),
        ),
        ungroupedChapters: Object.freeze(
          chapters.filter((chapter) => chapter.volumeId === null).map(mapChapter),
        ),
        characterCount: chapters.reduce(
          (total, chapter) => total + (novels.getCurrentRevision(chapter.id)?.characterCount ?? 0),
          0,
        ),
      });
    } finally {
      database.close();
    }
  }
}
