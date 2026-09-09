import type { RendererEditorToolClient } from "../story/integration/tools/editor/contracts.ts";
export type ApplicationHostOptions = {
  readonly agentHome: string;
  readonly bundledSkillRoot: string;
  readonly rendererEditorTools?: RendererEditorToolClient;
};
