import type { ClientTool } from "@langchain/core/tools";
import {
  createToolManifest,
  type RegisteredTool,
  type ToolManifest,
} from "./ToolManifest.ts";

export default class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(implementations: readonly ClientTool[]) {
    for (const implementation of implementations) {
      const manifest = createToolManifest(implementation);
      if (this.tools.has(manifest.id)) {
        throw new Error(`Tool already registered: ${manifest.id}`);
      }
      this.tools.set(manifest.id, Object.freeze({ manifest, implementation }));
    }
  }

  get(id: string): RegisteredTool {
    const tool = this.tools.get(id);
    if (!tool) {
      const available = [...this.tools.keys()].join(", ") || "none";
      throw new Error(`Unknown tool: ${id}. Available tools: ${available}.`);
    }
    return tool;
  }

  getManifest(id: string): ToolManifest {
    return this.get(id).manifest;
  }

  resolve(ids: readonly string[]): ClientTool[] {
    return ids.map((id) => this.get(id).implementation);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  list(): readonly RegisteredTool[] {
    return Object.freeze([...this.tools.values()]);
  }

  listNames(): readonly string[] {
    return Object.freeze([...this.tools.keys()]);
  }
}

