import { constants, copyFileSync, existsSync, renameSync, statSync } from "node:fs";
import path from "node:path";
export default class ExportFilePublisher {
  requireExportTarget(outputPath: string, overwrite: boolean): void {
    if (!existsSync(outputPath)) return;
    if (!statSync(outputPath).isFile()) {
      throw new Error(`导出目标不是文件，请选择其他保存位置：${outputPath}`);
    }
    if (!overwrite) {
      throw new Error(`目标文件已存在，请确认覆盖或使用其他文件名：${outputPath}`);
    }
  }

  publishExportFile(temporary: string, outputPath: string, overwrite: boolean): void {
    try {
      if (overwrite) {
        // Replace only after generation succeeds; never delete the old file first.
        renameSync(temporary, outputPath);
      } else {
        // An existing file may appear while the asynchronous renderer is running.
        copyFileSync(temporary, outputPath, constants.COPYFILE_EXCL);
      }
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        throw new Error(`目标文件已存在，请确认覆盖或使用其他文件名：${outputPath}`);
      }
      if (code === "EACCES" || code === "EPERM" || code === "EBUSY") {
        throw new Error(
          `无法保存文件，文件可能正被其他程序占用或没有写入权限。请关闭占用程序或选择其他位置后重试：${outputPath}`,
        );
      }
      throw cause;
    }
  }

  requireImportPath(value: string): string {
    const normalized = value?.trim();
    if (!normalized || !path.isAbsolute(normalized)) {
      throw new Error("Book import path must be absolute.");
    }
    const resolved = path.resolve(normalized);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      throw new Error(`Book import file does not exist: ${resolved}`);
    }
    return resolved;
  }

  requireFormatOutputPath(value: string, extension: string): string {
    const normalized = value?.trim();
    if (!normalized || !path.isAbsolute(normalized))
      throw new Error("Book export path must be absolute.");
    const resolved = path.resolve(normalized);
    if (
      path.extname(resolved).toLocaleLowerCase("en-US") !==
      `.${extension.toLocaleLowerCase("en-US")}`
    ) {
      throw new Error(`Book export path must use the .${extension} extension.`);
    }
    const parent = path.dirname(resolved);
    if (!existsSync(parent) || !statSync(parent).isDirectory()) {
      throw new Error(`Export directory does not exist: ${parent}`);
    }
    return resolved;
  }

  safeFileName(value: string): string {
    const printable = Array.from(value.trim())
      .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
      .join("");
    return (
      printable
        .replace(/[<>:"/\\|?*]/g, "-")
        .replace(/[. ]+$/g, "")
        .slice(0, 120) || "未命名书籍"
    );
  }

  requirePackagePath(value: string): string {
    const normalized = value.trim();
    if (!normalized || !path.isAbsolute(normalized)) {
      throw new Error("StoryOS book package path must be absolute.");
    }
    const resolved = path.resolve(normalized);
    if (path.extname(resolved).toLowerCase() !== ".storyos-book") {
      throw new Error("StoryOS book packages must use the .storyos-book extension.");
    }
    return resolved;
  }
}
