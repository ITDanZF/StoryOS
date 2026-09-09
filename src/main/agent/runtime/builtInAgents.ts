import {
  textAnalyzerPrompt,
  textReviewerPrompt,
  textRewriterPrompt,
} from "../prompts/builtInAgents.prompt.ts";
import { defineAgent } from "./AgentDefinition.ts";
import AgentRegistry from "./AgentRegistry.ts";
import type { AgentDefinition } from "./types.ts";

const READ_ONLY_TEXT_TOOLS = ["list_files", "search_text", "read_file"] as const;

export const builtInAgents: readonly AgentDefinition[] = Object.freeze([
  defineAgent({
    id: "text-analyzer",
    name: "Text Analyzer",
    description: "Analyze, summarize, classify, compare, or extract information from text.",
    systemPrompt: textAnalyzerPrompt,
    capabilities: ["text.inspect", "text.search", "workspace.read"],
    allowedToolIds: READ_ONLY_TEXT_TOOLS,
    allowedEffects: [],
    acceptedContexts: ["global"],
    executionModes: ["planned"],
    outputKinds: ["text"],
    model: "inherit",
    limits: { maxTurns: 6 },
    metadata: {
      builtIn: true,
      category: "text-analysis",
    },
  }),
  defineAgent({
    id: "text-rewriter",
    name: "Text Rewriter",
    description: "Rewrite, polish, shorten, expand, translate, or restructure text.",
    systemPrompt: textRewriterPrompt,
    capabilities: ["text.rewrite", "workspace.read"],
    allowedToolIds: READ_ONLY_TEXT_TOOLS,
    allowedEffects: [],
    acceptedContexts: ["global"],
    executionModes: ["planned"],
    outputKinds: ["text"],
    model: "inherit",
    limits: { maxTurns: 6 },
    metadata: {
      builtIn: true,
      category: "text-transformation",
    },
  }),
  defineAgent({
    id: "text-reviewer",
    name: "Text Reviewer",
    description: "Review text for clarity, logic, consistency, ambiguity, and omissions.",
    systemPrompt: textReviewerPrompt,
    capabilities: ["text.review", "workspace.read"],
    allowedToolIds: READ_ONLY_TEXT_TOOLS,
    allowedEffects: [],
    acceptedContexts: ["global"],
    executionModes: ["planned"],
    outputKinds: ["text"],
    model: "inherit",
    limits: { maxTurns: 6 },
    metadata: {
      builtIn: true,
      category: "text-review",
    },
  }),
]);

export function createBuiltInAgentRegistry(): AgentRegistry {
  return new AgentRegistry(builtInAgents);
}
