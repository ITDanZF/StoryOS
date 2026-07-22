import SkillApplication from "./SkillApplication.ts";
import { renderSkillPrompt } from "./SkillPrompt.ts";
import SkillResolver, { type SkillSelection } from "./SkillResolver.ts";
import type { ThreadSkillState } from "../application/threadPorts.ts";

export type SkillContext = {
  readonly selections: readonly SkillSelection[];
  readonly prompt: string;
};

export type SkillContextProvider = {
  getSkillContext(input: string, options?: SkillContextRequestOptions): Promise<SkillContext>;
};

export type SkillContextRequestOptions = {
  readonly threadId?: string;
};

export type ThreadSkillStateProvider = {
  getThreadSkillState(threadId: string): ThreadSkillState;
};

export type SkillContextProviderServiceOptions = {
  readonly resolver?: SkillResolver;
  readonly maxSkills?: number;
  readonly minScore?: number;
  readonly maxSkillChars?: number;
  readonly maxTotalChars?: number;
  readonly threadSkillStateProvider?: ThreadSkillStateProvider;
};

export default class SkillContextProviderService implements SkillContextProvider {
  private readonly resolver: SkillResolver;

  constructor(
    private readonly skills: SkillApplication,
    private readonly options: SkillContextProviderServiceOptions = {},
  ) {
    this.resolver = options.resolver ?? new SkillResolver({
      maxSkills: options.maxSkills,
      minScore: options.minScore,
    });
  }

  async getSkillContext(
    input: string,
    requestOptions: SkillContextRequestOptions = {},
  ): Promise<SkillContext> {
    const threadState = requestOptions.threadId && this.options.threadSkillStateProvider
      ? this.options.threadSkillStateProvider.getThreadSkillState(requestOptions.threadId)
      : undefined;
    const selections = this.resolver.resolve({
      input,
      skills: this.skills.listSkillDefinitions(),
      activeSkillIds: threadState?.activeSkillIds,
      disabledSkillIds: threadState?.disabledSkillIds,
      maxSkills: this.options.maxSkills,
      minScore: this.options.minScore,
    });

    return Object.freeze({
      selections,
      prompt: renderSkillPrompt(selections, {
        maxSkillChars: this.options.maxSkillChars,
        maxTotalChars: this.options.maxTotalChars,
      }),
    });
  }
}
