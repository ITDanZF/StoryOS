export const WINDOW_IPC_CHANNELS = Object.freeze({
    getState: 'window:get-state',
    pickDirectory: 'window:pick-directory',
    pickFile: 'window:pick-file',
    saveFile: 'window:save-file',
    fileBrowserLocations: 'window:file-browser-locations',
    fileBrowserDirectory: 'window:file-browser-directory',
    fileBrowserTarget: 'window:file-browser-target',
    revealFile: 'window:reveal-file',
    rememberTransferLocation: 'window:remember-transfer-location',
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

export type FileDialogFilter = {
    readonly name: string;
    readonly extensions: readonly string[];
};

export type PickFileRequest = {
    readonly title: string;
    readonly defaultPath?: string;
    readonly filters?: readonly FileDialogFilter[];
};

export type SaveFileRequest = PickFileRequest;

export type FileBrowserEntry = {
    readonly name: string;
    readonly absolutePath: string;
    readonly kind: 'directory' | 'file' | 'symbolic-link';
    readonly size: number | null;
    readonly modifiedAt: string | null;
    readonly extension: string | null;
    readonly accessible: boolean;
};

export type FileBrowserLocation = {
    readonly id: string;
    readonly label: string;
    readonly absolutePath: string;
    readonly kind: 'home' | 'desktop' | 'documents' | 'downloads' | 'volume' | 'recent';
};

export type FileBrowserPage = {
    readonly directoryPath: string;
    readonly parentPath: string | null;
    readonly entries: readonly FileBrowserEntry[];
    readonly nextCursor: string | null;
};

export type ListFileBrowserDirectoryRequest = {
    readonly directoryPath: string;
    readonly extensions?: readonly string[];
    readonly query?: string;
    readonly sortBy?: 'name' | 'modifiedAt' | 'size';
    readonly sortDirection?: 'asc' | 'desc';
    readonly cursor?: string;
};

export type ResolveFileBrowserTargetRequest = {
    readonly directoryPath: string;
    readonly fileName: string;
    readonly extension: string;
};

export type FileBrowserTarget = {
    readonly outputPath: string;
    readonly exists: boolean;
};

export type WindowDesktopApi = {
    getState(): Promise<WindowState>;
    pickDirectory(request?: PickDirectoryRequest): Promise<string | null>;
    pickFile(request: PickFileRequest): Promise<string | null>;
    saveFile(request: SaveFileRequest): Promise<string | null>;
    getFileBrowserLocations(): Promise<readonly FileBrowserLocation[]>;
    listFileBrowserDirectory(request: ListFileBrowserDirectoryRequest): Promise<FileBrowserPage>;
    resolveFileBrowserTarget(request: ResolveFileBrowserTargetRequest): Promise<FileBrowserTarget>;
    getDroppedFilePath(file: File): string;
    revealFile(filePath: string): Promise<void>;
    rememberTransferLocation(fileOrDirectoryPath: string): Promise<void>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowState>;
    close(): void;
    onStateChanged(handler: (state: WindowState) => void): () => void;
};
