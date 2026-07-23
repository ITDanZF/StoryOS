import { contextBridge, ipcRenderer } from 'electron';
import { WINDOW_IPC_CHANNELS } from '../shared/window/contracts.ts';
import type { WindowDesktopApi, WindowState } from '../shared/window/contracts.ts';

const windowApi: WindowDesktopApi = {
    getState: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.getState),
    pickDirectory: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.pickDirectory),
    minimize: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.minimize),
    toggleMaximize: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.toggleMaximize),
    close: () => ipcRenderer.send(WINDOW_IPC_CHANNELS.close),
    onStateChanged: (handler: (state: WindowState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: WindowState) => handler(state);
        ipcRenderer.on(WINDOW_IPC_CHANNELS.stateChanged, listener);
        return () => ipcRenderer.removeListener(WINDOW_IPC_CHANNELS.stateChanged, listener);
    },
};

contextBridge.exposeInMainWorld('storyOSWindow', windowApi);

export default windowApi;
