import type ProjectApplication from "./ProjectApplication.ts";
import type { ProjectNavigationSnapshot } from "./projectNavigationContracts.ts";
import NovelApplication from "./NovelApplication.ts";
import ThreadApplication from "./ThreadApplication.ts";
import ProjectDatabase from "../storage/project/ProjectDatabase.ts";
import SqliteNovelStore from "../storage/project/SqliteNovelStore.ts";
import SqliteThreadStore from "../storage/project/SqliteThreadStore.ts";
import { getWorkspaceLayout } from "../workspace/ProjectLayout.ts";

export default class ProjectNavigationReader {
  constructor(private readonly projects: ProjectApplication) {}

  read(projectId: string): ProjectNavigationSnapshot {
    const project = this.projects.getSnapshot().projects.find(
      (item) => item.id === projectId,
    );
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const database = new ProjectDatabase(
      getWorkspaceLayout(project.path).databasePath,
    );
    try {
      const threads = new ThreadApplication(
        new SqliteThreadStore(database.handle),
      );
      const novels = new NovelApplication(
        new SqliteNovelStore(database.handle),
      );
      const book = novels.getProjectBook();
      return Object.freeze({
        project,
        book: book ? Object.freeze({
          id: book.id,
          title: book.title,
          status: book.status,
          volumeCount: novels.listVolumes(book.id).length,
          chapterCount: novels.listChapters(book.id).length,
          updatedAt: book.updatedAt,
        }) : null,
        conversations: threads.getSnapshot(),
      });
    } finally {
      database.close();
    }
  }
}
