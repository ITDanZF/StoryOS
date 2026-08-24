import type { ToolCallNode } from "../model/conversationNode.ts";

export type ToolPresentation = {
  readonly label: string;
  readonly summary: string;
};

type ToolPresenter = {
  readonly matches: (toolName: string) => boolean;
  readonly present: (node: ToolCallNode) => ToolPresentation;
};

const presenters: readonly ToolPresenter[] = [
  {
    matches: (name) => /read.*chapter|chapter.*read/i.test(name),
    present: (node) => ({ label: "读取", summary: node.summary }),
  },
  {
    matches: (name) => /search|find|query/i.test(name),
    present: (node) => ({ label: "搜索", summary: node.summary }),
  },
  {
    matches: (name) => /edit|rewrite|update|mutate/i.test(name),
    present: (node) => ({ label: "修改", summary: node.summary }),
  },
  {
    matches: (name) => /generate.*chapter|chapter.*generate/i.test(name),
    present: (node) => ({ label: "创作", summary: node.summary }),
  },
];

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getToolPresentation(node: ToolCallNode): ToolPresentation {
  return presenters.find((presenter) => presenter.matches(node.toolName))?.present(node) ?? {
    label: humanizeToolName(node.toolName),
    summary: node.summary,
  };
}

