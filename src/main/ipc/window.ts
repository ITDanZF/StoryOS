import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { WINDOW_IPC_CHANNELS } from '../../shared/window/contracts.ts';
import type { PickDirectoryRequest, WindowState } from '../../shared/window/contracts.ts';

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

export function registerWindowIpc(): () => void {
    const closeWindow = (event: IpcMainEvent) => {
        requireSenderWindow(event).close();
    };
    ipcMain.handle(WINDOW_IPC_CHANNELS.getState, (event) =>
        getWindowState(requireSenderWindow(event)));
    ipcMain.handle(WINDOW_IPC_CHANNELS.pickDirectory, async (event, request?: PickDirectoryRequest) => {
        const title = typeof request?.title === 'string' && request.title.trim()
            ? request.title.trim()
            : '选择文件夹';
        const defaultPath = typeof request?.defaultPath === 'string'
            ? request.defaultPath.trim()
            : '';
        const result = await dialog.showOpenDialog(requireSenderWindow(event), {
            title,
            ...(defaultPath ? { defaultPath } : {}),
            properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
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
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.minimize);
        ipcMain.removeHandler(WINDOW_IPC_CHANNELS.toggleMaximize);
        ipcMain.removeListener(WINDOW_IPC_CHANNELS.close, closeWindow);
    };
}
