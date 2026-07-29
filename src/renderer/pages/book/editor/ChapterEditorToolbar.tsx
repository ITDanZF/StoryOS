import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../../../lib/utils.ts";

type ChapterEditorToolbarProps = {
  readonly editor: Editor | null;
  readonly onAskAi: () => void;
};

type ToolbarButtonProps = {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onRun: () => void;
};

type ToolbarOption = {
  readonly label: string;
  readonly value: string;
};

type ToolbarMenuProps = {
  readonly ariaLabel: string;
  readonly disabled: boolean;
  readonly options: readonly ToolbarOption[];
  readonly value: string;
  readonly widthClassName: string;
  readonly onSelect: (value: string) => void;
};

const BLOCK_STYLES: readonly ToolbarOption[] = [
  { label: "正文", value: "paragraph" },
  { label: "小标题", value: "heading-2" },
  { label: "场景标题", value: "heading-3" },
];

const FONT_FAMILIES: readonly ToolbarOption[] = [
  { label: "默认宋体", value: "" },
  {
    label: "黑体",
    value: "Microsoft YaHei, Noto Sans CJK SC, sans-serif",
  },
  { label: "楷体", value: "KaiTi, STKaiti, serif" },
  { label: "等宽", value: "Consolas, Microsoft YaHei, monospace" },
];

const FONT_SIZES: readonly ToolbarOption[] = [
  { label: "默认字号", value: "" },
  { label: "15 px", value: "15px" },
  { label: "16 px", value: "16px" },
  { label: "17 px", value: "17px" },
  { label: "18 px", value: "18px" },
  { label: "20 px", value: "20px" },
];

function ToolbarButton({
  active = false,
  disabled = false,
  icon,
  label,
  onRun,
}: ToolbarButtonProps) {
  return (
    <button
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-30",
        active && "bg-violet-50 text-violet-700 hover:bg-violet-100",
      )}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      {icon}
    </button>
  );
}

