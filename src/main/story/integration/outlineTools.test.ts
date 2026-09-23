import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import AgentRegistry from "../../agent/runtime/AgentRegistry.ts";
import AgentRuntime from "../../agent/runtime/AgentRuntime.ts";
import { compileSkillAgent } from "../../agent/skills/SkillAgentCompiler.ts";
import { parseSkillFile } from "../../agent/skills/SkillManifest.ts";
import { KNOWN_M0_TOOL_NAMES } from "../../agent/skills/DefaultSkillIndex.ts";
import type { SkillDefinition } from "../../agent/skills/SkillTypes.ts";
import ToolAccessResolver from "../../agent/tools/ToolAccessResolver.ts";
import { guardTools } from "../../agent/tools/security/GuardedTool.ts";
import ToolResolver from "../../agent/tools/ToolResolver.ts";
import { describeToolSecurity, NARRATIVE_OUTLINE_TOOL_IDS } from "./StoryToolManifest.ts";
import StoryToolPolicy from "./StoryToolPolicy.ts";
import { grantsStoryEffects } from "./StoryToolAccess.ts";
import BookToolContext from "./tools/book/BookToolContext.ts";
import { createBookReadTools } from "./tools/book/readBook.ts";
import { createOutlineMutationTools } from "./tools/outline/proposeOutlinePatch.ts";
import { createOutlineTools } from "./tools/outline/index.ts";

function skill(fileName: string): SkillDefinition {
  const filePath = path.resolve("skills", fileName, "SKILL.md");
  const parsed = parseSkillFile(readFileSync(filePath, "utf8"));
  return {
    manifest: parsed.manifest,
    body: parsed.body,
    source: { type: "system", root: path.dirname(filePath), filePath },
    loadedAt: new Date("2026-09-23T00:00:00.000Z"),
  };
}

describe("outline tools and skills", () => {
  it("keeps the book catalog shape and leaves outline tools off the default list", async () => {
    const novels = {
      getProjectBook: () => ({
        id: "book-1",
        title: "示例",
        synopsis: "",
        status: "writing" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      listVolumes: () => [],
      listChapters: () => [],
    };
    const readTools = createBookReadTools(new BookToolContext("prj_test", novels as never));
    const catalog = readTools.find((item) => item.name === "get_book_outline");
    if (!catalog) throw new Error("get_book_outline is missing");
    const parsed = JSON.parse(await catalog.invoke({})) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["book", "projectId", "unassignedChapters", "volumes"]);
    const resolver = new ToolResolver(
      [...readTools, ...createOutlineTools(() => {
        throw new Error("outline should not be called");
      }, "prj_test")],
      (tool) => ({
        id: tool.name,
        title: tool.name,
        description: tool.description ?? "",
        ...describeToolSecurity(tool.name),
      }),
    );
    const granted = new ToolAccessResolver(resolver.registry, grantsStoryEffects).forDirect({
      capabilities: [],
      effects: [],
      contextKinds: ["book-editor"],
      outputKind: "text",
      decomposition: "forbidden",
    });
    expect(granted.toolIds).toContain("get_book_outline");
    for (const toolId of NARRATIVE_OUTLINE_TOOL_IDS) {
      expect(granted.toolIds).not.toContain(toolId);
    }
  });

  it("does not write an outline patch when approval is denied", async () => {
    let called = false;
    const applyTool = createOutlineMutationTools(() => {
      called = true;
      throw new Error("should not write");
    }, "prj_test").find((item) => item.name === "apply_outline_patch");
    if (!applyTool) throw new Error("apply_outline_patch is missing");
    const [guarded] = guardTools([applyTool], {
      policy: new StoryToolPolicy(),
      approval: async () => "deny",
    });
    if (!guarded) throw new Error("guarded tool is missing");
    const result = await guarded.invoke({
      patch: {
        outlineId: "outline_1",
        expectedRevision: 1,
        operations: [{ type: "delete_node", nodeId: "node_1" }],
      },
    });
    expect(result).toContain("Tool execution denied by user");
    expect(called).toBe(false);
  });

  it("compiles event-graph and chapter-writer without delegate_task", async () => {
    const known = KNOWN_M0_TOOL_NAMES;
    const eventGraph = compileSkillAgent(skill("event-graph"), {
      knownToolNames: known,
      describeTool: describeToolSecurity,
    });
    const writer = compileSkillAgent(skill("chapter-writer"), {
      knownToolNames: known,
      describeTool: describeToolSecurity,
    });
    expect(eventGraph?.metadata?.source).toBe("skill");
    expect(eventGraph?.acceptedContexts).toEqual(["book-editor"]);
    expect(eventGraph?.executionModes).toEqual(["direct"]);
    expect(eventGraph?.allowedToolIds).not.toContain("delegate_task");
    expect(eventGraph?.limits.maxTurns).toBe(8);
    expect(writer?.allowedToolIds).toEqual(["generate_book_chapter_content"]);
    expect(writer?.allowedToolIds).not.toContain("delegate_task");
    expect(writer?.limits.maxTurns).toBe(4);
    if (!eventGraph) throw new Error("event-graph did not compile");
    const runtime = new AgentRuntime(
      new AgentRegistry([eventGraph]),
      { stream() { throw new Error("unused"); } } as never,
      new ToolResolver([]),
      new StoryToolPolicy(),
    );
    await expect(
      runtime.run({
        agentType: "event-graph",
        prompt: "展开一层",
        parentThreadId: "thread_1",
        grantedToolIds: ["delegate_task"],
      }),
    ).rejects.toThrow("Tool grant exceeds agent manifest: event-graph/delegate_task");
  });
});
