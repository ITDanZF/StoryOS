import { describe, expect, it } from "vitest";
import type {
  BookWorkspaceChapterDto,
  VolumeDto,
} from "../../../shared/agent/contracts.ts";
import {
  createBookChapterGroups,
  findBookChapterLocation,
  flattenBookChapterGroups,
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
