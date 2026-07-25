import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ToolPolicy from "../../src/main/agent/security/ToolPolicy.ts";
import WorkspaceToolContext from "../../src/main/agent/tools/WorkspaceToolContext.ts";
import { createAnalyzeTextStructureTool } from "../../src/main/agent/tools/text/analyzeTextStructure.ts";
import { createInspectTextTool } from "../../src/main/agent/tools/text/inspectText.ts";
import { createTextTools } from "../../src/main/agent/tools/text/index.ts";
import { createMergeTextTool } from "../../src/main/agent/tools/text/mergeText.ts";
import { createReplaceTextTool } from "../../src/main/agent/tools/text/replaceText.ts";
import { createTransformLinesTool } from "../../src/main/agent/tools/text/transformLines.ts";

const roots: string[] = [];

function createContext() {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-text-intelligence-"));
  roots.push(root);
  return {
    root,
    context: new WorkspaceToolContext(root),
  };
}

function parseResult<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("extended general text tool behavior", () => {
  it("registers the complete deterministic text tool set", () => {
    const { context } = createContext();
    expect(createTextTools(context).map((item) => item.name)).toEqual([
      "text_stats",
      "edit_text_range",
      "batch_edit_text",
      "compare_text",
      "normalize_text",
      "extract_text",
      "split_text",
      "validate_text",
      "replace_text",
      "transform_lines",
      "merge_text",
      "inspect_text",
      "analyze_text_structure",
      "ranked_search_text",
      "find_similar_text",
      "select_text_context",
    ]);
  });

  it("supports literal and capture-aware replacement rules", async () => {
    const { context } = createContext();
    const result = parseResult<{
      readonly result: {
        readonly content: string;
        readonly total_replacements: number;
      };
    }>(
      await createReplaceTextTool(context).invoke({
        text: "price: TOKEN\nDoe, Jane",
        rules: [
          {
            pattern: "TOKEN",
            replacement: "$1",
          },
          {
            pattern: "(\\w+), (\\w+)",
            replacement: "$2 $1",
            regex: true,
          },
        ],
      }),
    );

    expect(result.result).toMatchObject({
      content: "price: $1\nJane Doe",
      total_replacements: 2,
    });
  });

  it("applies ordered line transformations", async () => {
    const { context } = createContext();
    const result = parseResult<{
      readonly result: { readonly content: string };
    }>(
      await createTransformLinesTool(context).invoke({
        text: " beta \nalpha\nbeta\n\n",
        steps: [
          { type: "trim", side: "both" },
          { type: "remove_empty" },
          {
            type: "deduplicate",
            case_sensitive: false,
            trim_before_compare: true,
          },
          { type: "sort", direction: "ascending" },
        ],
      }),
    );

    expect(result.result.content).toBe("alpha\nbeta\n");
  });

  it("merges sources and revision-checks an existing output", async () => {
    const { root, context } = createContext();
    writeFileSync(path.join(root, "one.txt"), "第一段", "utf8");
    const merge = createMergeTextTool(context);

    const created = parseResult<{
      readonly output: {
        readonly operation: string;
        readonly revision: string;
      };
    }>(
      await merge.invoke({
        sources: [
          { path: "one.txt", label: "一" },
          { text: "第二段", label: "二" },
        ],
        add_source_headers: true,
        output_path: "merged.txt",
      }),
    );
    expect(created.output.operation).toBe("created");
    expect(readFileSync(path.join(root, "merged.txt"), "utf8")).toBe(
      "# 一\n\n第一段\n\n# 二\n\n第二段",
    );

    const preview = parseResult<{
      readonly output: { readonly revision: string };
    }>(
      await merge.invoke({
        sources: [{ text: "替换内容" }],
        output_path: "merged.txt",
        preview_only: true,
      }),
    );
    await merge.invoke({
      sources: [{ text: "替换内容" }],
      output_path: "merged.txt",
      expected_output_revision: preview.output.revision,
    });
    expect(readFileSync(path.join(root, "merged.txt"), "utf8")).toBe(
      "替换内容",
    );
  });

  it("inspects UTF-16 text without misclassifying it as binary", async () => {
    const { root, context } = createContext();
    writeFileSync(
      path.join(root, "utf16.txt"),
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("你好\r\n", "utf16le"),
      ]),
    );
    const result = parseResult<{
      readonly encoding: { readonly name: string; readonly bom: string };
      readonly result: {
        readonly likely_binary: boolean;
        readonly line_endings: { readonly crlf: number };
        readonly language: { readonly primary_script: string };
      };
    }>(
      await createInspectTextTool(context).invoke({
        path: "utf16.txt",
      }),
    );

    expect(result.encoding).toMatchObject({
      name: "utf-16le",
      bom: "utf-16le",
    });
    expect(result.result).toMatchObject({
      likely_binary: false,
      line_endings: { crlf: 1 },
      language: { primary_script: "han" },
    });
  });

  it("returns positioned structural nodes and heading relationships", async () => {
    const { context } = createContext();
    const result = parseResult<{
      readonly result: {
        readonly counts: Record<string, number>;
        readonly nodes: ReadonlyArray<{
          readonly id: string;
          readonly type: string;
          readonly parent_heading_id?: string;
        }>;
      };
    }>(
      await createAnalyzeTextStructureTool(context).invoke({
        text: [
          "# 标题",
          "",
          "普通段落。",
          "",
          "## 小节",
          "- 项目",
          "> 引用",
          "“对话”",
          "```txt",
          "code",
          "```",
        ].join("\n"),
      }),
    );

    expect(result.result.counts).toMatchObject({
      heading: 2,
      paragraph: 1,
      unordered_list_item: 1,
      blockquote: 1,
      dialogue: 1,
      code_block: 1,
    });
    const headings = result.result.nodes.filter(
      (node) => node.type === "heading",
    );
    expect(headings[1]?.parent_heading_id).toBe(headings[0]?.id);
  });

  it("applies input-aware permissions to new mutating tools", () => {
    const policy = new ToolPolicy();

    expect(policy.getPermission("inspect_text")).toBe("allow");
    expect(policy.getPermission("analyze_text_structure")).toBe("allow");
    expect(policy.getPermission("ranked_search_text")).toBe("allow");
    expect(policy.getPermission("find_similar_text")).toBe("allow");
    expect(policy.getPermission("select_text_context")).toBe("allow");
    expect(policy.getPermission("replace_text", { text: "value" })).toBe(
      "allow",
    );
    expect(policy.getPermission("replace_text", { path: "draft.txt" })).toBe(
      "ask",
    );
    expect(policy.getPermission("merge_text", { sources: [] })).toBe("allow");
    expect(
      policy.getPermission("merge_text", {
        sources: [],
        output_path: "merged.txt",
      }),
    ).toBe("ask");
  });
});
