import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import StoryAgentService from "./bootstrap/StoryAgentService";
import RendererEditorToolBridge from "./desktop/RendererEditorToolBridge";
import DeveloperDatabaseService from "./developer/DeveloperDatabaseService";
import ResourceLocator from "./resources/ResourceLocator";
import { registerAgentIpc } from "./ipc/agent";
import { registerDeveloperDatabaseIpc } from "./ipc/developerDatabase";
import { registerWindowIpc } from "./ipc/window";
import { getAgentHome } from "./agent/environment/paths";
import AppWindowManager from "./window/index";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const resources = new ResourceLocator(app.getAppPath());
const MainAppWin = new AppWindowManager({ isOpenDev: !app.isPackaged, icon: resources.windowIcon });
let agentService: StoryAgentService | null = null;
let unregisterAgentIpc: (() => void) | null = null;
let unregisterWindowIpc: (() => void) | null = null;
let unregisterDeveloperIpc: (() => void) | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;
const rendererEditorTools = new RendererEditorToolBridge((id) => MainAppWin.ownsWebContents(id));

app
  .whenReady()
  .then(async () => {
    agentService = new StoryAgentService({
      agentHome: getAgentHome(),
      bundledSkillRoot: resources.bundledSkillRoot,
      rendererEditorTools,
    });
    await agentService.initialize();
    const host = agentService;
    unregisterAgentIpc = registerAgentIpc(agentService, rendererEditorTools, (id) =>
      MainAppWin.ownsWebContents(id),
    );
    unregisterDeveloperIpc = registerDeveloperDatabaseIpc(
      new DeveloperDatabaseService(getAgentHome(), {
        pause: () => host.pauseForDeveloper(),
        resume: () => host.resumeFromDeveloper(),
      }),
      (id) => MainAppWin.ownsWebContents(id),
    );
    unregisterWindowIpc = registerWindowIpc((id) => MainAppWin.ownsWebContents(id));
    MainAppWin.createMainWindow();
  })
  .catch((error) => {
    console.error("StoryOS startup failed.", error);
    app.quit();
  });

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownPromise) return;

  shutdownPromise = (async () => {
    rendererEditorTools.close();
    unregisterAgentIpc?.();
    unregisterAgentIpc = null;
    unregisterWindowIpc?.();
    unregisterWindowIpc = null;
    unregisterDeveloperIpc?.();
    unregisterDeveloperIpc = null;
    await agentService?.shutdown();
    agentService = null;
  })();
  void shutdownPromise
    .catch((error) => {
      console.error("StoryOS shutdown failed.", error);
    })
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    MainAppWin.createMainWindow();
  }
});
