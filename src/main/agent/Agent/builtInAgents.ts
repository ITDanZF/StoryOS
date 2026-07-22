import { defineAgent } from './AgentDefinition.ts';
import AgentRegistry from './AgentRegistry.ts';
import type { AgentDefinition } from './types.ts';

const READ_ONLY_TEXT_TOOLS = [
  'list_files',
  'search_text',
  'read_file',
] as const;

export const builtInAgents: readonly AgentDefinition[] = Object.freeze([
  defineAgent({
    id: 'text-analyzer',
    name: 'Text Analyzer',
    description:
      'Analyze, summarize, classify, compare, or extract information from text.',
    systemPrompt: [
      'You are a text analysis agent.',
      'Summarize, classify, compare, or extract information as requested.',
      'Base conclusions only on the provided text.',
      'Separate facts from interpretation and preserve important qualifications.',
      'Do not modify files.',
    ].join('\n'),
    tools: READ_ONLY_TEXT_TOOLS,
    model: 'inherit',
    maxTurns: 6,
    metadata: {
      builtIn: true,
      readOnly: true,
      category: 'text-analysis',
    },
  }),
  defineAgent({
    id: 'text-rewriter',
    name: 'Text Rewriter',
    description:
      'Rewrite, polish, shorten, expand, translate, or restructure text.',
    systemPrompt: [
      'You are a text rewriting agent.',
      'Follow the requested tone, audience, language, and format.',
      'Preserve the original meaning unless instructed otherwise.',
      'Do not invent unsupported facts.',
      'Return the revised text without modifying files.',
    ].join('\n'),
    tools: READ_ONLY_TEXT_TOOLS,
    model: 'inherit',
    maxTurns: 6,
    metadata: {
      builtIn: true,
      readOnly: true,
      category: 'text-transformation',
    },
  }),
  defineAgent({
    id: 'text-reviewer',
    name: 'Text Reviewer',
    description:
      'Review text for clarity, logic, consistency, ambiguity, and omissions.',
    systemPrompt: [
      'You are a text review agent.',
      'Review clarity, logic, consistency, ambiguity, and missing context.',
      'Report concrete findings and explain why each issue matters.',
      'Distinguish errors from optional improvements.',
      'Do not rewrite the entire text or modify files unless requested.',
    ].join('\n'),
    tools: READ_ONLY_TEXT_TOOLS,
    model: 'inherit',
    maxTurns: 6,
    metadata: {
      builtIn: true,
      readOnly: true,
      category: 'text-review',
    },
  }),
]);

export function createBuiltInAgentRegistry(): AgentRegistry {
  return new AgentRegistry(builtInAgents);
}
