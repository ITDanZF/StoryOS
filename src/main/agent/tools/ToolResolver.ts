import { createTools, type CreateToolsOptions } from "./index.ts";

import type { ClientTool } from '@langchain/core/tools';

export type RegisteredTool = ClientTool;

function isToolArray(value: unknown): value is readonly RegisteredTool[] {
  return Array.isArray(value);
}

export default class ToolResolver {
  private readonly toolsByName = new Map<string, RegisteredTool>();

  constructor(toolsOrOptions?: readonly RegisteredTool[] | CreateToolsOptions) {
    const tools = isToolArray(toolsOrOptions)
      ? toolsOrOptions
      : createTools(toolsOrOptions);

    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`Tool already registered: ${tool.name}`);
      }

      this.toolsByName.set(tool.name, tool);
    }
  }

  resolve(toolNames: readonly string[]): RegisteredTool[] {
    return toolNames.map((toolName) => {
      const tool = this.toolsByName.get(toolName);

      if (!tool) {
        const available = [...this.toolsByName.keys()].join(", ") || "none";
        throw new Error(
          `Unknown tool: ${toolName}. Available tools: ${available}.`,
        );
      }

      return tool;
    });
  }

  has(toolName: string): boolean {
    return this.toolsByName.has(toolName);
  }

  listNames(): readonly string[] {
    return Object.freeze([...this.toolsByName.keys()]);
  }
}
