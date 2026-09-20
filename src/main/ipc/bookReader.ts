import { ipcMain, type WebContents } from "electron";
import { READER_CHANNELS } from "../../shared/book/reader.ts";
import type StoryAgentService from "../bootstrap/StoryAgentService.ts";

export function registerBookReaderIpc(
  resolveService: () => StoryAgentService,
  trusted: (id: number) => boolean = () => false,
): () => void {
  const owners = new Map<WebContents, () => void>();
  for (const method of Object.keys(
    READER_CHANNELS,
  ) as (keyof typeof READER_CHANNELS)[]) {
    ipcMain.handle(READER_CHANNELS[method], (event, request) => {
      if (
        event.senderFrame !== event.sender.mainFrame ||
        !trusted(event.sender.id)
      )
        throw new Error("Only the main application frame may read books.");
      if (!owners.has(event.sender)) {
        const ownerId = event.sender.id;
        const close = () => {
          try {
            resolveService().closeBookReaders(ownerId);
          } catch {
            /* No active instance. */
          }
          owners.delete(event.sender);
        };
        owners.set(event.sender, close);
        event.sender.once("destroyed", close);
      }
      const service = resolveService();
      return service.runBusinessRequest(() => {
        const reader = service.requireBookReader();
        const owner = event.sender.id;
        switch (method) {
          case "openBookReader":
            return reader.open(owner, request);
          case "readBookReaderChapter":
            return reader.read(owner, request);
          case "getBookReaderStatus":
            return reader.status(owner, request);
          case "saveBookReadingState":
            return reader.save(owner, request);
          case "closeBookReader":
            return reader.close(owner, request);
        }
      });
    });
  }
  return () => {
    for (const channel of Object.values(READER_CHANNELS))
      ipcMain.removeHandler(channel);
    for (const [owner, close] of owners) {
      owner.removeListener("destroyed", close);
      close();
    }
    owners.clear();
  };
}
