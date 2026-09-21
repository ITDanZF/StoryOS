import { describe, expect, it } from "vitest";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../shared/agent/contracts.ts";
import {
  createBookChapterGroups,
  findBookChapterLocation,
  flattenBookChapterGroups,
  neighborChapterIds,
  resolveDisplayedChapter,
} from "./bookWorkspaceModel.ts";

const timestamp = "2026-01-01T00:00:00.000Z";

function volume(
  id: string,
  title: string,
  sortOrder: number,
): VolumeDto {
  return {
    id,
    novelId: "novel-1",
    title,
    summary: "",
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function chapter(
  id: string,
  volumeId: string | null,
  sortOrder: number,
  title = "第一章",
): BookWorkspaceChapterDto {
  return {
    id,
    novelId: "novel-1",
    volumeId,
    title,
    status: "outline",
    sortOrder,
    currentRevisionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    content: "",
    characterCount: 0,
    revisionNumber: null,
  };
}

describe("book workspace chapter groups", () => {
  it("maps every chapter exactly once and keeps unassigned chapters visible", () => {
    const groups = createBookChapterGroups(
      [volume("volume-2", "第二卷", 1), volume("volume-1", "第一卷", 0)],
      [
        chapter("unassigned-2", null, 1),
        chapter("volume-chapter", "volume-1", 0),
        chapter("unassigned-1", null, 0),
      ],
    );

    expect(groups.map((group) => [group.kind, group.title])).toEqual([
      ["volume", "第一卷"],
      ["volume", "第二卷"],
      ["unassigned", "未分卷"],
    ]);
    expect(flattenBookChapterGroups(groups).map((item) => item.id)).toEqual([
      "volume-chapter",
      "unassigned-1",
      "unassigned-2",
    ]);
    expect(new Set(flattenBookChapterGroups(groups).map((item) => item.id)).size)
      .toBe(3);
  });

  it("numbers chapters inside the unassigned group without merging equal titles", () => {
    const groups = createBookChapterGroups(
      [volume("volume-1", "第一卷", 0)],
      [
        chapter("volume-chapter", "volume-1", 0),
        chapter("unassigned-chapter", null, 0),
      ],
    );

    expect(findBookChapterLocation(groups, "volume-chapter")).toMatchObject({
      chapterNumber: 1,
      group: { kind: "volume" },
    });
    expect(findBookChapterLocation(groups, "unassigned-chapter")).toMatchObject({
      chapterNumber: 1,
      group: { kind: "unassigned", title: "未分卷" },
    });
  });

  it("rejects chapters that reference a missing volume", () => {
    expect(() => createBookChapterGroups(
      [],
      [chapter("orphan", "missing-volume", 0)],
    )).toThrow("references unknown volume");
  });
});

describe("chapter switching display", () => {
  it("keeps the previous loaded chapter visible until the next chapter is ready", () => {
    const active = { ...chapter("chapter-11", "volume-1", 1), contentLoaded: false };
    const held = { ...chapter("chapter-10", "volume-1", 0), contentLoaded: true };
    expect(resolveDisplayedChapter(active, held)?.id).toBe("chapter-10");
  });

  it("switches as soon as the selected chapter is loaded", () => {
    const active = { ...chapter("chapter-11", "volume-1", 1), contentLoaded: true };
    const held = { ...chapter("chapter-10", "volume-1", 0), contentLoaded: true };
    expect(resolveDisplayedChapter(active, held)?.id).toBe("chapter-11");
  });

  it("shows no editor when opening the first chapter from overview", () => {
    const active = { ...chapter("chapter-10", "volume-1", 0), contentLoaded: false };
    expect(resolveDisplayedChapter(active, null)).toBeNull();
  });

  it("returns neighboring chapter ids for prefetch", () => {
    expect(neighborChapterIds(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(neighborChapterIds(["a", "b", "c"], "a")).toEqual(["b"]);
    expect(neighborChapterIds(["a", "b", "c"], "c")).toEqual(["b"]);
    expect(neighborChapterIds(["a", "b", "c"], "missing")).toEqual([]);
  });
});
