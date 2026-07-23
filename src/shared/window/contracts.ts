export const WINDOW_IPC_CHANNELS = Object.freeze({
    getState: 'window:get-state',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    stateChanged: 'window:state-changed',
} as const);

export type WindowState = {
    readonly maximized: boolean;
    readonly fullScreen: boolean;
};

export type WindowDesktopApi = {
    getState(): Promise<WindowState>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowState>;
    close(): void;
    onStateChanged(handler: (state: WindowState) => void): () => void;
};
