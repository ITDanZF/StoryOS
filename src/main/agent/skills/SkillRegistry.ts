import type { SkillDefinition } from "./SkillTypes.ts";

export default class SkillRegistry {
  private readonly definitions = new Map<string, SkillDefinition>();

  constructor(definitions: Iterable<SkillDefinition> = []) {
    this.registerMany(definitions);
  }

  get size(): number {
    return this.definitions.size;
  }

  register(definition: SkillDefinition): SkillDefinition {
    const skillId = definition.manifest.id;

    if (this.definitions.has(skillId)) {
      throw new Error(`Skill already registered: ${skillId}`);
    }

    this.definitions.set(skillId, definition);
    return definition;
  }

  registerMany(definitions: Iterable<SkillDefinition>): readonly SkillDefinition[] {
    const pending = Array.from(definitions);
    const ids = new Set(this.definitions.keys());

    for (const definition of pending) {
      const skillId = definition.manifest.id;
      if (ids.has(skillId)) {
        throw new Error(`Skill already registered: ${skillId}`);
      }
      ids.add(skillId);
    }

    for (const definition of pending) {
      this.definitions.set(definition.manifest.id, definition);
    }

    return Object.freeze(pending);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): SkillDefinition {
    const definition = this.definitions.get(id);

    if (!definition) {
      const available = [...this.definitions.keys()].join(", ") || "none";
      throw new Error(`Unknown skill: ${id}. Available skills: ${available}.`);
    }

    return definition;
  }

  find(id: string): SkillDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  list(): readonly SkillDefinition[] {
    return Object.freeze([...this.definitions.values()].sort((left, right) =>
      left.manifest.id.localeCompare(right.manifest.id),
    ));
  }
}
