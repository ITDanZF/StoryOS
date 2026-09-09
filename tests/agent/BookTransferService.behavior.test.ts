import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookProvisioningService from "../../src/main/story/application/books/BookProvisioningService.ts";
import BookTransferService from "../../src/main/story/application/transfers/BookTransferService.ts";
import * as DocxBookAdapter from "../../src/main/story/application/transfers/formats/DocxBookAdapter.ts";
import NovelApplication from "../../src/main/story/application/books/NovelApplication.ts";
import ProjectApplication from "../../src/main/story/application/projects/ProjectApplication.ts";
import { sha256 } from "../../src/main/story/application/transfers/StoryOSBookPackage.ts";
import BookRuntimeManager from "../../src/main/story/runtime/BookRuntimeManager.ts";
import ApplicationDatabase from "../../src/main/story/storage/global/ApplicationDatabase.ts";
import SqliteBookStore from "../../src/main/story/storage/global/SqliteBookStore.ts";
import SqliteProjectStore from "../../src/main/story/storage/global/SqliteProjectStore.ts";
import {
  serializeTiptapDocument as canonicalDoc,
  plainTextToTiptapDocument as textDoc,
  decodeStoredChapterContent,
  extractTiptapText,
} from "../../src/shared/book/richText.ts";

const roots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-book-transfer-"));
  roots.push(root);
  const agentHome = path.join(root, ".mini-agent");
  vi.stubEnv("MINI_AGENT_HOME", agentHome);
  mkdirSync(path.join(agentHome, "workSpaceRoot"), { recursive: true });
  writeFileSync(path.join(agentHome, "config.json"), JSON.stringify({ AGENT_WORKSPACE: "" }));
  const database = new ApplicationDatabase(agentHome);
  const projects = new ProjectApplication(new SqliteProjectStore(database.handle));
  const books = new SqliteBookStore(database.handle);
  const runtimes = new BookRuntimeManager(agentHome, books);
  const provisioning = new BookProvisioningService(agentHome, books, runtimes);
  const transfer = new BookTransferService(agentHome, books, runtimes);
  const projectRoot = path.join(root, "projects");
  mkdirSync(projectRoot);
  const project = projects.createProject({ name: "Export", parentPath: projectRoot });
  const provisioned = provisioning.createForProject(project.id, {
    id: `novel_${crypto.randomUUID()}`,
    title: "Transfer book",
    synopsis: "portable",
    status: "writing",
  });
  const novels = new NovelApplication(provisioned.lease.persistence);
  const novel = novels.getProjectBook();
  if (!novel) throw new Error("Provisioned novel is missing.");
  const volume = novels.createVolume({ novelId: novel.id, title: "One", sortOrder: 0 });
  const chapter = novels.createChapter({
    novelId: novel.id,
    volumeId: volume.id,
    title: "Chapter",
    sortOrder: 0,
  });
  novels.saveRevision({
    chapterId: chapter.id,
    content: "portable text",
    expectedCurrentRevisionId: null,
  });
  provisioned.lease.close();
  return { books, database, provisioned, root, runtimes, transfer };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("BookTransferService behavior", () => {
  it.each([
    { format: "docx" as const, extension: "docx" },
    { format: "storyos" as const, extension: "storyos-book" },
  ])(
    "requires confirmation and replaces an existing $format file",
    async ({ format, extension }) => {
      const harness = createHarness();
      try {
        const outputPath = path.join(harness.root, `野外山村的小屋.${extension}`);
        const original = Buffer.from("previous export");
        writeFileSync(outputPath, original);
        const preview = harness.transfer.prepareExport({
          bookId: harness.provisioned.bookId,
          format,
        });
        await expect(
          harness.transfer.commitExport({ exportId: preview.exportId, outputPath }),
        ).rejects.toThrow("目标文件已存在");
        expect(readFileSync(outputPath)).toEqual(original);

        const result = await harness.transfer.commitExport({
          exportId: preview.exportId,
          outputPath,
          overwrite: true,
        });
        expect(result.outputPath).toBe(outputPath);
        expect(result.byteLength).toBe(readFileSync(outputPath).length);
        if (format === "docx") {
          const archive = await JSZip.loadAsync(readFileSync(outputPath));
          expect(await archive.file("word/document.xml")?.async("string")).toContain(
            "portable text",
          );
        } else {
          const imported = harness.transfer.importBook({ packagePath: outputPath });
          expect(imported.title).toBe("Transfer book");
        }
        expect(readdirSync(harness.root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
      } finally {
        harness.runtimes.closeAll();
        harness.database.close();
      }
    },
  );

  it.each([
    { format: "docx" as const, extension: "docx" },
    { format: "storyos" as const, extension: "storyos-book" },
  ])(
    "preserves the existing $format export when generation fails",
    async ({ format, extension }) => {
      const harness = createHarness();
      try {
        const outputPath = path.join(harness.root, `old.${extension}`);
        const original = Buffer.from("keep this file");
        writeFileSync(outputPath, original);
        if (format === "storyos") {
          vi.spyOn(harness.runtimes, "captureBook").mockImplementationOnce(() => {
            throw new Error("generation failed");
          });
          expect(() =>
            harness.transfer.prepareExport({ bookId: harness.provisioned.bookId, format }),
          ).toThrow("generation failed");
        } else {
          const preview = harness.transfer.prepareExport({
            bookId: harness.provisioned.bookId,
            format,
          });
          vi.spyOn(DocxBookAdapter, "exportDocxBook").mockRejectedValueOnce(
            new Error("generation failed"),
          );
          await expect(
            harness.transfer.commitExport({
              exportId: preview.exportId,
              outputPath,
              overwrite: true,
            }),
          ).rejects.toThrow("generation failed");
        }
        expect(readFileSync(outputPath)).toEqual(original);
        expect(readdirSync(harness.root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
      } finally {
        harness.runtimes.closeAll();
        harness.database.close();
      }
    },
  );

  it("does not overwrite an unconfirmed file created during rendering", async () => {
    const harness = createHarness();
    try {
      const outputPath = path.join(harness.root, "concurrent.docx");
      const preview = harness.transfer.prepareExport({
        bookId: harness.provisioned.bookId,
        format: "docx",
      });
      vi.spyOn(DocxBookAdapter, "exportDocxBook").mockImplementationOnce(async () => {
        writeFileSync(outputPath, "another export");
        return Buffer.from("new document");
      });
      await expect(
        harness.transfer.commitExport({ exportId: preview.exportId, outputPath }),
      ).rejects.toThrow("目标文件已存在");
      expect(readFileSync(outputPath, "utf8")).toBe("another export");
      expect(readdirSync(harness.root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    } finally {
      harness.runtimes.closeAll();
      harness.database.close();
    }
  });

  it("rejects a directory even when overwrite is confirmed", async () => {
    const harness = createHarness();
    try {
      const outputPath = path.join(harness.root, "folder.docx");
      mkdirSync(outputPath);
      writeFileSync(path.join(outputPath, "keep.txt"), "keep");
      const preview = harness.transfer.prepareExport({
        bookId: harness.provisioned.bookId,
        format: "docx",
      });
      await expect(
        harness.transfer.commitExport({ exportId: preview.exportId, outputPath, overwrite: true }),
      ).rejects.toThrow("导出目标不是文件");
      expect(readFileSync(path.join(outputPath, "keep.txt"), "utf8")).toBe("keep");
    } finally {
      harness.runtimes.closeAll();
      harness.database.close();
    }
  });

  it("previews and imports an external text manuscript through a temporary session", async () => {
    const harness = createHarness();
    const textPath = path.join(harness.root, "外部稿件.txt");
    writeFileSync(textPath, "第一卷 起点\n\n第一章 相遇\n\n这是导入的正文。", "utf8");

    const preview = await harness.transfer.prepareImport({
      filePath: textPath,
      expectedFormat: "text",
    });
    expect(preview.format).toBe("text");
    expect(preview.volumes).toHaveLength(1);
    expect(preview.chapterCount).toBe(1);
    expect(preview.characterCount).toBeGreaterThan(0);

    const imported = await harness.transfer.commitImport({
      sessionId: preview.sessionId,
    });
    expect(imported.format).toBe("text");
    const lease = harness.runtimes.acquire(imported.bookId);
    const novels = new NovelApplication(lease.persistence);
    const novel = novels.getProjectBook();
    expect(novel?.title).toBe("外部稿件");
    const chapter = novel ? novels.listChapters(novel.id)[0] : null;
    const revision = chapter ? novels.getCurrentRevision(chapter.id) : null;
    expect(
      revision ? extractTiptapText(decodeStoredChapterContent(revision.content)) : null,
    ).toContain("这是导入的正文");
    lease.close();
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("exports current content through text, Markdown, DOCX and EPUB adapters", async () => {
    const harness = createHarness();
    const cases = [
      { format: "text" as const, extension: "txt", options: {} },
      { format: "markdown" as const, extension: "zip", options: { markdownBundle: true } },
      { format: "docx" as const, extension: "docx", options: {} },
      { format: "epub" as const, extension: "epub", options: {} },
    ];
    for (const item of cases) {
      const preview = harness.transfer.prepareExport({
        bookId: harness.provisioned.bookId,
        format: item.format,
        options: item.options,
      });
      expect(preview.extension).toBe(item.extension);
      const outputPath = path.join(harness.root, `export.${item.extension}`);
      const result = await harness.transfer.commitExport({
        exportId: preview.exportId,
        outputPath,
      });
      expect(result.byteLength).toBeGreaterThan(0);
      expect(readFileSync(outputPath).byteLength).toBe(result.byteLength);
      if (item.format === "markdown") {
        const importedPreview = await harness.transfer.prepareImport({
          filePath: outputPath,
          expectedFormat: "markdown",
        });
        expect(importedPreview.volumes[0]?.title).toBe("One");
        expect(importedPreview.volumes[0]?.chapters[0]?.title).toBe("Chapter");
        harness.transfer.cancelImport(importedPreview.sessionId);
      }
      if (item.format === "docx") {
        const archive = await JSZip.loadAsync(readFileSync(outputPath));
        const documentXml = await archive.file("word/document.xml")?.async("string");
        const settingsXml = await archive.file("word/settings.xml")?.async("string");
        expect(documentXml).toContain("TOC \\h \\o &quot;1-3&quot;");
        expect(settingsXml).toContain("<w:updateFields/>");
      }
    }
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("exports a consistent snapshot and imports it with a new local book id", async () => {
    const harness = createHarness();
    const packagePath = path.join(harness.root, "book.storyos-book");
    await harness.transfer.exportBook({
      bookId: harness.provisioned.bookId,
      outputPath: packagePath,
    });

    const imported = harness.transfer.importBook({ packagePath });

    expect(imported.bookId).not.toBe(harness.provisioned.bookId);
    expect(imported.sourceBookId).toBe(harness.provisioned.bookId);
    expect(harness.books.listProjectIdsForBook(imported.bookId)).toEqual([]);
    const lease = harness.runtimes.acquire(imported.bookId);
    const novels = new NovelApplication(lease.persistence);
    const novel = novels.getProjectBook();
    expect(novel?.title).toBe("Transfer book");
    const chapter = novel ? novels.listChapters(novel.id)[0] : null;
    expect(chapter ? novels.getCurrentRevision(chapter.id)?.content : null).toBe(
      canonicalDoc(textDoc("portable text")),
    );
    lease.close();

    const second = harness.transfer.importBook({ packagePath });
    expect(second.bookId).not.toBe(imported.bookId);
    expect(harness.books.listBooks()).toHaveLength(3);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("rejects checksum tampering without registering a partial book", async () => {
    const harness = createHarness();
    const packagePath = path.join(harness.root, "tampered.storyos-book");
    await harness.transfer.exportBook({
      bookId: harness.provisioned.bookId,
      outputPath: packagePath,
    });
    const envelope = JSON.parse(readFileSync(packagePath, "utf8"));
    envelope.files["book.sqlite"] = Buffer.from("not a database").toString("base64");
    writeFileSync(packagePath, JSON.stringify(envelope));

    expect(() => harness.transfer.importBook({ packagePath })).toThrow("checksum mismatch");
    expect(harness.books.listBooks()).toHaveLength(1);
    harness.runtimes.closeAll();
    harness.database.close();
  });

  it("rejects future versions and unsafe package entries", async () => {
    const harness = createHarness();
    const futurePath = path.join(harness.root, "future.storyos-book");
    await harness.transfer.exportBook({
      bookId: harness.provisioned.bookId,
      outputPath: futurePath,
    });
    const future = JSON.parse(readFileSync(futurePath, "utf8"));
    const manifest = JSON.parse(
      Buffer.from(future.files["manifest.json"], "base64").toString("utf8"),
    );
    manifest.databaseUserVersion = 999;
    const manifestContent = Buffer.from(JSON.stringify(manifest));
    future.files["manifest.json"] = manifestContent.toString("base64");
    const checksums = JSON.parse(
      Buffer.from(future.files["checksums.json"], "base64").toString("utf8"),
    );
    checksums.files["manifest.json"] = sha256(manifestContent);
    future.files["checksums.json"] = Buffer.from(JSON.stringify(checksums)).toString("base64");
    writeFileSync(futurePath, JSON.stringify(future));
    expect(() => harness.transfer.importBook({ packagePath: futurePath })).toThrow(
      "unsupported future database version",
    );

    const unsafePath = path.join(harness.root, "unsafe.storyos-book");
    const unsafe = JSON.parse(readFileSync(futurePath, "utf8"));
    unsafe.files["../outside"] = Buffer.from("bad").toString("base64");
    writeFileSync(unsafePath, JSON.stringify(unsafe));
    expect(() => harness.transfer.importBook({ packagePath: unsafePath })).toThrow(
      "invalid file list",
    );
    expect(harness.books.listBooks()).toHaveLength(1);
    harness.runtimes.closeAll();
    harness.database.close();
  });
});
