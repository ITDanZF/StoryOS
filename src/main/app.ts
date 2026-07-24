import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import AppWindowManager from './window/index';
import StoryAgentService from './agent/StoryAgentService';
import { registerAgentIpc } from './ipc/agent';
import { registerWindowIpc } from './ipc/window';
import { getAgentHome } from './agent/workspace/path';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit();
}

const MainAppWin = new AppWindowManager({ isOpenDev: !app.isPackaged });
let agentService: StoryAgentService | null = null;
let unregisterAgentIpc: (() => void) | null = null;
let unregisterWindowIpc: (() => void) | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;

app.whenReady().then(async () => {
    agentService = new StoryAgentService({
        agentHome: getAgentHome(),
        bundledSkillRoot: app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'skills')
            : path.join(app.getAppPath(), 'skills'),
    });
    await agentService.initialize();
    unregisterAgentIpc = registerAgentIpc(agentService);
    unregisterWindowIpc = registerWindowIpc();
    MainAppWin.createMainWindow();
}).catch((error) => {
    console.error('StoryOS startup failed.', error);
    app.quit();
});

app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownPromise) return;

    shutdownPromise = (async () => {
        unregisterAgentIpc?.();
        unregisterAgentIpc = null;
        unregisterWindowIpc?.();
        unregisterWindowIpc = null;
        await agentService?.shutdown();
        agentService = null;
    })();
    void shutdownPromise
        .catch((error) => {
            console.error('StoryOS shutdown failed.', error);
        })
        .finally(() => {
            shutdownComplete = true;
            app.quit();
        });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        MainAppWin.createMainWindow();
    }
});
