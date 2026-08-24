import { describe, expect, it, vi } from "vitest";
import ToolPolicy from "../../src/main/agent/security/ToolPolicy.ts";
import { createEditorTools } from "../../src/main/agent/tools/editor/editorTools.ts";
import type { RendererEditorToolClient } from "../../src/main/agent/tools/editor/contracts.ts";
import type { RegisteredTool } from "../../src/main/agent/tools/ToolResolver.ts";
import { createToolApprovalPreview } from "../../src/main/agent/security/ToolPreview.ts";

function createHarness() {
  const client: RendererEditorToolClient = {
    invoke: vi.fn(async (_projectId, operation) => ({
      chapterId: "chapter-1",
      version: operation.kind === "get_context" ? 4 : 5,
      operation: operation.kind,
    })),
  };
  const tools = Object.fromEntries(
    createEditorTools(client, "project-1").map((item) => [item.name, item]),
  ) as Record<string, RegisteredTool>;
  return { client, tools };
}

describe("live editor tools", () => {
  it("reads live context and applies revision-checked text edits", async () => {
    const { client, tools } = createHarness();

    await tools.get_active_editor_context.invoke({});
    await tools.replace_active_editor_range.invoke({
      chapter_id: "chapter-1",
      expected_version: 4,
      from: 8,
      to: 12,
      replacement: "新文本",
    });

    expect(client.invoke).toHaveBeenNthCalledWith(
      1,
      "project-1",
      { kind: "get_context" },
    );
    expect(client.invoke).toHaveBeenNthCalledWith(2, "project-1", {
      kind: "replace_range",
      chapterId: "chapter-1",
      expectedVersion: 4,
      from: 8,
      to: 12,
      replacement: "新文本",
    });
  });

  it("requires approval for mutations but not live reads", () => {
    const policy = new ToolPolicy();

    expect(policy.getPermission("get_active_editor_context")).toBe("allow");
    expect(policy.getPermission("replace_active_editor_range")).toBe("ask");
    expect(policy.getPermission("format_active_editor_selection")).toBe("ask");
    expect(policy.getPermission("style_active_editor_selection")).toBe("ask");
    expect(policy.getPermission("inspect_active_editor_text")).toBe("allow");
    expect(policy.getPermission("select_active_editor_range")).toBe("allow");
    expect(policy.getPermission("apply_active_editor_styles")).toBe("ask");
  });

  it("passes constrained rich-text styles through the live editor bridge", async () => {
    const { client, tools } = createHarness();

    await tools.style_active_editor_selection.invoke({
      chapter_id: "chapter-1",
      expected_version: 4,
      style: { kind: "paragraph", lineHeight: "1.75", firstLineIndent: true },
    });

    expect(client.invoke).toHaveBeenCalledWith("project-1", {
      kind: "set_style",
      chapterId: "chapter-1",
      expectedVersion: 4,
      style: { kind: "paragraph", lineHeight: "1.75", firstLineIndent: true },
    });
  });

  it("inspects and atomically styles multiple editor text targets", async () => {
    const { client, tools } = createHarness();

    await tools.inspect_active_editor_text.invoke({
      queries: [{ text: "阿澈", case_sensitive: true }],
    });
    await tools.apply_active_editor_styles.invoke({
      chapter_id: "chapter-1",
      expected_version: 4,
      operations: [{
        selector: {
          kind: "text",
          text: "阿澈",
          case_sensitive: true,
          expected_count: 2,
          occurrences: "all",
        },
        style: { kind: "text_color", value: "#2E86AB" },
      }],
    });

    expect(client.invoke).toHaveBeenNthCalledWith(1, "project-1", {
      kind: "inspect_text",
      queries: [{ text: "阿澈", caseSensitive: true }],
    });
    expect(client.invoke).toHaveBeenNthCalledWith(2, "project-1", {
      kind: "apply_targeted_styles",
      chapterId: "chapter-1",
      expectedVersion: 4,
      operations: [{
        selector: {
          kind: "text",
          text: "阿澈",
          caseSensitive: true,
          expectedCount: 2,
          occurrences: { kind: "all" },
        },
        style: { kind: "text_color", value: "#2E86AB" },
      }],
    });
  });

  it("selects verified ranges and renders a useful approval preview", async () => {
    const { client, tools } = createHarness();

    await tools.select_active_editor_range.invoke({
      chapter_id: "chapter-1",
      expected_version: 4,
      from: 2,
      to: 4,
      expected_text: "阿澈",
    });
    expect(client.invoke).toHaveBeenCalledWith("project-1", {
      kind: "select_range",
      chapterId: "chapter-1",
      expectedVersion: 4,
      range: { from: 2, to: 4, expectedText: "阿澈" },
    });

    const preview = createToolApprovalPreview({
      toolCallId: "tool-call-style-preview",
      toolName: "apply_active_editor_styles",
      summary: "",
      input: {
        expected_version: 4,
        operations: [{
          selector: {
            kind: "text",
            text: "阿澈",
            expected_count: 6,
            occurrences: "all",
          },
          style: { kind: "text_color", value: "#2E86AB" },
        }],
      },
    });
    expect(preview).toContain("阿澈");
    expect(preview).toContain("6 处");
    expect(preview).toContain("#2E86AB");
  });
});
