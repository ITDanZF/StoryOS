import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ToolPolicy from "../../src/main/agent/security/ToolPolicy.ts";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";
import { createBatchEditTextTool } from "../../src/main/agent/tools/text/batchEditText.ts";
import { createCompareTextTool } from "../../src/main/agent/tools/text/compareText.ts";
import { createEditTextRangeTool } from "../../src/main/agent/tools/text/editTextRange.ts";
import { createExtractTextTool } from "../../src/main/agent/tools/text/extractText.ts";
import { createNormalizeTextTool } from "../../src/main/agent/tools/text/normalizeText.ts";
import { createSplitTextTool } from "../../src/main/agent/tools/text/splitText.ts";
import { createTextStatsTool } from "../../src/main/agent/tools/text/textStats.ts";
import { createValidateTextTool } from "../../src/main/agent/tools/text/validateText.ts";

const roots: string[] = [];

function createContext() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-text-tools-"));
  roots.push(root);
  return {
    root,
    context: new WorkspaceToolContext(root),
  };
}

type ParsedToolResult = {
  readonly [key: string]: unknown;
  readonly revision?: string;
  readonly result: {
    readonly [key: string]: unknown;
    readonly content?: string;
    readonly matches?: readonly Record<string, unknown>[];
    readonly chunks?: readonly { readonly text: string }[];
    readonly changes?: readonly Record<string, unknown>[];
    readonly issues?: readonly Record<string, unknown>[];
  };
};

function parseResult(value: unknown): ParsedToolResult {
  return JSON.parse(String(value)) as ParsedToolResult;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("general text tool behavior", () => {
  it("calculates deterministic multilingual statistics", async () => {
    const { context } = createContext();
    const result = parseResult(await createTextStatsTool(context).invoke({
      text: "你好 world!\n\n第二段。",
    }));

    expect(result.result).toMatchObject({
      lines: 3,
      paragraphs: 2,
      sentences: 2,
      cjk_characters: 5,
      latin_words: 1,
    });
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it("previews and applies a revision-checked range edit", async () => {
    const { root, context } = createContext();
    const filePath = path.join(root, "chapter.txt");
    writeFileSync(filePath, "第一章\n旧文本\n", "utf8");
    const edit = createEditTextRangeTool(context);
    const input = {
      path: "chapter.txt",
      start_line: 2,
      start_column: 1,
      end_line: 2,
      end_column: 4,
      replacement: "新文本",
    };

    const preview = parseResult(await edit.invoke({
      ...input,
      preview_only: true,
    }));
    expect(preview.result.content).toBe("第一章\n新文本\n");
    expect(readFileSync(filePath, "utf8")).toBe("第一章\n旧文本\n");

    const applied = parseResult(await edit.invoke({
      ...input,
      expected_revision: preview.revision,
    }));
    expect(applied.changed).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe("第一章\n新文本\n");

    await expect(edit.invoke({
      ...input,
      replacement: "再次修改",
      expected_revision: preview.revision,
    })).rejects.toThrow("revision conflict");
  });

  it("applies non-overlapping batch edits and rejects overlapping ranges", async () => {
    const { context } = createContext();
    const edit = createBatchEditTextTool(context);
    const result = parseResult(await edit.invoke({
      text: "abcdef",
      operations: [
        {
          type: "replace",
          range: {
            start: { line: 1, column: 2 },
            end: { line: 1, column: 4 },
          },
          text: "BC",
        },
        {
          type: "delete",
          range: {
            start: { line: 1, column: 5 },
            end: { line: 1, column: 6 },
          },
        },
        {
          type: "insert",
          at: { line: 1, column: 7 },
          text: "!",
        },
      ],
    }));
    expect(result.result.content).toBe("aBCdf!");

    await expect(edit.invoke({
      text: "abcdef",
      operations: [
        {
          type: "delete",
          range: {
            start: { line: 1, column: 2 },
            end: { line: 1, column: 5 },
          },
        },
        {
          type: "replace",
          range: {
            start: { line: 1, column: 3 },
            end: { line: 1, column: 6 },
          },
          text: "x",
        },
      ],
    })).rejects.toThrow("overlap");
  });

  it("compares two texts with line-level changes", async () => {
    const { context } = createContext();
    const result = parseResult(await createCompareTextTool(context).invoke({
      left_text: "one\ntwo\nthree",
      right_text: "one\nsecond\nthree\nfour",
    }));

    expect(result.result).toMatchObject({
      identical: false,
      additions: 2,
      removals: 1,
      common_lines: 2,
    });
    expect(result.result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "remove", text: "two" }),
      expect.objectContaining({ type: "add", text: "second" }),
      expect.objectContaining({ type: "add", text: "four" }),
    ]));
  });

  it("normalizes only explicitly selected text rules", async () => {
    const { context } = createContext();
    const result = parseResult(await createNormalizeTextTool(context).invoke({
      text: "Ａ\tline  \n\n\nend",
      full_width_ascii: true,
      tabs_to_spaces: 2,
      trim_lines: true,
      max_consecutive_blank_lines: 1,
      target_line_ending: "lf",
    }));

    expect(result.result.content).toBe("A  line\n\nend");
  });

  it("extracts capture groups with exact positions", async () => {
    const { context } = createContext();
    const result = parseResult(await createExtractTextTool(context).invoke({
      text: "角色：Alice\n角色：Bob",
      pattern: "角色：(\\w+)",
      regex: true,
      capture_group: 1,
    }));

    expect(result.result.matches).toEqual([
      expect.objectContaining({
        value: "Alice",
        start: { line: 1, column: 4 },
      }),
      expect.objectContaining({
        value: "Bob",
        start: { line: 2, column: 4 },
      }),
    ]);
  });

  it("splits paragraphs into positioned chunks", async () => {
    const { context } = createContext();
    const result = parseResult(await createSplitTextTool(context).invoke({
      text: "第一段\n\n第二段\n\n第三段",
      strategy: "paragraphs",
      max_size: 1,
    }));

    expect(result.result.chunk_count).toBe(3);
    expect(result.result.chunks?.map((chunk) => chunk.text))
      .toEqual(["第一段", "第二段", "第三段"]);
  });

  it("reports deterministic validation issues with positions", async () => {
    const { context } = createContext();
    const result = parseResult(await createValidateTextTool(context).invoke({
      text: "# 标题\n\n### 跳级标题\n禁用词",
      required_terms: ["标题"],
      forbidden_terms: ["禁用词"],
      markdown_heading_hierarchy: true,
    }));

    expect(result.result.valid).toBe(false);
    expect(result.result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: "forbidden_term",
        start: { line: 4, column: 1 },
      }),
      expect.objectContaining({ rule: "markdown_heading_hierarchy" }),
    ]));
  });

  it("allows inline and preview processing without mutation approval", () => {
    const policy = new ToolPolicy();

    expect(policy.getPermission("normalize_text", { text: "value" }))
      .toBe("allow");
    expect(policy.getPermission("normalize_text", {
      path: "chapter.txt",
      preview_only: true,
    })).toBe("allow");
    expect(policy.getPermission("normalize_text", { path: "chapter.txt" }))
      .toBe("ask");
  });
});
