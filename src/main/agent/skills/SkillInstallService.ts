import SkillApplication from "./SkillApplication.ts";
import type { CreatedUserSkill } from "./SkillScaffoldService.ts";

export type InstallUserSkillRequest = {
  readonly id: string;
  readonly content: string;
};

export type SkillInstaller = {
  readonly installUserSkill: (
    request: InstallUserSkillRequest,
  ) => Promise<CreatedUserSkill>;
  readonly onAfterInstall?: (handler: SkillInstallEventHandler) => () => void;
};

export type SkillInstallEvent = {
  readonly skill: CreatedUserSkill;
};

export type SkillInstallEventHandler = (
  event: SkillInstallEvent,
) => void | Promise<void>;

export default class SkillInstallService implements SkillInstaller {
  private readonly afterInstallHandlers = new Set<SkillInstallEventHandler>();

  constructor(private readonly skills: SkillApplication) {}

  async installUserSkill(
    request: InstallUserSkillRequest,
  ): Promise<CreatedUserSkill> {
    const skill = await this.skills.createUserSkillFromContent(request);
    await this.emitAfterInstall(skill);
    return skill;
  }

  onAfterInstall(handler: SkillInstallEventHandler): () => void {
    this.afterInstallHandlers.add(handler);
    return () => this.afterInstallHandlers.delete(handler);
  }

  private async emitAfterInstall(skill: CreatedUserSkill): Promise<void> {
    await Promise.all(
      [...this.afterInstallHandlers].map((handler) => handler({ skill })),
    );
  }
}
