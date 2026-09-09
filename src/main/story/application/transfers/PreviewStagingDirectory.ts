import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  markOperationDirectory,
  ownsOperationDirectory,
  removeOperationDirectory,
} from "../../storage/common/operationOwnership.ts";

/** Only marked preview directories owned by a dead process are recovered. */
export default class PreviewStagingDirectory {
  readonly root: string;
  constructor(
    agentHome: string,
    private readonly isAlive = processIsAlive,
  ) {
    this.root = path.resolve(agentHome, "library", ".importing");
  }
  pathFor(id: string): string {
    if (!/^book_import_preview_[a-z0-9-]+$/i.test(id))
      throw new Error("Invalid preview operation id.");
    return path.join(this.root, id);
  }
  create(id: string): string {
    const directory = this.pathFor(id);
    mkdirSync(directory, { recursive: true });
    markOperationDirectory(directory, id);
    writeFileSync(
      path.join(directory, ".preview-owner.json"),
      JSON.stringify({ version: 1, pid: process.pid }),
      { flag: "wx" },
    );
    return directory;
  }
  remove(id: string): void {
    removeOperationDirectory(this.pathFor(id), id);
  }
  recover(): void {
    if (!existsSync(this.root) || lstatSync(this.root).isSymbolicLink()) return;
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^book_import_preview_[a-z0-9-]+$/i.test(entry.name)) continue;
      const directory = this.pathFor(entry.name);
      if (!ownsOperationDirectory(directory, entry.name)) continue;
      try {
        const owner: unknown = JSON.parse(
          readFileSync(path.join(directory, ".preview-owner.json"), "utf8"),
        );
        if (
          !owner ||
          typeof owner !== "object" ||
          !("version" in owner) ||
          owner.version !== 1 ||
          !("pid" in owner) ||
          typeof owner.pid !== "number" ||
          !Number.isInteger(owner.pid) ||
          owner.pid <= 0
        )
          continue;
        if (!this.isAlive(owner.pid)) this.remove(entry.name);
      } catch {
        /* Unknown ownership is retained for manual inspection. */
      }
    }
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && typeof error === "object" && "code" in error && error.code === "ESRCH");
  }
}
