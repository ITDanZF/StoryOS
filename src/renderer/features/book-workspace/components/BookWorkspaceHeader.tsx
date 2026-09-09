import { PageHeader } from "../../../components/layout/PageSurface.tsx";
import { BookOpen, Folder, Menu, PanelLeft, PanelRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "../../../../lib/utils.ts";
export default function BookWorkspaceHeader({
  projectName,
  bookTitle,
  hasBook,
  chapterSelected,
  chapterNumber,
  activeVolumeTitle,
  connected,
  catalogVisible,
  assistantVisible,
  openSidebar,
  showBookOverview,
  setCatalogVisible,
  setAssistantVisible,
  setAssistantFocused,
}: {
  projectName: string;
  bookTitle: string | null;
  hasBook: boolean;
  chapterSelected: boolean;
  chapterNumber: number | null;
  activeVolumeTitle: string;
  connected: boolean;
  catalogVisible: boolean;
  assistantVisible: boolean;
  openSidebar: () => void;
  showBookOverview: () => void;
  setCatalogVisible: Dispatch<SetStateAction<boolean>>;
  setAssistantVisible: Dispatch<SetStateAction<boolean>>;
  setAssistantFocused: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <PageHeader className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-2 sm:px-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-1">
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent hover:bg-muted lg:hidden"
          type="button"
          aria-label="打开侧栏"
          onClick={openSidebar}
        >
          <Menu size={19} />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span
            className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2 text-muted-foreground"
            title={`项目名称：${projectName}`}
          >
            <Folder className="shrink-0" size={12} />
            <span className="hidden text-[9px] text-text-subtle sm:inline">
              项目
            </span>
            <strong className="truncate text-[11px] font-semibold text-text-secondary">
              {projectName}
            </strong>
          </span>
          <span className="text-text-subtle">/</span>
          <button
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1 text-left transition",
              hasBook
                ? "max-w-44 font-medium text-text-secondary hover:bg-accent hover:text-accent-foreground"
                : "text-text-subtle",
            )}
            type="button"
            title={hasBook ? "查看书籍概览" : "请先设置书名"}
            disabled={!hasBook}
            aria-current={hasBook && !chapterSelected ? "page" : undefined}
            onClick={showBookOverview}
          >
            <BookOpen className="shrink-0" size={12} />
            <span className="truncate">
              {hasBook ? `《${bookTitle}》` : "待命名"}
            </span>
          </button>
          {hasBook && (
            <>
              <span className="text-text-subtle">/</span>
              <span className="text-text-subtle">
                {chapterSelected ? activeVolumeTitle : "书籍概览"}
              </span>
            </>
          )}
          {chapterNumber !== null && (
            <>
              <span className="text-text-subtle">/</span>
              <span className="truncate text-text-secondary">
                第{chapterNumber}章
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="mr-1 hidden h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-[10px] text-muted-foreground sm:flex">
          <i
            className={cn(
              "size-1.5 rounded-full",
              connected ? "bg-success-text" : "bg-text-subtle",
            )}
          />
          {connected ? "已连接" : "未配置"}
        </span>
        <button
          className={cn(
            "grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-muted",
            catalogVisible && "bg-muted",
          )}
          type="button"
          title="显示或隐藏目录 (Ctrl+B)"
          aria-label="显示或隐藏目录"
          aria-pressed={catalogVisible}
          onClick={() => setCatalogVisible((value) => !value)}
        >
          <PanelLeft size={17} />
        </button>
        <button
          className={cn(
            "grid size-8 place-items-center rounded-lg border-0 bg-transparent hover:bg-muted",
            assistantVisible && "bg-muted",
          )}
          type="button"
          title="显示或隐藏 AI (Ctrl+J)"
          aria-label="显示或隐藏 AI"
          aria-pressed={assistantVisible}
          onClick={() => {
            setAssistantVisible((value) => !value);
            setAssistantFocused(false);
          }}
        >
          <PanelRight size={17} />
        </button>
      </div>
    </PageHeader>
  );
}
