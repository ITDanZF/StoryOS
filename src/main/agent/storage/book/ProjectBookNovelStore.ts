import type BookProvisioningService from "../../application/BookProvisioningService.ts";
import type { BookRegistry } from "../../application/bookRegistryPorts.ts";
import type {
  ChapterRecord,
  ChapterRevisionRecord,
  NovelPersistence,
  NovelRecord,
  VolumeRecord,
} from "../../application/novelPorts.ts";
import type BookRuntimeManager from "../../runtime/BookRuntimeManager.ts";
import type { BookRuntimeLease } from "../../runtime/BookRuntimeManager.ts";

export default class ProjectBookNovelStore implements NovelPersistence {
  private lease: BookRuntimeLease | null = null;
  private delegate: NovelPersistence | null = null;

  constructor(
    private readonly projectId: string | null,
    private readonly registry: BookRegistry,
    private readonly runtimes: BookRuntimeManager,
    private readonly provisioning: BookProvisioningService,
  ) {
    const book = projectId ? registry.getBookForProject(projectId) : null;
    if (!book) return;
    if (book.state !== "available") {
      throw new Error(`Project book storage is unavailable: ${book.id}`);
    }
    registry.touchOpened(book.id);
    this.bind(runtimes.acquire(book.id));
  }

  close(): void {
    this.delegate = null;
    this.lease?.close();
    this.lease = null;
  }

  createNovel(
    input: Omit<NovelRecord, "createdAt" | "updatedAt">,
  ): NovelRecord {
    if (this.delegate) return this.delegate.createNovel(input);
    if (!this.projectId) {
      throw new Error("A project is required to create a book.");
    }

    const provisioned = this.provisioning.createForProject(
      this.projectId,
      input,
    );
    this.bind(provisioned.lease);
    return provisioned.novel;
  }

  getNovel(novelId: string): NovelRecord | null {
    return this.delegate?.getNovel(novelId) ?? null;
  }

  listNovels(): NovelRecord[] {
    return this.delegate?.listNovels() ?? [];
  }

  updateNovel(
    input: Pick<NovelRecord, "id" | "title" | "synopsis" | "status">,
  ): NovelRecord {
    return this.requireStore().updateNovel(input);
  }

  deleteNovel(novelId: string): void {
    this.requireStore().deleteNovel(novelId);
  }

  createVolume(
    input: Omit<VolumeRecord, "createdAt" | "updatedAt">,
  ): VolumeRecord {
    return this.requireStore().createVolume(input);
  }

  listVolumes(novelId: string): VolumeRecord[] {
    return this.requireStore().listVolumes(novelId);
  }

  updateVolume(
    input: Pick<VolumeRecord, "id" | "title" | "summary" | "sortOrder">,
  ): VolumeRecord {
    return this.requireStore().updateVolume(input);
  }

  deleteVolume(volumeId: string): void {
    this.requireStore().deleteVolume(volumeId);
  }

  createChapter(
    input: Omit<
      ChapterRecord,
      "currentRevisionId" | "createdAt" | "updatedAt"
    >,
  ): ChapterRecord {
    return this.requireStore().createChapter(input);
  }

  getChapter(chapterId: string): ChapterRecord | null {
    return this.delegate?.getChapter(chapterId) ?? null;
  }

  listChapters(novelId: string): ChapterRecord[] {
    return this.requireStore().listChapters(novelId);
  }

  updateChapter(
    input: Pick<
      ChapterRecord,
      "id" | "volumeId" | "title" | "status" | "sortOrder"
    >,
  ): ChapterRecord {
    return this.requireStore().updateChapter(input);
  }

  deleteChapter(chapterId: string): void {
    this.requireStore().deleteChapter(chapterId);
  }

  saveRevision(
    input: Omit<
      ChapterRevisionRecord,
      "revisionNumber" | "createdAt"
    > & { readonly expectedCurrentRevisionId: string | null },
  ): ChapterRevisionRecord {
    return this.requireStore().saveRevision(input);
  }

  getRevision(revisionId: string): ChapterRevisionRecord | null {
    return this.delegate?.getRevision(revisionId) ?? null;
  }

  listRevisions(chapterId: string): ChapterRevisionRecord[] {
    return this.requireStore().listRevisions(chapterId);
  }

  private bind(lease: BookRuntimeLease): void {
    this.lease?.close();
    this.lease = lease;
    this.delegate = lease.persistence;
  }

  private requireStore(): NovelPersistence {
    if (!this.delegate) {
      throw new Error(`Project book not found: ${this.projectId ?? "global"}`);
    }
    return this.delegate;
  }
}
