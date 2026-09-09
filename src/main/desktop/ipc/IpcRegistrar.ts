import { ipcMain } from "electron";
import { requestContext as context } from "../../bootstrap/RequestContext.ts";

export type DesktopRequestContext = { readonly ownerId: number; readonly requestId: string };
export function currentRequestOwner(): number | undefined {
  return context.getStore()?.ownerId;
}

export default class IpcRegistrar {
  private readonly channels = new Set<string>();
  private readonly owners = new Map<Electron.WebContents, () => void>();
  constructor(
    private readonly gate: {
      runBusinessRequest<T>(run: () => T | Promise<T>): Promise<T>;
      closeBookReaders?(owner: number): void;
    },
    private readonly trusted: (id: number) => boolean,
  ) {}
  handle<TArgs extends unknown[]>(channel: string, listener: (...args: TArgs) => unknown): void {
    if (this.channels.has(channel)) throw new Error(`IPC already registered: ${channel}`);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (event.senderFrame !== event.sender.mainFrame || !this.trusted(event.sender.id))
        throw new Error("Untrusted application frame.");
      if (!this.owners.has(event.sender)) {
        const sender = event.sender;
        const close = () => {
          this.gate.closeBookReaders?.(sender.id);
          this.owners.delete(sender);
        };
        this.owners.set(sender, close);
        sender.once("destroyed", close);
      }
      return context.run({ ownerId: event.sender.id, requestId: crypto.randomUUID() }, () =>
        this.gate.runBusinessRequest(() => listener(...(args as TArgs))),
      );
    });
    this.channels.add(channel);
  }
  dispose(): void {
    for (const channel of this.channels) ipcMain.removeHandler(channel);
    this.channels.clear();
    for (const [owner, close] of this.owners) {
      owner.removeListener("destroyed", close);
      close();
    }
    this.owners.clear();
  }
}
