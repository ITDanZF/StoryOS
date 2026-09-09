import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tool } from "langchain";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentOrchestrator,
  AgentRegistry,
  defineAgent,
  ToolResolver,
  ToolPolicy,
  WorkspaceToolContext,
  type ExecutionRequirements,
  type ToolManifest,
} from "../../src/main/agent/index.ts";
import type { ModelRunInput } from "../../src/main/agent/model/ModelGateway.ts";
import ToolAccessResolver from "../../src/main/agent/tools/ToolAccessResolver.ts";
import AgentMatcher from "../../src/main/agent/orchestration/AgentMatcher.ts";
import { executionRequirementsSchema } from "../../src/main/agent/orchestration/schemas.ts";
import { createTools } from "../../src/main/agent/tools/index.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function requirements(effects: readonly string[] = []): ExecutionRequirements {
  return {
    capabilities: ["inventory.inspect"],
    effects,
    contextKinds: ["warehouse"],
    outputKind: "text",
    decomposition: "forbidden",
  };
}

describe("generic Agent engine", () => {
  it("runs a host-defined write tool through the public factory without product configuration", async () => {
    const reserve = vi.fn(async () => "reserved");
    const implementation = tool(reserve, {
      name: "reserve_stock",
      description: "Reserve one inventory item.",
      schema: z.object({}),
    });
    const resolver = new ToolResolver(
      [implementation],
      (entry): ToolManifest => ({
        id: entry.name,
        title: entry.name,
        description: entry.description,
        provides: ["inventory.reserve"],
        effects: ["inventory.write"],
        requiredContexts: ["warehouse"],
        approval: "ask",
        risk: "medium",
      }),
    );
    const invokeText = vi.fn(async () => "unexpected planning");
    const engine = createAgentOrchestrator({
      agents: [],
      toolResolver: resolver,
      limits: { maxTurns: 3, maxToolCalls: 5, timeoutMs: 0, maxDelegationDepth: 1 },
      model: {
        invokeText,
        async *stream(input: ModelRunInput) {
          expect(input.prompt).toBe("Warehouse A: reserve item 17.");
          expect(input.systemPrompt).not.toMatch(/StoryOS|book|chapter/i);
          const action = input.tools.find((entry) => entry.name === "reserve_stock");
          if (!action) throw new Error("Missing host tool");
          yield String(await action.invoke({}));
        },
      },
    });
    const approval = vi.fn(async () => "allow_once" as const);
    const result = await engine.run(
      {
        message: { messageId: "request-1", content: "Reserve item 17" },
        prompt: "Warehouse A: reserve item 17.",
        requirements: { ...requirements(["inventory.write"]), capabilities: ["inventory.reserve"] },
      },
      {
        runId: "inventory-run",
        threadId: "inventory-thread",
        approval,
        onChunk: () => undefined,
        onAgentEvent: () => undefined,
      },
    );
    expect(result).toBe("reserved");
    expect(reserve).toHaveBeenCalledOnce();
    expect(approval).toHaveBeenCalledOnce();
    expect(invokeText).not.toHaveBeenCalled();
  });

  it("requires both the declared effect and context for an external write capability", () => {
    const implementation = tool(async () => "ok", {
      name: "reserve_stock",
      description: "Reserve stock",
      schema: z.object({}),
    });
    const resolver = new ToolResolver([implementation], (entry) => ({
      id: entry.name,
      title: entry.name,
      description: entry.description,
      provides: ["inventory.reserve"],
      effects: ["inventory.write"],
      requiredContexts: ["warehouse"],
      approval: "ask",
      risk: "medium",
    }));
    const access = new ToolAccessResolver(resolver.registry);
    expect(access.forDirect(requirements()).toolIds).toEqual([]);
    expect(
      access.forDirect({ ...requirements(["inventory.write"]), contextKinds: ["global"] }).toolIds,
    ).toEqual([]);
    expect(access.forDirect(requirements(["inventory.write"])).toolIds).toEqual(["reserve_stock"]);
    expect(new ToolPolicy().getPermission("reserve_stock")).toBe("deny");
    expect(() => new ToolResolver([implementation])).toThrow("Tool manifest is required");
  });

  it("matches custom planned capabilities and rejects capabilities no registered agent provides", () => {
    const resolver = new ToolResolver([]);
    const registry = new AgentRegistry([
      defineAgent({
        id: "stock-auditor",
        name: "Stock auditor",
        description: "Inspect supplied stock data",
        systemPrompt: "Audit supplied inventory records.",
        capabilities: ["inventory.inspect"],
        allowedToolIds: [],
        allowedEffects: [],
        acceptedContexts: ["warehouse"],
        executionModes: ["planned"],
        outputKinds: ["text"],
        limits: { maxTurns: 2 },
      }),
    ]);
    registry.validateAgainstTools(resolver.registry);
    const matcher = new AgentMatcher(registry, new ToolAccessResolver(resolver.registry));
    const parsed = executionRequirementsSchema.parse(requirements());
    expect(matcher.hasCandidate({ requirements: parsed })).toBe(true);
    expect(
      matcher.hasCandidate({ requirements: { ...parsed, capabilities: ["billing.inspect"] } }),
    ).toBe(false);
    expect(
      matcher.hasCandidate({ requirements: { ...parsed, effects: ["inventory.write"] } }),
    ).toBe(false);
  });

  it("honors host-defined internal directories in both direct access and recursive listing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "generic-engine-"));
    roots.push(root);
    mkdirSync(path.join(root, ".private"));
    writeFileSync(path.join(root, ".private", "secret.txt"), "private state");
    writeFileSync(path.join(root, "public.txt"), "public content");
    const context = new WorkspaceToolContext(
      root,
      path.join(root, ".private", "index"),
      undefined,
      [".private"],
    );
    expect(() => context.paths.resolve(".private/secret.txt")).toThrow("internal state");
    expect(() => context.paths.resolve("../outside.txt")).toThrow("outside");
    const tools = createTools({ workspaceContext: context });
    expect(tools.map((entry) => entry.name).join(" ")).not.toMatch(/book|editor/);
    const list = tools.find((entry) => entry.name === "list_files");
    if (!list) throw new Error("Missing list tool");
    const output = String(await list.invoke({}));
    expect(output).toContain("public.txt");
    expect(output).not.toContain("secret.txt");
  });
});
