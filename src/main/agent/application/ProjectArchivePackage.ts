import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ProjectArchiveManifest } from "./projectArchiveContracts.ts";
import { PROJECT_ARCHIVE_FORMAT_VERSION } from "./projectArchiveContracts.ts";
import type { ProjectArchiveLayout } from "../storage/archive/ProjectArchiveLayout.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import BookDatabase from "../storage/book/BookDatabase.ts";

type ProjectArchiveChecksums = {
  readonly algorithm: "sha256";
  readonly files: Readonly<Record<string, string>>;
};

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function relativeArchivePath(rootPath: string, filePath: string): string {
  const relative = path.relative(rootPath, filePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Archive file escapes its root: ${filePath}`);
  }
  return relative;
}

function listRegularFiles(rootPath: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Project archives do not support symbolic links: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      } else {
        throw new Error(`Project archives only support regular files: ${entryPath}`);
      }
    }
  };
  visit(rootPath);
  return Object.freeze(files.sort());
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function copyProjectDirectory(source: string, target: string): void {
  const resolvedSource = path.resolve(source);
  const resolvedTarget = path.resolve(target);
  const relativeTarget = path.relative(resolvedSource, resolvedTarget);
  if (!relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget)) {
    throw new Error("The project archive target cannot be inside the project.");
  }
  if (!lstatSync(resolvedSource).isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolvedSource}`);
  }
  mkdirSync(resolvedTarget, { recursive: false });
  const copy = (sourceDirectory: string, targetDirectory: string): void => {
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const targetPath = path.join(targetDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Project archives do not support symbolic links: ${sourcePath}`);
      }
      if (entry.isDirectory()) {
        mkdirSync(targetPath);
        copy(sourcePath, targetPath);
      } else if (entry.isFile()) {
        copyFileSync(sourcePath, targetPath);
      } else {
        throw new Error(`Project archives only support regular files: ${sourcePath}`);
      }
    }
  };
  copy(resolvedSource, resolvedTarget);
}

export function sealProjectArchive(
  layout: ProjectArchiveLayout,
  manifest: ProjectArchiveManifest,
): string {
  const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(layout.manifestPath, manifestContent, { flag: "wx" });
  const checksums: Record<string, string> = {};
  for (const filePath of listRegularFiles(layout.rootPath)) {
    if (filePath === layout.checksumsPath) continue;
    checksums[relativeArchivePath(layout.rootPath, filePath)] = sha256File(filePath);
  }
  const document: ProjectArchiveChecksums = Object.freeze({
    algorithm: "sha256",
    files: Object.freeze(checksums),
  });
  writeFileSync(layout.checksumsPath, JSON.stringify(document, null, 2), {
    flag: "wx",
  });
  return createHash("sha256").update(manifestContent).digest("hex");
}

export function validateProjectArchive(layout: ProjectArchiveLayout): {
  readonly manifest: ProjectArchiveManifest;
  readonly manifestHash: string;
} {
  if (!existsSync(layout.manifestPath) || !existsSync(layout.checksumsPath)) {
    throw new Error("Project archive manifest or checksums are missing.");
  }
  const manifestContent = readFileSync(layout.manifestPath);
  const manifest = JSON.parse(manifestContent.toString("utf8")) as ProjectArchiveManifest;
  if (
    manifest?.format !== "storyos-project-archive" ||
    manifest.formatVersion !== PROJECT_ARCHIVE_FORMAT_VERSION ||
    !/^archive_[0-9a-f-]{36}$/i.test(manifest.archiveId ?? "") ||
    !isValidDateString(manifest.createdAt) ||
    typeof manifest.applicationVersion !== "string" ||
    typeof manifest.project?.id !== "string" || !manifest.project.id.trim() ||
    typeof manifest.project.name !== "string" || !manifest.project.name.trim() ||
    typeof manifest.project.originalPath !== "string" ||
    !path.isAbsolute(manifest.project.originalPath) ||
    !["created", "linked"].includes(manifest.project.locationType) ||
    typeof manifest.project.trusted !== "boolean" ||
    !isValidDateString(manifest.project.createdAt) ||
    !isValidDateString(manifest.project.updatedAt) ||
    !isValidDateString(manifest.project.lastOpenedAt) ||
    (manifest.book !== null && (
      !/^book_[0-9a-f-]{36}$/i.test(manifest.book?.sourceBookId ?? "") ||
      manifest.book.snapshotPath !== "book-snapshot/book.sqlite"
    ))
  ) {
    throw new Error("Invalid StoryOS project archive manifest.");
  }
  const checksums = JSON.parse(
    readFileSync(layout.checksumsPath, "utf8"),
  ) as ProjectArchiveChecksums;
  if (checksums?.algorithm !== "sha256" || !checksums.files) {
    throw new Error("Invalid StoryOS project archive checksums.");
  }
  const actualFiles = listRegularFiles(layout.rootPath)
    .filter((filePath) => filePath !== layout.checksumsPath)
    .map((filePath) => relativeArchivePath(layout.rootPath, filePath));
  const expectedFiles = Object.keys(checksums.files).sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((value, index) => value !== expectedFiles[index])
  ) {
    throw new Error(
      `Project archive file list does not match its checksums: actual=${actualFiles.join(",")}; expected=${expectedFiles.join(",")}`,
    );
  }
  for (const relativePath of expectedFiles) {
    if (relativePath.includes("\\") || relativePath.split("/").includes("..")) {
      throw new Error(`Unsafe project archive path: ${relativePath}`);
    }
    const filePath = path.resolve(layout.rootPath, ...relativePath.split("/"));
    if (sha256File(filePath) !== checksums.files[relativePath]) {
      throw new Error(`Project archive checksum mismatch: ${relativePath}`);
    }
  }
  const projectDatabasePath = path.join(
    layout.projectPath,
    ".storyos",
    "project.sqlite",
  );
  ProjectDatabase.validateExisting(projectDatabasePath);
  if (manifest.book) BookDatabase.validateExisting(layout.bookSnapshotPath);
  for (const databasePath of [
    projectDatabasePath,
    ...(manifest.book ? [layout.bookSnapshotPath] : []),
  ]) {
    for (const suffix of ["-wal", "-shm"]) {
      const sidecarPath = `${databasePath}${suffix}`;
      const sidecarRelativePath = relativeArchivePath(layout.rootPath, sidecarPath);
      if (!(sidecarRelativePath in checksums.files)) {
        rmSync(sidecarPath, { force: true });
      }
    }
  }
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestHash: createHash("sha256").update(manifestContent).digest("hex"),
  });
}
