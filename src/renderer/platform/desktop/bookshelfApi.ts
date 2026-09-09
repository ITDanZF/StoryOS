import type { AgentDesktopApi } from "../../../shared/agent/contracts.ts";

type BookshelfApi = Pick<
  AgentDesktopApi,
  | "getBookshelfBooks"
  | "createBookshelfBook"
  | "getBookshelfTrash"
  | "moveBookshelfBookToTrash"
  | "restoreBookshelfBookFromTrash"
  | "permanentlyDeleteBookshelfBook"
  | "onEvent"
>;

/** Narrow desktop capability for shelf reads/mutations; no protocol translation or mock fallback. */
export function getBookshelfApi(): BookshelfApi {
  const api = window.storyOSAgent;
  if (!api) throw new Error("书架服务不可用，请在 StoryOS 桌面应用中重试。");
  return api;
}
