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

const MainAppWin = new AppWindowManager({ isOpenDev: true });

app.whenReady().then(async () => {
    const agentService = new StoryAgentService({
        agentHome: getAgentHome(),
        bundledSkillRoot: path.join(app.getAppPath(), 'skills'),
    });
    await agentService.initialize();
    registerAgentIpc(agentService);
    registerWindowIpc();
    MainAppWin.createMainWindow();
}).catch((error) => {
    console.error('StoryOS startup failed.', error);
    app.quit();
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
