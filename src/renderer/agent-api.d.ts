import type { AgentDesktopApi } from "../shared/agent/contracts.ts";
import type { OutlineDesktopApi } from "../shared/contracts/outline/desktopApi.ts";

declare global {
  interface Window {
    readonly storyOSAgent: AgentDesktopApi & OutlineDesktopApi;
  }
}

export {};
