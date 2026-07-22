import { defineAgent } from "./AgentDefinition.ts";
import type { AgentDefinition } from "./types.ts";

export default class AgentRegistry {
  private readonly definitions = new Map<string, AgentDefinition>();

  constructor(definitions: Iterable<AgentDefinition> = []) {
    this.registerMany(definitions);
  }

  get size(): number {
    return this.definitions.size;
  }

  register(definition: AgentDefinition): AgentDefinition {
    const registeredDefinition = defineAgent(definition);

    if (this.definitions.has(registeredDefinition.id)) {
      throw new Error(`Agent already registered: ${registeredDefinition.id}`);
    }

    this.definitions.set(registeredDefinition.id, registeredDefinition);
    return registeredDefinition;
  }

  registerMany(
    definitions: Iterable<AgentDefinition>,
  ): readonly AgentDefinition[] {
    const pending = Array.from(definitions, defineAgent);
    const ids = new Set(this.definitions.keys());

    for (const definition of pending) {
      if (ids.has(definition.id)) {
        throw new Error(`Agent already registered: ${definition.id}`);
      }

      ids.add(definition.id);
    }

    for (const definition of pending) {
      this.definitions.set(definition.id, definition);
    }

    return Object.freeze(pending);
  }

  replaceWhere(
    predicate: (definition: AgentDefinition) => boolean,
    definitions: Iterable<AgentDefinition>,
  ): readonly AgentDefinition[] {
    const pending = Array.from(definitions, defineAgent);
    const ids = new Set<string>();

    for (const definition of pending) {
      if (ids.has(definition.id)) {
        throw new Error(`Agent already registered: ${definition.id}`);
      }
      ids.add(definition.id);
    }

    for (const [agentId, definition] of this.definitions.entries()) {
      if (predicate(definition)) {
        this.definitions.delete(agentId);
      }
    }

    for (const agentId of this.definitions.keys()) {
      if (ids.has(agentId)) {
        throw new Error(`Agent already registered: ${agentId}`);
      }
    }

    for (const definition of pending) {
      this.definitions.set(definition.id, definition);
    }

    return Object.freeze(pending);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): AgentDefinition {
    const definition = this.definitions.get(id);

    if (!definition) {
      const available = [...this.definitions.keys()].join(", ") || "none";
      throw new Error(
        `Unknown agent: ${id}. Available agents: ${available}.`,
      );
    }

    return definition;
  }

  list(): readonly AgentDefinition[] {
    return Object.freeze([...this.definitions.values()]);
  }
}
