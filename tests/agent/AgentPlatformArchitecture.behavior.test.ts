import { tool } from "langchain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import AgentRegistry from "../../src/main/agent/runtime/AgentRegistry.ts";
import ToolAccessResolver from "../../src/main/agent/tools/ToolAccessResolver.ts";
import ToolResolver from "../../src/main/story/integration/StoryToolResolver.ts";
import PromptCompiler from "../../src/main/story/integration/StoryPromptCompiler.ts";

function createTool(name: "read_file" | "write_file") {
  return tool(async () => "ok", {
    name,
    description: `${name} test tool`,
    schema: z.object({}),
  });
}

describe("Agent platform architecture", () => {
  it("computes direct tool grants from declared effects", () => {
    const resolver = new ToolResolver([createTool("read_file"), createTool("write_file")]);
    const access = new ToolAccessResolver(resolver.registry);
    const common = {
      capabilities: ["workspace.read" as const],
      contextKinds: ["global" as const],
      outputKind: "text" as const,
      decomposition: "forbidden" as const,
    };

    expect(access.forDirect({ ...common, effects: [] }).toolIds).toEqual(["read_file"]);
    expect(
      access.forDirect({
        ...common,
        capabilities: ["workspace.write"],
        effects: ["workspace.write"],
      }).toolIds,
    ).toEqual(["read_file", "write_file"]);
  });

  it("rejects a planned agent that declares write effects", () => {
    const tools = new ToolResolver([createTool("write_file")]);
    const agents = new AgentRegistry([
      {
        id: "unsafe-planned-agent",
        name: "Unsafe",
        description: "Invalid planned agent.",
        systemPrompt: "Do work.",
        capabilities: ["workspace.write"],
        allowedToolIds: ["write_file"],
        allowedEffects: ["workspace.write"],
        acceptedContexts: ["global"],
        executionModes: ["planned"],
        outputKinds: ["text"],
        limits: { maxTurns: 2 },
      },
    ]);

    expect(() => agents.validateAgainstTools(tools.registry)).toThrow(
      "Planned agent cannot declare side effects",
    );
  });

  it("serializes trusted editor context only at the model prompt boundary", () => {
    const prompt = new PromptCompiler().compile({
      message: { messageId: "message-1", content: "分析当前章节" },
      context: {
        kind: "book_editor",
        projectId: "project-1",
        projectName: "Story",
        book: { id: "book-1", title: "测试书籍" },
        chapter: null,
      },
    });

    expect(prompt).toContain("<trusted_storyos_context>");
    expect(prompt).toContain("<user_request>\n分析当前章节\n</user_request>");
    expect(prompt).not.toContain("<storyos_workspace_context>");
  });
});