function ToolbarMenu({
  ariaLabel,
  disabled,
  options,
  value,
  widthClassName,
  onSelect,
}: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ??
    options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        className={cn(
          "flex h-8 items-center justify-between gap-1.5 rounded-lg border border-transparent bg-transparent px-2 text-[11px] text-neutral-700 outline-none transition-all duration-150 hover:bg-neutral-100 focus-visible:border-violet-200 focus-visible:ring-2 focus-visible:ring-violet-100 disabled:opacity-40",
          widthClassName,
          open && "border-neutral-200 bg-white shadow-sm",
        )}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown
          className={cn(
            "shrink-0 text-neutral-400 transition-transform duration-150",
            open && "rotate-180 text-neutral-600",
          )}
          size={13}
        />
      </button>

      <div
        className={cn(
          "absolute left-0 top-[calc(100%+6px)] z-50 min-w-full rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_rgba(30,28,20,0.14)] transition-all duration-150",
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-1 opacity-0",
        )}
        id={menuId}
        role="listbox"
        aria-label={ariaLabel}
      >
        {options.map((option) => {
          const active = option.value === selected.value;
          return (
            <button
              className={cn(
                "flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-lg border-0 bg-transparent px-2 text-left text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950",
                active && "bg-violet-50 text-violet-700",
              )}
              type="button"
              key={option.value || "default"}
              role="option"
              aria-selected={active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "shrink-0",
                  active ? "opacity-100" : "opacity-0",
                )}
                size={13}
              />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToolbarDivider() {
  return <span className="mx-1.5 h-4 w-px shrink-0 bg-neutral-200" />;
}

function setEditorFontFamily(editor: Editor, value: string) {
  const selection = editor.state.selection;
  const chain = editor.chain().focus();
  if (selection.empty) chain.selectAll();
  if (value) chain.setFontFamily(value);
  else chain.unsetFontFamily();
  if (selection.empty) chain.setTextSelection(selection.from);
  chain.run();
}

function setEditorFontSize(editor: Editor, value: string) {
  const selection = editor.state.selection;
  const chain = editor.chain().focus();
  if (selection.empty) chain.selectAll();
  if (value) chain.setFontSize(value);
  else chain.unsetFontSize();
  if (selection.empty) chain.setTextSelection(selection.from);
  chain.run();
}

export default function ChapterEditorToolbar({
  editor,
  onAskAi,
}: ChapterEditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const textStyle = current?.getAttributes("textStyle") ?? {};
      const block = current?.isActive("heading", { level: 2 })
        ? "heading-2"
        : current?.isActive("heading", { level: 3 })
          ? "heading-3"
          : "paragraph";
      const blockAttributes = current?.getAttributes(
        current.isActive("heading") ? "heading" : "paragraph",
      ) ?? {};

      return {
        block,
        fontFamily: typeof textStyle.fontFamily === "string"
          ? textStyle.fontFamily
          : "",
        fontSize: typeof textStyle.fontSize === "string"
          ? textStyle.fontSize
          : "",
        bold: current?.isActive("bold") ?? false,
        italic: current?.isActive("italic") ?? false,
        underline: current?.isActive("underline") ?? false,
        strike: current?.isActive("strike") ?? false,
        blockquote: current?.isActive("blockquote") ?? false,
        bulletList: current?.isActive("bulletList") ?? false,
        orderedList: current?.isActive("orderedList") ?? false,
        textAlign: typeof blockAttributes.textAlign === "string"
          ? blockAttributes.textAlign
          : "left",
        canUndo: current?.can().chain().focus().undo().run() ?? false,
        canRedo: current?.can().chain().focus().redo().run() ?? false,
      };
    },
  });

  return (
    <div
      className="relative z-20 flex h-12 shrink-0 items-center border-b border-neutral-100 bg-white px-2 sm:px-3 lg:px-5"
      aria-label="编辑工具栏"
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarMenu
            ariaLabel="段落样式"
            disabled={!editor}
            options={BLOCK_STYLES}
            value={state?.block ?? "paragraph"}
            widthClassName="w-[78px]"
            onSelect={(value) => {
              const chain = editor?.chain().focus();
              if (value === "heading-2") {
                chain?.setHeading({ level: 2 }).run();
              } else if (value === "heading-3") {
                chain?.setHeading({ level: 3 }).run();
              } else {
                chain?.setParagraph().run();
              }
            }}
          />
          <ToolbarMenu
            ariaLabel="字体"
            disabled={!editor}
            options={FONT_FAMILIES}
            value={state?.fontFamily ?? ""}
            widthClassName="w-[92px]"
            onSelect={(value) => {
              if (editor) setEditorFontFamily(editor, value);
            }}
          />
          <ToolbarMenu
            ariaLabel="字号"
            disabled={!editor}
            options={FONT_SIZES}
            value={state?.fontSize ?? ""}
            widthClassName="w-[82px]"
            onSelect={(value) => {
              if (editor) setEditorFontSize(editor, value);
            }}
          />
        </div>

        <div className="chapter-editor-toolbar-scroll ml-1 flex min-w-0 flex-1 items-center overflow-x-auto">
          <ToolbarDivider />
          <ToolbarButton active={state?.bold} disabled={!editor} icon={<Bold size={15} />} label="加粗 Ctrl+B" onRun={() => editor?.chain().focus().toggleBold().run()} />
          <ToolbarButton active={state?.italic} disabled={!editor} icon={<Italic size={15} />} label="斜体 Ctrl+I" onRun={() => editor?.chain().focus().toggleItalic().run()} />
          <ToolbarButton active={state?.underline} disabled={!editor} icon={<Underline size={15} />} label="下划线 Ctrl+U" onRun={() => editor?.chain().focus().toggleUnderline().run()} />
          <ToolbarButton active={state?.strike} disabled={!editor} icon={<Strikethrough size={15} />} label="删除线" onRun={() => editor?.chain().focus().toggleStrike().run()} />

          <ToolbarDivider />
          <ToolbarButton active={state?.blockquote} disabled={!editor} icon={<Quote size={15} />} label="引用" onRun={() => editor?.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton active={state?.bulletList} disabled={!editor} icon={<List size={16} />} label="无序列表" onRun={() => editor?.chain().focus().toggleBulletList().run()} />
          <ToolbarButton active={state?.orderedList} disabled={!editor} icon={<ListOrdered size={16} />} label="有序列表" onRun={() => editor?.chain().focus().toggleOrderedList().run()} />

          <ToolbarDivider />
          <ToolbarButton active={state?.textAlign === "left"} disabled={!editor} icon={<AlignLeft size={16} />} label="左对齐" onRun={() => editor?.chain().focus().setTextAlign("left").run()} />
          <ToolbarButton active={state?.textAlign === "center"} disabled={!editor} icon={<AlignCenter size={16} />} label="居中" onRun={() => editor?.chain().focus().setTextAlign("center").run()} />
          <ToolbarButton active={state?.textAlign === "right"} disabled={!editor} icon={<AlignRight size={16} />} label="右对齐" onRun={() => editor?.chain().focus().setTextAlign("right").run()} />

          <ToolbarDivider />
          <ToolbarButton disabled={!editor} icon={<RemoveFormatting size={15} />} label="清除格式" onRun={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} />
          <ToolbarButton disabled={!state?.canUndo} icon={<RotateCcw size={15} />} label="撤销 Ctrl+Z" onRun={() => editor?.chain().focus().undo().run()} />
          <ToolbarButton disabled={!state?.canRedo} icon={<Redo2 size={15} />} label="重做 Ctrl+Shift+Z" onRun={() => editor?.chain().focus().redo().run()} />
        </div>
      </div>

      <span className="mx-2 h-5 w-px shrink-0 bg-neutral-200" />
      <button
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-[11px] font-medium text-violet-600 transition-colors hover:bg-violet-50 disabled:opacity-40"
        type="button"
        disabled={!editor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAskAi}
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">询问 AI</span>
      </button>
    </div>
  );
}
