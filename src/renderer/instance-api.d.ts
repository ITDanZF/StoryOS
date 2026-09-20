import type { InstanceDesktopApi } from "../shared/contracts/instances/contracts.ts";

declare global {
  interface Window {
    readonly storyOSInstances: InstanceDesktopApi;
  }
}

export {};
