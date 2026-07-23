export const WINDOW_IPC_CHANNELS = Object.freeze({
    getState: 'window:get-state',
    pickDirectory: 'window:pick-directory',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    stateChanged: 'window:state-changed',
} as const);

export type WindowState = {
    readonly maximized: boolean;
    readonly fullScreen: boolean;
};

export type PickDirectoryRequest = {
    readonly title: string;
    readonly defaultPath?: string;
};

export type WindowDesktopApi = {
    getState(): Promise<WindowState>;
    pickDirectory(request?: PickDirectoryRequest): Promise<string | null>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowState>;
    close(): void;
    onStateChanged(handler: (state: WindowState) => void): () => void;
};
