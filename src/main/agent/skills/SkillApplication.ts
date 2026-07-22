import SkillBootstrap from "./SkillBootstrap.ts";
import type { SkillBootstrapResult } from "./SkillBootstrap.ts";
import SkillLoader from "./SkillLoader.ts";
import type { SkillLoadIssue } from "./SkillLoader.ts";
import SkillRegistry from "./SkillRegistry.ts";
import SkillDraftService from "./SkillDraftService.ts";
import type { SkillDraftRequest } from "./SkillDraftService.ts";
import SkillScaffoldService from "./SkillScaffoldService.ts";
import type {
  CreateUserSkillFromContentRequest,
  CreateUserSkillRequest,
  CreatedUserSkill,
} from "./SkillScaffoldService.ts";
import type { SkillDefinition, SkillDetail, SkillSummary } from "./SkillTypes.ts";

export type SkillSnapshot = {
  readonly skills: readonly SkillSummary[];
  readonly issues: readonly SkillLoadIssue[];
  readonly loadedAt: string;
};

export type SkillDoctorResult = SkillSnapshot & {
  readonly ok: boolean;
  readonly skillCount: number;
  readonly issueCount: number;
};

function metadataBoolean(
  skill: SkillDefinition,
  key: string,
): boolean | null {
  const value = skill.manifest.metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function toSummary(skill: SkillDefinition): SkillSummary {
  return Object.freeze({
    id: skill.manifest.id,
    name: skill.manifest.name,
    version: skill.manifest.version,
    description: skill.manifest.description,
    sourceType: skill.source.type,
    enabled: true,
    managed: metadataBoolean(skill, "managed") ?? skill.source.type === "system",
    agentEnabled: skill.manifest.agent?.enabled === true,
    readOnly: metadataBoolean(skill, "readOnly"),
  });
}

function toDetail(skill: SkillDefinition): SkillDetail {
  return Object.freeze({
    ...toSummary(skill),
    triggers: Object.freeze([...(skill.manifest.triggers ?? [])]),
    tools: Object.freeze([...(skill.manifest.tools ?? [])]),
    agentTools: Object.freeze([...(skill.manifest.agent?.tools ?? [])]),
    filePath: skill.source.filePath,
    body: skill.body,
  });
}

export type SkillApplicationOptions = {
  readonly loader?: SkillLoader;
  readonly bootstrap?: SkillBootstrap;
  readonly scaffold?: SkillScaffoldService;
  readonly draft?: SkillDraftService;
};

export default class SkillApplication {
  private registry = new SkillRegistry();
  private issues: readonly SkillLoadIssue[] = Object.freeze([]);
  private loadedAt = new Date(0);

  constructor(
    private readonly loader: SkillLoader = new SkillLoader(),
    private readonly bootstrap: SkillBootstrap = new SkillBootstrap(),
    private readonly scaffold: SkillScaffoldService = new SkillScaffoldService(),
    private readonly draft?: SkillDraftService,
  ) {}

  static async create(options: SkillApplicationOptions = {}): Promise<SkillApplication> {
    const application = new SkillApplication(
      options.loader,
      options.bootstrap,
      options.scaffold,
      options.draft,
    );
    await application.reload();
    return application;
  }

  async reload(): Promise<SkillSnapshot> {
    const syncResult = await this.bootstrap.syncBundledSkills();
    const loadResult = await this.loader.loadAll();
    const registry = new SkillRegistry();
    const issues = [...loadResult.issues];

    try {
      registry.registerMany(loadResult.skills);
    } catch (error) {
      issues.push(Object.freeze({
        sourceType: "system",
        root: "SkillRegistry",
        message: error instanceof Error ? error.message : String(error),
      }));
    }

    for (const warning of syncResult.warnings) {
      issues.push(Object.freeze({
        sourceType: "system",
        root: "SkillBootstrap",
        message: warning,
      }));
    }

    this.registry = registry;
    this.issues = Object.freeze(issues);
    this.loadedAt = new Date();
    return this.getSnapshot();
  }

  listSkills(): readonly SkillSummary[] {
    return Object.freeze(this.registry.list().map(toSummary));
  }

  listSkillDefinitions(): readonly SkillDefinition[] {
    return this.registry.list();
  }

  getSkill(id: string): SkillDetail | null {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error("Skill id is required.");
    }

    const skill = this.registry.find(normalizedId);
    return skill ? toDetail(skill) : null;
  }

  renderTemplate(id?: string): string {
    return this.scaffold.renderTemplate({ id });
  }

  async createUserSkillTemplate(
    request: CreateUserSkillRequest,
  ): Promise<CreatedUserSkill> {
    const created = await this.scaffold.createUserSkill(request);
    await this.reload();
    return created;
  }

  async createUserSkillFromContent(
    request: CreateUserSkillFromContentRequest,
  ): Promise<CreatedUserSkill> {
    const created = await this.scaffold.createUserSkillFromContent(request);
    await this.reload();
    return created;
  }

  async draftSkill(request: SkillDraftRequest): Promise<string> {
    if (!this.draft) {
      throw new Error("Skill draft generation is not configured.");
    }

    return this.draft.generate(request);
  }

  async createUserSkillFromDraft(
    request: SkillDraftRequest,
  ): Promise<CreatedUserSkill> {
    const content = await this.draftSkill(request);
    return this.createUserSkillFromContent({
      id: request.id,
      content,
    });
  }

  doctor(): SkillDoctorResult {
    const snapshot = this.getSnapshot();
    return Object.freeze({
      ...snapshot,
      ok: snapshot.issues.length === 0,
      skillCount: snapshot.skills.length,
      issueCount: snapshot.issues.length,
    });
  }

  getSnapshot(): SkillSnapshot {
    return Object.freeze({
      skills: this.listSkills(),
      issues: this.issues,
      loadedAt: this.loadedAt.toISOString(),
    });
  }
}

export type { SkillBootstrapResult };
