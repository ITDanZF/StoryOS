import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import NovelApplication from "../../src/main/agent/application/NovelApplication.ts";
import ProjectDatabase from "../../src/main/agent/storage/project/ProjectDatabase.ts";
import SqliteNovelStore from "../../src/main/agent/storage/project/SqliteNovelStore.ts";

const temporaryRoots: string[] = [];
const databases: ProjectDatabase[] = [];

function createDatabase(): {
  readonly root: string;
  readonly path: string;
  readonly database: ProjectDatabase;
  readonly novels: NovelApplication;
} {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-novel-storage-"));
  temporaryRoots.push(root);
  const databasePath = path.join(root, ".storyos", "storyos.sqlite");
  const database = new ProjectDatabase(databasePath);
  databases.push(database);
  return {
    root,
    path: databasePath,
    database,
    novels: new NovelApplication(new SqliteNovelStore(database.handle)),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("novel SQLite storage", () => {
  it("persists novels, volumes, chapters, and immutable revisions", () => {
    const fixture = createDatabase();
    const novel = fixture.novels.createNovel({
      title: " 长夜 ",
      synopsis: "一部测试小说",
      status: "writing",
    });
    const volume = fixture.novels.createVolume({
      novelId: novel.id,
      title: "第一卷",
      sortOrder: 0,
    });
    const chapter = fixture.novels.createChapter({
      novelId: novel.id,
      volumeId: volume.id,
      title: "第一章",
      status: "draft",
      sortOrder: 0,
    });

    const first = fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "夜色降临。",
      changeSummary: "初稿",
      expectedCurrentRevisionId: null,
    });
    const duplicate = fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "夜色降临。",
      expectedCurrentRevisionId: first.id,
    });
    const second = fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "夜色降临，城市仍未入睡。",
      changeSummary: "扩写",
      expectedCurrentRevisionId: first.id,
    });

    expect(novel.title).toBe("长夜");
    expect(duplicate.id).toBe(first.id);
    expect(second.revisionNumber).toBe(2);
    expect(second.characterCount).toBe(12);
    expect(fixture.novels.listRevisions(chapter.id).map((item) => item.id))
      .toEqual([second.id, first.id]);
    expect(fixture.novels.getChapter(chapter.id).currentRevisionId)
      .toBe(second.id);

    fixture.database.close();
    const reopened = new ProjectDatabase(fixture.path);
    databases.push(reopened);
    const restored = new NovelApplication(
      new SqliteNovelStore(reopened.handle),
    );
    expect(restored.listNovels()).toHaveLength(1);
    expect(restored.listVolumes(novel.id)[0]?.title).toBe("第一卷");
    expect(restored.listChapters(novel.id)[0]?.currentRevisionId)
      .toBe(second.id);
    reopened.close();
  });

  it("rejects stale saves and cross-novel volume assignments", () => {
    const fixture = createDatabase();
    const firstNovel = fixture.novels.createNovel({ title: "甲" });
    const secondNovel = fixture.novels.createNovel({ title: "乙" });
    const foreignVolume = fixture.novels.createVolume({
      novelId: secondNovel.id,
      title: "异卷",
      sortOrder: 0,
    });

    expect(() => fixture.novels.createChapter({
      novelId: firstNovel.id,
      volumeId: foreignVolume.id,
      title: "错误章节",
      sortOrder: 0,
    })).toThrow("Volume does not belong to novel");

    const chapter = fixture.novels.createChapter({
      novelId: firstNovel.id,
      title: "正文",
      sortOrder: 0,
    });
    const revision = fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "第一稿",
      expectedCurrentRevisionId: null,
    });
    expect(() => fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "覆盖稿",
      expectedCurrentRevisionId: null,
    })).toThrow("Chapter revision conflict");
    expect(fixture.novels.listRevisions(chapter.id)).toHaveLength(1);
    expect(fixture.novels.getChapter(chapter.id).currentRevisionId)
      .toBe(revision.id);
    fixture.database.close();
  });

  it("cascades deletion through the complete novel hierarchy", () => {
    const fixture = createDatabase();
    const novel = fixture.novels.createNovel({ title: "待删除" });
    const chapter = fixture.novels.createChapter({
      novelId: novel.id,
      title: "章节",
      sortOrder: 0,
    });
    fixture.novels.saveRevision({
      chapterId: chapter.id,
      content: "内容",
      expectedCurrentRevisionId: null,
    });

    fixture.novels.deleteNovel(novel.id);
    const counts = fixture.database.handle.prepare(`
      SELECT
        (SELECT COUNT(*) FROM novels) AS novels,
        (SELECT COUNT(*) FROM chapters) AS chapters,
        (SELECT COUNT(*) FROM chapter_revisions) AS revisions
    `).get() as { novels: number; chapters: number; revisions: number };
    expect(counts).toEqual({ novels: 0, chapters: 0, revisions: 0 });
    fixture.database.close();
  });
});
