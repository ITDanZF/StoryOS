import { z } from "zod";
import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type { ChapterDraftRequest } from "../../../shared/book/drafts.ts";
import type { CreateBookshelfBookRequest } from "../../../shared/contracts/books/bookshelfContracts.ts";
import type {
  CreateBookChapterRequest,
  CreateBookRequest,
  CreateBookVolumeRequest,
  DeleteBookChapterRequest,
  DeleteBookVolumeRequest,
  SaveBookChapterContentRequest,
  UpdateBookChapterRequest,
  UpdateBookRequest,
} from "../../../shared/contracts/books/bookWorkspaceContracts.ts";
import type DesktopController from "../DesktopController.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
import {
  requireBoundedString,
  requireContent,
  requireNovelStatus,
  requireNullableRevisionId,
  requireText,
} from "./validation.ts";
export default class BookIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => Pick<
      DesktopController,
      | "getBookshelfBooks"
      | "createBookshelfBook"
      | "getBookshelfTrash"
      | "moveBookshelfBookToTrash"
      | "restoreBookshelfBookFromTrash"
      | "permanentlyDeleteBookshelfBook"
      | "createBook"
      | "createBookChapter"
      | "createBookVolume"
      | "deleteBookVolume"
      | "deleteBookChapter"
      | "updateBook"
      | "updateBookChapter"
      | "getBookChapterContent"
      | "chapterDraft"
      | "saveBookChapterContent"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.bookshelfBooks, (page?: { after?: string; limit: number }) =>
      getController().getBookshelfBooks(
        z
          .object({
            after: z.string().max(1000).optional(),
            limit: z.number().int().min(1).max(500),
          })
          .optional()
          .parse(page) as { after?: string; limit: number } | undefined,
      ),
    );
    handle(AGENT_IPC_CHANNELS.createBookshelfBook, (request: CreateBookshelfBookRequest) =>
      getController().createBookshelfBook({
        title: requireText(request?.title, "Book title"),
        synopsis: requireBoundedString(request?.synopsis, "Book synopsis", 20_000),
      }),
    );
    handle(AGENT_IPC_CHANNELS.bookshelfTrash, () => getController().getBookshelfTrash());
    handle(AGENT_IPC_CHANNELS.moveBookshelfBookToTrash, (bookId: string) =>
      getController().moveBookshelfBookToTrash(requireText(bookId, "Book id")),
    );
    handle(AGENT_IPC_CHANNELS.restoreBookshelfBookFromTrash, (bookId: string) =>
      getController().restoreBookshelfBookFromTrash(requireText(bookId, "Book id")),
    );
    handle(
      AGENT_IPC_CHANNELS.permanentlyDeleteBookshelfBook,
      (request: { readonly bookId: string; readonly confirmationBookId: string }) =>
        getController().permanentlyDeleteBookshelfBook({
          bookId: requireText(request?.bookId, "Book id"),
          confirmationBookId: requireText(
            request?.confirmationBookId,
            "Book deletion confirmation id",
          ),
        }),
    );
    handle(AGENT_IPC_CHANNELS.createBook, (request: CreateBookRequest) =>
      getController().createBook({
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Book title"),
        synopsis: requireContent(request?.synopsis),
        status: requireNovelStatus(request?.status),
      }),
    );
    handle(AGENT_IPC_CHANNELS.createBookChapter, (request: CreateBookChapterRequest) =>
      getController().createBookChapter({
        projectId: requireText(request?.projectId, "Project id"),
        volumeId: requireText(request?.volumeId, "Volume id"),
        title: requireText(request?.title, "Chapter title"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.createBookVolume, (request: CreateBookVolumeRequest) =>
      getController().createBookVolume({
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Volume title"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.deleteBookVolume, (request: DeleteBookVolumeRequest) =>
      getController().deleteBookVolume({
        projectId: requireText(request?.projectId, "Project id"),
        volumeId: requireText(request?.volumeId, "Volume id"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.deleteBookChapter, (request: DeleteBookChapterRequest) =>
      getController().deleteBookChapter({
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
      }),
    );
    handle(AGENT_IPC_CHANNELS.updateBook, (request: UpdateBookRequest) =>
      getController().updateBook({
        expectedRowVersion: z.number().int().positive().parse(request.expectedRowVersion),
        projectId: requireText(request?.projectId, "Project id"),
        title: requireText(request?.title, "Book title"),
        synopsis: requireContent(request?.synopsis),
        status: requireNovelStatus(request?.status),
      }),
    );
    handle(AGENT_IPC_CHANNELS.updateBookChapter, (request: UpdateBookChapterRequest) =>
      getController().updateBookChapter({
        expectedRowVersion: z.number().int().positive().parse(request.expectedRowVersion),
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
        title: requireText(request?.title, "Chapter title"),
      }),
    );
    handle(
      AGENT_IPC_CHANNELS.getBookChapterContent,
      (request: { projectId: string; chapterId: string }) =>
        getController().getBookChapterContent({
          projectId: requireText(request?.projectId, "Project id"),
          chapterId: requireText(request?.chapterId, "Chapter id"),
        }),
    );
    handle(AGENT_IPC_CHANNELS.chapterDraft, (request: ChapterDraftRequest) => {
      const common = {
        projectId: z.string().min(1).max(200),
        chapterId: z.string().min(1).max(200),
      };
      const parsed = z
        .discriminatedUnion("action", [
          z.object({ ...common, action: z.literal("read") }),
          z.object({
            ...common,
            action: z.literal("save"),
            baseRevisionId: z.string().min(1).nullable(),
            expectedDraftVersion: z.number().int().nonnegative(),
            content: z.string().max(20_000_000),
          }),
        ])
        .parse(request);
      return getController().chapterDraft(parsed as ChapterDraftRequest);
    });
    handle(AGENT_IPC_CHANNELS.saveBookChapterContent, (request: SaveBookChapterContentRequest) =>
      getController().saveBookChapterContent({
        projectId: requireText(request?.projectId, "Project id"),
        chapterId: requireText(request?.chapterId, "Chapter id"),
        content: requireContent(request?.content),
        expectedRowVersion: z.number().int().positive().parse(request?.expectedRowVersion),
        expectedDraftVersion: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .parse(request?.expectedDraftVersion),
        expectedCurrentRevisionId: requireNullableRevisionId(request?.expectedCurrentRevisionId),
      }),
    );
  }
}
