import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";
import { createReadFileTool } from "../../src/main/agent/tools/io/readFile.ts";
import { createWriteFileTool } from "../../src/main/agent/tools/io/writeFile.ts";

const roots: string[] = [];

function createWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-tools-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace file tool behavior", () => {
  it("requires an existing file to be read before it can be overwritten", async () => {
    const root = createWorkspace();
    writeFileSync(path.join(root, "chapter.md"), "first draft", "utf8");
    const context = new WorkspaceToolContext(root);
    const writeFile = createWriteFileTool(context);

    await expect(
      writeFile.invoke({ path: "chapter.md", content: "second draft" }),
    ).rejects.toThrow("File has not been read yet");
  });

  it("allows a full read followed by an overwrite through a short-path workspace alias", async () => {
    const root = createWorkspace();
    const chapterPath = path.join(root, "chapter.md");
    writeFileSync(chapterPath, "first draft", "utf8");
    const context = new WorkspaceToolContext(root);
    const readFile = createReadFileTool(context);
    const writeFile = createWriteFileTool(context);

    await readFile.invoke({ path: "chapter.md" });
    await expect(
      writeFile.invoke({ path: "chapter.md", content: "second draft" }),
    ).resolves.toBe("File updated: chapter.md");
    expect(readFileSync(chapterPath, "utf8")).toBe("second draft");
  });

  it("does not share read authorization between separate contexts", async () => {
    const root = createWorkspace();
    writeFileSync(path.join(root, "chapter.md"), "first draft", "utf8");
    const readerContext = new WorkspaceToolContext(root);
    const writerContext = new WorkspaceToolContext(root);

    await createReadFileTool(readerContext).invoke({ path: "chapter.md" });
    await expect(
      createWriteFileTool(writerContext).invoke({
        path: "chapter.md",
        content: "second draft",
      }),
    ).rejects.toThrow("File has not been read yet");
  });
});
