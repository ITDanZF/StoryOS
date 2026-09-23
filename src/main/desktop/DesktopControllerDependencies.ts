import type BookshelfApplication from "../story/application/books/BookshelfApplication.ts";
import type { NovelVectorIndexPort } from "../story/application/vectors/NovelVectorIndexCoordinator.ts";
import type ProjectApplication from "../story/application/projects/ProjectApplication.ts";
import ProjectNavigationReader from "../story/application/projects/ProjectNavigationReader.ts";
import type WorkspaceRuntimeManager from "../story/runtime/WorkspaceRuntimeManager.ts";
export type DesktopControllerDependencies = {
  readonly novelVectorIndex: Pick<NovelVectorIndexPort, "enqueue">;
  readonly projects: ProjectApplication;
  readonly runtime: WorkspaceRuntimeManager;
  readonly projectNavigation: Pick<ProjectNavigationReader, "read">;
  readonly bookshelf: Pick<
    BookshelfApplication,
    | "listBooks"
    | "createBook"
    | "listTrash"
    | "attachBookToProject"
    | "detachBookFromProject"
    | "reconcileRegistry"
    | "moveBookToTrash"
    | "restoreBookFromTrash"
    | "permanentlyDeleteBook"
    | "exportBook"
    | "importBook"
    | "listTransferFormats"
    | "prepareBookImport"
    | "commitBookImport"
    | "cancelBookImport"
    | "prepareBookExport"
    | "commitBookExport"
    | "cancelBookExport"
    | "listProjectArchives"
    | "listProjectArchiveSummaries"
    | "createProjectArchive"
    | "restoreProjectArchive"
  >;
};
