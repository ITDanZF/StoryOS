import { FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../lib/utils.ts";

type ProjectActionMenuProps = {
  readonly open: boolean;
  readonly visible: boolean;
  readonly projectName: string;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly onOpenDirectory: () => Promise<void>;
  readonly onRename: () => void;
  readonly onDelete: () => Promise<void>;
};

type MenuPosition = {
  readonly left: number;
  readonly top: number;
};

const MENU_WIDTH = 224;
const MENU_HEIGHT = 138;
const MENU_GAP = 6;

export default function ProjectActionMenu({
  open,
  visible,
  projectName,
  onToggle,
  onClose,
  onOpenDirectory,
  onRename,
  onDelete,
}: ProjectActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const left = Math.min(
        Math.max(8, anchor.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - 8,
      );
      const below = anchor.bottom + MENU_GAP;
      const top = below + MENU_HEIGHT <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.top - MENU_HEIGHT - MENU_GAP);
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  const runAsync = (action: () => Promise<void>) => {
    onClose();
    void action().catch((): void => undefined);
  };

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-400 transition hover:bg-neutral-300 hover:text-neutral-700 focus:opacity-100 group-hover:opacity-100",
          visible || open ? "opacity-100" : "opacity-0",
        )}
        type="button"
        title={`${projectName} 项目操作`}
        aria-label={`${projectName} 项目操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[90] grid w-56 gap-0.5 rounded-xl border border-neutral-200 bg-white p-1.5 text-neutral-800 shadow-[0_14px_38px_rgba(0,0,0,0.16)]"
          style={{ left: position.left, top: position.top }}
          role="menu"
          aria-label={`${projectName} 项目操作菜单`}
        >
          <button className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-xs transition-colors hover:bg-neutral-100" type="button" role="menuitem" onClick={() => runAsync(onOpenDirectory)}>
            <FolderOpen className="text-neutral-500" size={16} />
            <span>在文件资源管理器中打开</span>
          </button>
          <button className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-xs transition-colors hover:bg-neutral-100" type="button" role="menuitem" onClick={() => { onClose(); onRename(); }}>
            <Pencil className="text-neutral-500" size={16} />
            <span>重命名</span>
          </button>
          <button className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-xs text-red-600 transition-colors hover:bg-red-50" type="button" role="menuitem" onClick={() => runAsync(onDelete)}>
            <Trash2 size={16} />
            <span>删除</span>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}