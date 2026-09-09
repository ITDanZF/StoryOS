import { contextBridge, ipcRenderer } from "electron";
import {
  DEVELOPER_DATABASE_CHANNEL,
  type DeveloperDatabaseApi,
} from "../shared/developerDatabase.ts";

const api: DeveloperDatabaseApi = {
  status: () => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "status"),
  listDatabases: () => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "listDatabases"),
  listTables: (id) => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "listTables", id),
  describeTable: (id, table) =>
    ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "describeTable", id, table),
  queryRows: (request) => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "queryRows", request),
  readRow: (request) => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "readRow", request),
  mutate: (request) => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "mutate", request),
  beginEditSession: () => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "beginEditSession"),
  endEditSession: () => ipcRenderer.invoke(DEVELOPER_DATABASE_CHANNEL, "endEditSession"),
};
contextBridge.exposeInMainWorld("storyOSDeveloper", api);
