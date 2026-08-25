export const STORYOS_BOOK_FORMAT_VERSION = 1;
export const MAX_STORYOS_BOOK_PACKAGE_BYTES = 512 * 1024 * 1024;

export type StoryOSBookManifest = {
  readonly format: "storyos-book";
  readonly formatVersion: number;
  readonly sourceBookId: string;
  readonly databaseApplicationId: number;
  readonly databaseUserVersion: number;
  readonly title: string;
  readonly exportedAt: string;
  readonly applicationVersion: string;
};

export type StoryOSBookChecksums = {
  readonly algorithm: "sha256";
  readonly files: {
    readonly "manifest.json": string;
    readonly "book.sqlite": string;
  };
};

export type ExportBookRequest = {
  readonly bookId: string;
  readonly outputPath: string;
};

export type ImportBookRequest = {
  readonly packagePath: string;
};

export type ImportBookResult = {
  readonly operationId: string;
  readonly bookId: string;
  readonly sourceBookId: string;
  readonly title: string;
};
