import { createTools, type CreateToolsOptions } from "./index.ts";
import type { ClientTool } from '@langchain/core/tools';
import ToolRegistry from "./ToolRegistry.ts";

export type RegisteredTool = ClientTool;

function isToolArray(value: unknown): value is readonly RegisteredTool[] {
  return Array.isArray(value);
}

export default class ToolResolver {
  readonly registry: ToolRegistry;

  constructor(toolsOrOptions?: readonly RegisteredTool[] | CreateToolsOptions) {
    const tools = isToolArray(toolsOrOptions)
      ? toolsOrOptions
      : createTools(toolsOrOptions);

    this.registry = new ToolRegistry(tools);
  }

  resolve(toolNames: readonly string[]): RegisteredTool[] {
    return this.registry.resolve(toolNames);
  }

  has(toolName: string): boolean {
    return this.registry.has(toolName);
  }

  listNames(): readonly string[] {
    return this.registry.listNames();
  }
}
