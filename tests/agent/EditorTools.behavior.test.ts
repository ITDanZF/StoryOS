import { describe, expect, it, vi } from "vitest";
import ToolPolicy from "../../src/main/agent/security/ToolPolicy.ts";
import { createEditorTools } from "../../src/main/agent/tools/editor/editorTools.ts";
import type { RendererEditorToolClient } from "../../src/main/agent/tools/editor/contracts.ts";
import type { RegisteredTool } from "../../src/main/agent/tools/ToolResolver.ts";

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
});
