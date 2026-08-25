import path from "node:path";

export type ProjectArchiveLayout = {
  readonly rootPath: string;
  readonly projectPath: string;
  readonly bookSnapshotPath: string;
  readonly manifestPath: string;
  readonly checksumsPath: string;
};

export function getProjectArchivesRoot(agentHome: string): string {
  return path.resolve(agentHome, "archives", "projects");
}

export function getProjectArchiveCreationRoot(agentHome: string): string {
  return path.join(getProjectArchivesRoot(agentHome), ".creating");
}

export function getProjectArchiveRestoreRoot(agentHome: string): string {
  return path.join(getProjectArchivesRoot(agentHome), ".restoring");
}

export function getProjectArchiveLayout(rootPath: string): ProjectArchiveLayout {
  const resolved = path.resolve(rootPath);
  return Object.freeze({
    rootPath: resolved,
    projectPath: path.join(resolved, "project"),
    bookSnapshotPath: path.join(resolved, "book-snapshot", "book.sqlite"),
    manifestPath: path.join(resolved, "manifest.json"),
    checksumsPath: path.join(resolved, "checksums.json"),
  });
}

export function getPublishedProjectArchiveLayout(
  agentHome: string,
  archiveId: string,
): ProjectArchiveLayout {
  if (!/^archive_[0-9a-f-]{36}$/i.test(archiveId)) {
    throw new Error(`Invalid project archive id: ${archiveId}`);
  }
  return getProjectArchiveLayout(
    path.join(getProjectArchivesRoot(agentHome), archiveId),
  );
}
