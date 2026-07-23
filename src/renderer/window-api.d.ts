import type { WindowDesktopApi } from '../shared/window/contracts.ts';

declare global {
    interface Window {
        readonly storyOSWindow: WindowDesktopApi;
    }
}

export {};
