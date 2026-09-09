import type { NovelPersistence } from "../../application/books/novelPorts.ts";
export default class CatalogUpdatingBookStore implements NovelPersistence {
  constructor(
    private readonly source: NovelPersistence,
    private readonly refresh: () => void,
  ) {}
  getDraft(
    ...args: Parameters<NovelPersistence["getDraft"]>
  ): ReturnType<NovelPersistence["getDraft"]> {
    const result = this.source.getDraft(...args);
    return result;
  }
  saveDraft(
    ...args: Parameters<NovelPersistence["saveDraft"]>
  ): ReturnType<NovelPersistence["saveDraft"]> {
    const result = this.source.saveDraft(...args);
    return result;
  }
  createNovel(
    ...args: Parameters<NovelPersistence["createNovel"]>
  ): ReturnType<NovelPersistence["createNovel"]> {
    const result = this.source.createNovel(...args);
    this.refresh();
    return result;
  }
  getNovel(
    ...args: Parameters<NovelPersistence["getNovel"]>
  ): ReturnType<NovelPersistence["getNovel"]> {
    const result = this.source.getNovel(...args);
    return result;
  }
  listNovels(
    ...args: Parameters<NovelPersistence["listNovels"]>
  ): ReturnType<NovelPersistence["listNovels"]> {
    const result = this.source.listNovels(...args);
    return result;
  }
  updateNovel(
    ...args: Parameters<NovelPersistence["updateNovel"]>
  ): ReturnType<NovelPersistence["updateNovel"]> {
    const result = this.source.updateNovel(...args);
    this.refresh();
    return result;
  }
  deleteNovel(
    ...args: Parameters<NovelPersistence["deleteNovel"]>
  ): ReturnType<NovelPersistence["deleteNovel"]> {
    const result = this.source.deleteNovel(...args);
    this.refresh();
    return result;
  }
  createVolume(
    ...args: Parameters<NovelPersistence["createVolume"]>
  ): ReturnType<NovelPersistence["createVolume"]> {
    const result = this.source.createVolume(...args);
    this.refresh();
    return result;
  }
  listVolumes(
    ...args: Parameters<NovelPersistence["listVolumes"]>
  ): ReturnType<NovelPersistence["listVolumes"]> {
    const result = this.source.listVolumes(...args);
    return result;
  }
  updateVolume(
    ...args: Parameters<NovelPersistence["updateVolume"]>
  ): ReturnType<NovelPersistence["updateVolume"]> {
    const result = this.source.updateVolume(...args);
    this.refresh();
    return result;
  }
  deleteVolume(
    ...args: Parameters<NovelPersistence["deleteVolume"]>
  ): ReturnType<NovelPersistence["deleteVolume"]> {
    const result = this.source.deleteVolume(...args);
    this.refresh();
    return result;
  }
  createChapter(
    ...args: Parameters<NovelPersistence["createChapter"]>
  ): ReturnType<NovelPersistence["createChapter"]> {
    const result = this.source.createChapter(...args);
    this.refresh();
    return result;
  }
  getChapter(
    ...args: Parameters<NovelPersistence["getChapter"]>
  ): ReturnType<NovelPersistence["getChapter"]> {
    const result = this.source.getChapter(...args);
    return result;
  }
  listChapters(
    ...args: Parameters<NovelPersistence["listChapters"]>
  ): ReturnType<NovelPersistence["listChapters"]> {
    const result = this.source.listChapters(...args);
    return result;
  }
  listChapterSummaries(
    ...args: Parameters<NovelPersistence["listChapterSummaries"]>
  ): ReturnType<NovelPersistence["listChapterSummaries"]> {
    const result = this.source.listChapterSummaries(...args);
    return result;
  }
  updateChapter(
    ...args: Parameters<NovelPersistence["updateChapter"]>
  ): ReturnType<NovelPersistence["updateChapter"]> {
    const result = this.source.updateChapter(...args);
    this.refresh();
    return result;
  }
  deleteChapter(
    ...args: Parameters<NovelPersistence["deleteChapter"]>
  ): ReturnType<NovelPersistence["deleteChapter"]> {
    const result = this.source.deleteChapter(...args);
    this.refresh();
    return result;
  }
  saveRevision(
    ...args: Parameters<NovelPersistence["saveRevision"]>
  ): ReturnType<NovelPersistence["saveRevision"]> {
    const result = this.source.saveRevision(...args);
    this.refresh();
    return result;
  }
  getRevisionMetadata(
    ...args: Parameters<NovelPersistence["getRevisionMetadata"]>
  ): ReturnType<NovelPersistence["getRevisionMetadata"]> {
    const result = this.source.getRevisionMetadata(...args);
    return result;
  }
  getRevision(
    ...args: Parameters<NovelPersistence["getRevision"]>
  ): ReturnType<NovelPersistence["getRevision"]> {
    const result = this.source.getRevision(...args);
    return result;
  }
  listRevisions(
    ...args: Parameters<NovelPersistence["listRevisions"]>
  ): ReturnType<NovelPersistence["listRevisions"]> {
    const result = this.source.listRevisions(...args);
    return result;
  }
}
