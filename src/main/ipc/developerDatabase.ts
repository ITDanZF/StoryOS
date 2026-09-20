import { app, ipcMain } from "electron";
import { z } from "zod";
import { DEVELOPER_DATABASE_CHANNEL } from "../../shared/developerDatabase.ts";
import DeveloperDatabaseService from "../developer/DeveloperDatabaseService.ts";

export function registerDeveloperDatabaseIpc(
  resolveService: () => DeveloperDatabaseService,
  trusted: (id: number) => boolean = () => false,
): () => void {
  ipcMain.handle(
    DEVELOPER_DATABASE_CHANNEL,
    (event, method: string, ...args: unknown[]) => {
      if (app.isPackaged) throw new Error("开发者工具仅在开发构建中开放。");
      if (
        !trusted(event.sender.id) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error("仅允许主页面调用开发者工具。");
      const service = resolveService();
      const id = () => z.string().min(1).parse(args[0]);
      switch (method) {
        case "status":
          return service.status();
        case "listDatabases":
          return service.listDatabases();
        case "listTables":
          return service.listTables(id());
        case "describeTable":
          return service.describeTable(id(), z.string().min(1).parse(args[1]));
        case "queryRows":
          return service.queryRows(
            args[0] as Parameters<typeof service.queryRows>[0],
          );
        case "readRow":
          return service.readRow(
            args[0] as Parameters<typeof service.readRow>[0],
          );
        case "mutate":
          return service.mutate(
            args[0] as Parameters<typeof service.mutate>[0],
          );
        case "beginEditSession":
          return service.beginEditSession();
        case "endEditSession":
          return service.endEditSession();
        default:
          throw new Error("未知的数据库操作。");
      }
    },
  );
  return () => ipcMain.removeHandler(DEVELOPER_DATABASE_CHANNEL);
}
