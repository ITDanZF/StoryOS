import type { WindowDesktopApi } from "../../../shared/window/contracts.ts";

const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

if (previewEnabled && !window.storyOSWindow) {
  const files = [
    { name: "完整备份.storyos-book", extension: "storyos-book", size: 2480000 },
    { name: "编辑稿.docx", extension: "docx", size: 860000 },
    { name: "长篇小说.md", extension: "md", size: 185000 },
    { name: "旧稿.txt", extension: "txt", size: 142000 },
  ];
  const api: WindowDesktopApi = {
    getState: async () => ({ maximized: false, fullScreen: false }),
    pickDirectory: async () => "/preview/Documents",
    pickFile: async () => "/preview/Documents/完整备份.storyos-book",
    saveFile: async ({ defaultPath }) => `/preview/Documents/${defaultPath ?? "export.storyos-book"}`,
    getFileBrowserLocations: async () => [
      { id: "home", label: "用户目录", absolutePath: "/preview", kind: "home" },
      { id: "desktop", label: "桌面", absolutePath: "/preview/Desktop", kind: "desktop" },
      { id: "documents", label: "文档", absolutePath: "/preview/Documents", kind: "documents" },
      { id: "downloads", label: "下载", absolutePath: "/preview/Downloads", kind: "downloads" },
      { id: "volume", label: "本地磁盘", absolutePath: "/preview", kind: "volume" },
    ],
    listFileBrowserDirectory: async ({ directoryPath, extensions, query }) => ({
      directoryPath,
      parentPath: directoryPath === "/preview" ? null : "/preview",
      entries: [
        { name: "小说", absolutePath: `${directoryPath}/小说`, kind: "directory" as const, size: null, modifiedAt: new Date().toISOString(), extension: null, accessible: true },
        ...files.filter((file) => (!extensions || extensions.length === 0 || extensions.includes(file.extension)) && (!query || file.name.includes(query))).map((file) => ({ name: file.name, absolutePath: `${directoryPath}/${file.name}`, kind: "file" as const, size: file.size, modifiedAt: new Date().toISOString(), extension: file.extension, accessible: true })),
      ],
      nextCursor: null,
    }),
    resolveFileBrowserTarget: async ({ directoryPath, fileName, extension }) => ({ outputPath: `${directoryPath}/${fileName}.${extension}`, exists: false }),
    getDroppedFilePath: (file) => `/preview/Documents/${file.name}`,
    revealFile: async () => undefined,
    rememberTransferLocation: async () => undefined,
    minimize: async () => undefined,
    toggleMaximize: async () => ({ maximized: false, fullScreen: false }),
    close: () => undefined,
    onStateChanged: () => () => undefined,
  };
  Object.defineProperty(window, "storyOSWindow", { configurable: true, value: api });
}
