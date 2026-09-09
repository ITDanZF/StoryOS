import { BrowserWindow } from "electron";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ResourceScope from "../bootstrap/ResourceScope.ts";

export default class ElectronPdfRenderer {
  async render(html: string): Promise<Buffer> {
    const scope = new ResourceScope();
    try {
      const root = mkdtempSync(path.join(tmpdir(), "storyos-pdf-"));
      scope.add("PDF temporary directory", () => rmSync(root, { recursive: true, force: true }));
      const window = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      scope.add("PDF window", () => {
        if (!window.isDestroyed()) window.destroy();
      });
      const file = path.join(root, "book.html");
      writeFileSync(file, html, "utf8");
      await window.loadFile(file);
      return await window.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
    } finally {
      await scope.close();
    }
  }
}
