import type { AgentDesktopApi } from "../shared/agent/contracts.ts";

declare global {
  interface Window {
    readonly storyOSAgent: AgentDesktopApi;
  }
}

export {};
