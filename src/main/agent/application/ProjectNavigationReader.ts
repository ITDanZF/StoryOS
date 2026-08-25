import type ProjectApplication from "./ProjectApplication.ts";
import type { BookRegistry } from "./bookRegistryPorts.ts";
import type { ProjectNavigationSnapshot } from "./projectNavigationContracts.ts";
import NovelApplication from "./NovelApplication.ts";
import ThreadApplication from "./ThreadApplication.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import type BookRuntimeManager from "../runtime/BookRuntimeManager.ts";
import type { BookRuntimeLease } from "../runtime/BookRuntimeManager.ts";
import SqliteThreadStore from "../storage/project/SqliteThreadStore.ts";
import { getWorkspaceLayout } from "../workspace/ProjectLayout.ts";

export default class ProjectNavigationReader {
  constructor(
    private readonly projects: ProjectApplication,
    private readonly books: BookRegistry,
    private readonly bookRuntimes: BookRuntimeManager,
  ) {}

  read(projectId: string): ProjectNavigationSnapshot {
    const project = this.projects.getSnapshot().projects.find(
      (item) => item.id === projectId,
    );
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const database = new ProjectDatabase(
      getWorkspaceLayout(project.path).projectDatabasePath,
    );
    let bookLease: BookRuntimeLease | null = null;
    try {
      const threads = new ThreadApplication(
        new SqliteThreadStore(database.handle),
      );
      const registeredBook = this.books.getBookForProject(project.id);
      bookLease = registeredBook
        ? this.bookRuntimes.acquire(registeredBook.id)
        : null;
      const novels = bookLease
        ? new NovelApplication(bookLease.persistence)
        : null;
      const book = novels?.getProjectBook() ?? null;
      const bookSummary = book && novels
        ? Object.freeze({
            id: book.id,
            title: book.title,
            status: book.status,
            volumeCount: novels.listVolumes(book.id).length,
            chapterCount: novels.listChapters(book.id).length,
            updatedAt: book.updatedAt,
          })
        : null;
      return Object.freeze({
        project,
        book: bookSummary,
        conversations: threads.getSnapshot(),
      });
    } finally {
      bookLease?.close();
      database.close();
    }
  }
}
