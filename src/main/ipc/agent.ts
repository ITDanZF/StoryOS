import { BrowserWindow, ipcMain } from "electron";
import type { RendererEditorToolResponse } from "../../shared/agent/contracts.ts";
import { AGENT_IPC_CHANNELS } from "../../shared/agent/contracts.ts";
import type StoryAgentService from "../bootstrap/StoryAgentService.ts";
import type InstanceHost from "../bootstrap/InstanceHost.ts";
import type RendererEditorToolBridge from "../desktop/RendererEditorToolBridge.ts";
import BookIpcController from "../desktop/ipc/BookIpcController.ts";
import ConversationIpcController from "../desktop/ipc/ConversationIpcController.ts";
import IpcRegistrar from "../desktop/ipc/IpcRegistrar.ts";
import ProjectIpcController from "../desktop/ipc/ProjectIpcController.ts";
import SettingsIpcController from "../desktop/ipc/SettingsIpcController.ts";
import SkillIpcController from "../desktop/ipc/SkillIpcController.ts";
import OutlineIpcController from "../desktop/ipc/OutlineIpcController.ts";
import TransferIpcController from "../desktop/ipc/TransferIpcController.ts";
import { registerBookReaderIpc } from "./bookReader.ts";
export function registerAgentIpc(
  host: InstanceHost,
  editor?: RendererEditorToolBridge,
  trusted: (id: number) => boolean = () => false,
): () => void {
  const service = () => host.requireService() as StoryAgentService;
  const registrar = new IpcRegistrar(service, trusted);
  const disposers: (() => void)[] = [() => registrar.dispose()];
  const close = () => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
  try {
    new SettingsIpcController(registrar, service);
    new ConversationIpcController(registrar, () =>
      service().requireController(),
    );
    new ProjectIpcController(registrar, () => service().requireController());
    new BookIpcController(registrar, () => service().requireController());
    new TransferIpcController(registrar, () => service().requireController());
    new SkillIpcController(registrar, () => service().requireController());
    new OutlineIpcController(registrar, () => service().requireController());
    disposers.push(registerBookReaderIpc(service, trusted));
    disposers.push(
      host.subscribe((event) => {
        for (const window of BrowserWindow.getAllWindows())
          if (!window.isDestroyed() && trusted(window.webContents.id))
            window.webContents.send(AGENT_IPC_CHANNELS.event, event);
      }),
    );
    const onResponse = (
      event: Electron.IpcMainEvent,
      response: RendererEditorToolResponse,
    ) => {
      if (
        event.senderFrame === event.sender.mainFrame &&
        trusted(event.sender.id)
      )
        editor?.acceptResponse(response, event.sender.id);
    };
    ipcMain.on(AGENT_IPC_CHANNELS.editorToolResponse, onResponse);
    disposers.push(() =>
      ipcMain.removeListener(AGENT_IPC_CHANNELS.editorToolResponse, onResponse),
    );
    return close;
  } catch (error) {
    close();
    throw error;
  }
}
