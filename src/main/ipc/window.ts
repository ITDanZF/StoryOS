import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { WINDOW_IPC_CHANNELS } from '../../shared/window/contracts.ts';
import type {
    FileDialogFilter,
    PickDirectoryRequest,
    PickFileRequest,
    SaveFileRequest,
    WindowState,
} from '../../shared/window/contracts.ts';

function requireSenderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) throw new Error('Window is no longer available.');
    return win;
}

export function getWindowState(win: BrowserWindow): WindowState {
    return Object.freeze({
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
    });
}

export function notifyWindowState(win: BrowserWindow): void {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send(WINDOW_IPC_CHANNELS.stateChanged, getWindowState(win));
}

function normalizeDialogTitle(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDefaultPath(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeFileFilters(value: unknown): Electron.FileFilter[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate): Electron.FileFilter[] => {
        if (!candidate || typeof candidate !== 'object') return [];
        const filter = candidate as Partial<FileDialogFilter>;
        const name = typeof filter.name === 'string' ? filter.name.trim() : '';
        const extensions = Array.isArray(filter.extensions)
            ? filter.extensions
                .filter((extension): extension is string => typeof extension === 'string')
                .map((extension) => extension.trim().replace(/^\./, ''))
                .filter((extension) => /^[a-z0-9][a-z0-9_-]*$/i.test(extension))
            : [];
        return name && extensions.length > 0 ? [{ name, extensions }] : [];
    });
}

export function registerWindowIpc(): () => void {
    const closeWindow = (event: IpcMainEvent) => {
        requireSenderWindow(event).close();
    };
    ipcMain.handle(WINDOW_IPC_CHANNELS.getState, (event) =>
        getWindowState(requireSenderWindow(event)));
    ipcMain.handle(WINDOW_IPC_CHANNELS.pickDirectory, async (event, request?: PickDirectoryRequest) => {
        const title = normalizeDialogTitle(request?.title, '选择文件夹');
        const defaultPath = normalizeDefaultPath(request?.defaultPath);
        const result = await dialog.showOpenDialog(requireSenderWindow(event), {
            title,
            ...(defaultPath ? { defaultPath } : {}),
            properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle(WINDOW_IPC_CHANNELS.pickFile, async (event, request: PickFileRequest) => {
        const result = await dialog.showOpenDialog(requireSenderWindow(event), {
            title: normalizeDialogTitle(request?.title, '选择文件'),
            ...(normalizeDefaultPath(request?.defaultPath) ? {
                defaultPath: normalizeDefaultPath(request?.defaultPath),
            } : {}),
            filters: normalizeFileFilters(request?.filters),
            properties: ['openFile'],
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle(WINDOW_IPC_CHANNELS.saveFile, async (event, request: SaveFileRequest) => {
        const result = await dialog.showSaveDialog(requireSenderWindow(event), {
            title: normalizeDialogTitle(request?.title, '保存文件'),
            ...(normalizeDefaultPath(request?.defaultPath) ? {
                defaultPath: normalizeDefaultPath(request?.defaultPath),
            } : {}),
            filters: normalizeFileFilters(request?.filters),
            properties: ['showOverwriteConfirmation'],
        });
        return result.canceled ? null : result.filePath ?? null;
    });
    ipcMain.handle(WINDOW_IPC_CHANNELS.minimize, (event) => {
        requireSenderWindow(event).minimize();
    });
    ipcMain.handle(WINDOW_IPC_CHANNELS.toggleMaximize, (event) => {
        const win = requireSenderWindow(event);
        if (win.isFullScreen()) win.setFullScreen(false);
        else if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return getWindowState(win);
    });
    ipcMain.on(WINDOW_IPC_CHANNELS.close, closeWindow);

    return () => {
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.getState);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.pickDirectory);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.pickFile);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.saveFile);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.minimize);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.toggleMaximize);
        ipcMain.removeListener(WINDOW_IPC_CHANNELS.close, closeWindow);
    };
}
