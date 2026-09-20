import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import InstanceHost from "./bootstrap/InstanceHost";
import InstanceRegistry from "./story/instances/InstanceRegistry";
import InstanceApplication from "./story/instances/InstanceApplication";
import { registerInstanceIpc } from "./desktop/ipc/InstanceIpcController";
import path from "node:path";
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
const MainAppWin = new AppWindowManager({
  isOpenDev: !app.isPackaged,
  icon: resources.windowIcon,
});
let instanceHost: InstanceHost | null = null;
let developerService: DeveloperDatabaseService | null = null;
let developerInstanceId: string | null = null;
let unregisterInstanceIpc: (() => void) | null = null;
let unregisterAgentIpc: (() => void) | null = null;
let unregisterWindowIpc: (() => void) | null = null;
let unregisterDeveloperIpc: (() => void) | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;
const rendererEditorTools = new RendererEditorToolBridge((id) =>
  MainAppWin.ownsWebContents(id),
);

app
  .whenReady()
  .then(async () => {
    const defaultRoot = getAgentHome();
    const registry = new InstanceRegistry(
      path.join(app.getPath("userData"), "instances.json"),
      defaultRoot,
    );
    instanceHost = new InstanceHost(
      registry,
      new InstanceApplication(registry),
      { bundledSkillRoot: resources.bundledSkillRoot, rendererEditorTools },
    );
    const host = instanceHost;
    await host.openLast();
    unregisterAgentIpc = registerAgentIpc(host, rendererEditorTools, (id) =>
      MainAppWin.ownsWebContents(id),
    );
    unregisterInstanceIpc = registerInstanceIpc(host, (id) =>
      MainAppWin.ownsWebContents(id),
    );
    unregisterDeveloperIpc = registerDeveloperDatabaseIpc(
      () => {
        const instanceId = host.getSnapshot().activeInstanceId;
        if (!instanceId) throw new Error("尚未打开实例。");
        if (developerInstanceId !== instanceId || !developerService) {
          developerService = new DeveloperDatabaseService(
            host.registry.get(instanceId).rootPath,
            {
              pause: () => host.requireService().pauseForDeveloper(),
              resume: () => host.requireService().resumeFromDeveloper(),
            },
          );
          developerInstanceId = instanceId;
        }
        return developerService;
      },
      (id) => MainAppWin.ownsWebContents(id),
    );
    unregisterWindowIpc = registerWindowIpc((id) =>
      MainAppWin.ownsWebContents(id),
    );
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
    unregisterInstanceIpc?.();
    unregisterInstanceIpc = null;
    unregisterWindowIpc?.();
    unregisterWindowIpc = null;
    unregisterDeveloperIpc?.();
    unregisterDeveloperIpc = null;
    await instanceHost?.shutdown();
    instanceHost = null;
    developerService = null;
    developerInstanceId = null;
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
