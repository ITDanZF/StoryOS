import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Palette,
  Pilcrow,
  RemoveFormatting,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../../../../lib/utils.ts";

const TEXT_COLORS = ["#292724", "#dc2626", "#d97706", "#059669", "#2563eb", "#7c3aed"] as const;
const HIGHLIGHT_COLORS = ["#fef3c7", "#fde68a", "#dcfce7", "#dbeafe", "#ede9fe", "#fee2e2"] as const;
const LINE_HEIGHTS: readonly {
  readonly label: string;
  readonly value: string | null;
}[] = [
  { label: "默认行距", value: null },
  { label: "单倍", value: "1" },
  { label: "1.5 倍", value: "1.5" },
  { label: "1.75 倍", value: "1.75" },
  { label: "双倍", value: "2" },
];

type PopoverProps = {
  readonly label: string;
  readonly icon: ReactNode;
  readonly children: (close: () => void) => ReactNode;
};

function Popover({ label, icon, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_12px_32px_rgba(30,28,20,0.16)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

type ColorPaletteProps = {
  readonly colors: readonly string[];
  readonly onSelect: (color: string) => void;
  readonly onClear: () => void;
};

function ColorPalette({ colors, onSelect, onClear }: ColorPaletteProps) {
  return (
    <div className="grid w-36 grid-cols-6 gap-1.5">
      {colors.map((color) => (
        <button
          className="size-5 rounded-md border border-black/10 shadow-sm hover:scale-110"
          key={color}
          type="button"
          title={color}
          style={{ backgroundColor: color }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(color)}
        />
      ))}
      <button className="col-span-6 mt-1 flex h-7 items-center justify-center gap-1 rounded-lg text-[10px] text-neutral-500 hover:bg-neutral-100" type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClear}><RemoveFormatting size={11} />清除颜色</button>
    </div>
  );
}

function isSafeLink(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(value.trim());
}

type EditorFormattingControlsProps = {
  readonly editor: Editor;
  readonly linkRequestId: number;
};

export default function EditorFormattingControls({
  editor,
  linkRequestId,
}: EditorFormattingControlsProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const blockState = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const type = current.isActive("heading") ? "heading" : "paragraph";
      const attributes = current.getAttributes(type);
      return {
        lineHeight: typeof attributes.lineHeight === "string"
          ? attributes.lineHeight
          : null,
        firstLineIndent: typeof attributes.firstLineIndent === "string"
          ? attributes.firstLineIndent
          : null,
        linkActive: current.isActive("link"),
      };
    },
  });

  useEffect(() => {
    if (!linkOpen) return;
    const currentHref = editor.getAttributes("link").href;
    setHref(typeof currentHref === "string" ? currentHref : "https://");
    window.requestAnimationFrame(() => linkInputRef.current?.focus());
  }, [editor, linkOpen]);

  useEffect(() => {
    if (linkRequestId > 0) setLinkOpen(true);
  }, [linkRequestId]);

  const applyLink = () => {
    const value = href.trim();
    if (!isSafeLink(value)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setLinkOpen(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Popover label="文字颜色" icon={<Palette size={15} />}>
        {(close) => (
          <ColorPalette
            colors={TEXT_COLORS}
            onSelect={(color) => {
              editor.chain().focus().setColor(color).run();
              close();
            }}
            onClear={() => {
              editor.chain().focus().unsetColor().run();
              close();
            }}
          />
        )}
      </Popover>
      <Popover label="文字高亮" icon={<Highlighter size={15} />}>
        {(close) => (
          <ColorPalette
            colors={HIGHLIGHT_COLORS}
            onSelect={(color) => {
              editor.chain().focus().setBackgroundColor(color).run();
              close();
            }}
            onClear={() => {
              editor.chain().focus().unsetBackgroundColor().run();
              close();
            }}
          />
        )}
      </Popover>

      <Popover label="段落格式" icon={<Pilcrow size={15} />}>
        {(close) => (
          <div className="w-40 space-y-1">
            <span className="block px-2 pb-1 text-[9px] font-medium text-neutral-400">行距</span>
            {LINE_HEIGHTS.map((option) => (
              <button
                className={cn(
                  "flex h-7 w-full items-center rounded-lg px-2 text-left text-[10px] text-neutral-600 hover:bg-neutral-100",
                  blockState?.lineHeight === option.value && "bg-violet-50 text-violet-700",
                )}
                type="button"
                key={option.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  editor.commands.setParagraphFormat({ lineHeight: option.value });
                  close();
                }}
              >
                {option.label}
              </button>
            ))}
            <button className="mt-1 flex h-8 w-full items-center rounded-lg border-t border-neutral-100 px-2 text-left text-[10px] text-neutral-600 hover:bg-neutral-100" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
              editor.commands.setParagraphFormat({
                firstLineIndent: blockState?.firstLineIndent === "2em" ? null : "2em",
              });
              close();
            }}>首行缩进 2 字符</button>
          </div>
        )}
      </Popover>

      <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" type="button" title="减少缩进" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.commands.adjustParagraphIndent(-2)}><IndentDecrease size={15} /></button>
      <button className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" type="button" title="增加缩进" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.commands.adjustParagraphIndent(2)}><IndentIncrease size={15} /></button>

      <div className="relative">
        <button className={cn("grid size-8 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900", blockState?.linkActive && "bg-violet-50 text-violet-700")} type="button" title="插入或编辑链接 Mod+K" aria-pressed={blockState?.linkActive} onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkOpen((current) => !current)}><Link2 size={15} /></button>
        {linkOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 rounded-xl border border-neutral-200 bg-white p-2 shadow-[0_12px_32px_rgba(30,28,20,0.16)]">
            <div className="flex gap-1.5">
              <input ref={linkInputRef} className="h-8 min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 text-[11px] outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100" value={href} aria-label="链接地址" onChange={(event) => setHref(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") applyLink();
                if (event.key === "Escape") setLinkOpen(false);
              }} />
              <button className="h-8 rounded-lg bg-violet-600 px-2.5 text-[10px] text-white disabled:opacity-40" type="button" disabled={!isSafeLink(href)} onClick={applyLink}>应用</button>
              {blockState?.linkActive && (
                <button className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600" type="button" title="移除链接" onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkOpen(false);
                }}><Unlink size={13} /></button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
