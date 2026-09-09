import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type {
  CommitBookExportRequest,
  CommitBookImportRequest,
  PrepareBookExportRequest,
  PrepareBookImportRequest,
} from "../../story/application/transfers/bookTransferContracts.ts";
import type DesktopController from "../DesktopController.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
import { requireBookExportOptions, requireBookTransferFormat, requireText } from "./validation.ts";
export default class TransferIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => Pick<
      DesktopController,
      | "importBookshelfBook"
      | "exportBookshelfBook"
      | "getBookTransferFormats"
      | "prepareBookshelfBookImport"
      | "commitBookshelfBookImport"
      | "cancelBookshelfBookImport"
      | "prepareBookshelfBookExport"
      | "commitBookshelfBookExport"
      | "cancelBookshelfBookExport"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.importBookshelfBook, (request: { readonly packagePath: string }) =>
      getController().importBookshelfBook({
        packagePath: requireText(request?.packagePath, "Book package path"),
      }),
    );
    handle(
      AGENT_IPC_CHANNELS.exportBookshelfBook,
      (request: { readonly bookId: string; readonly outputPath: string }) =>
        getController().exportBookshelfBook({
          bookId: requireText(request?.bookId, "Book id"),
          outputPath: requireText(request?.outputPath, "Book export path"),
        }),
    );
    handle(AGENT_IPC_CHANNELS.bookTransferFormats, () => getController().getBookTransferFormats());
    handle(AGENT_IPC_CHANNELS.prepareBookshelfBookImport, (request: PrepareBookImportRequest) => {
      const expected =
        request?.expectedFormat === undefined
          ? undefined
          : requireBookTransferFormat(request.expectedFormat);
      if (expected === "epub" || expected === "pdf") {
        throw new Error("Selected format cannot be imported.");
      }
      return getController().prepareBookshelfBookImport({
        filePath: requireText(request?.filePath, "Book import path"),
        ...(expected ? { expectedFormat: expected } : {}),
      });
    });
    handle(AGENT_IPC_CHANNELS.commitBookshelfBookImport, (request: CommitBookImportRequest) =>
      getController().commitBookshelfBookImport({
        sessionId: requireText(request?.sessionId, "Book import session id"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.cancelBookshelfBookImport, (sessionId: string) =>
      getController().cancelBookshelfBookImport(requireText(sessionId, "Book import session id")),
    );
    handle(AGENT_IPC_CHANNELS.prepareBookshelfBookExport, (request: PrepareBookExportRequest) =>
      getController().prepareBookshelfBookExport({
        bookId: requireText(request?.bookId, "Book id"),
        format: requireBookTransferFormat(request?.format),
        options: requireBookExportOptions(request?.options),
      }),
    );
    handle(AGENT_IPC_CHANNELS.commitBookshelfBookExport, (request: CommitBookExportRequest) =>
      getController().commitBookshelfBookExport({
        exportId: requireText(request?.exportId, "Book export id"),
        outputPath: requireText(request?.outputPath, "Book export path"),
        overwrite: request?.overwrite === true,
      }),
    );
    handle(AGENT_IPC_CHANNELS.cancelBookshelfBookExport, (exportId: string) =>
      getController().cancelBookshelfBookExport(requireText(exportId, "Book export id")),
    );
  }
}
