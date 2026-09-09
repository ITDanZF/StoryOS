import Select from "../../../components/ui/Select.tsx";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  Search,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  type ReactNode,
} from "react";
import { cn } from "../../../../lib/utils.ts";
import {
  editorCommandLabel,
  runEditorCommand,
} from "./commands/editorCommandRegistry.ts";
import EditorFormattingControls from "./toolbar/EditorFormattingControls.tsx";

type ChapterEditorToolbarProps = {
  readonly editor: Editor | null;
  readonly linkRequestId: number;
  readonly onAskAi: () => void;
  readonly onOpenFind: () => void;
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

type ToolbarState = {
  readonly block: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly blockquote: boolean;
  readonly bulletList: boolean;
  readonly orderedList: boolean;
  readonly textAlign: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
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

const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  block: "paragraph",
  fontFamily: "",
  fontSize: "",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  textAlign: "left",
  canUndo: false,
  canRedo: false,
};

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
        "grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-30",
        active && "bg-accent text-accent-foreground hover:bg-accent",
      )}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onRun}
    >
      {icon}
    </button>
  );
}

function ToolbarMenu({ ariaLabel, disabled, options, value, widthClassName, onSelect }: ToolbarMenuProps) {
  return <Select label={ariaLabel} disabled={disabled} options={options} value={value} onChange={onSelect} preserveSelection triggerClassName={cn("h-8 text-[11px]", widthClassName)} />;
}

function ToolbarDivider() {
  return <span className="mx-1.5 h-4 w-px shrink-0 bg-border" />;
}

function setEditorFontFamily(editor: Editor, value: string) {
  const chain = editor.chain().focus();
  if (value) chain.setFontFamily(value);
  else chain.unsetFontFamily();
  chain.run();
}

function setEditorFontSize(editor: Editor, value: string) {
  const chain = editor.chain().focus();
  if (value) chain.setFontSize(value);
  else chain.unsetFontSize();
  chain.run();
}

export default function ChapterEditorToolbar({
  editor,
  linkRequestId,
  onAskAi,
  onOpenFind,
}: ChapterEditorToolbarProps) {
  const activeEditor = editor && !editor.isDestroyed ? editor : null;
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || current.isDestroyed) return DEFAULT_TOOLBAR_STATE;

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
      className="relative z-20 flex h-12 shrink-0 items-center border-b border-border bg-card px-2 sm:px-3 lg:px-5"
      aria-label="编辑工具栏"
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarMenu
            ariaLabel="段落样式"
            disabled={!activeEditor}
            options={BLOCK_STYLES}
            value={state?.block ?? "paragraph"}
            widthClassName="w-[78px]"
            onSelect={(value) => {
              const chain = activeEditor?.chain().focus();
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
            disabled={!activeEditor}
            options={FONT_FAMILIES}
            value={state?.fontFamily ?? ""}
            widthClassName="w-[92px]"
            onSelect={(value) => {
              if (activeEditor) setEditorFontFamily(activeEditor, value);
            }}
          />
          <ToolbarMenu
            ariaLabel="字号"
            disabled={!activeEditor}
            options={FONT_SIZES}
            value={state?.fontSize ?? ""}
            widthClassName="w-[82px]"
            onSelect={(value) => {
              if (activeEditor) setEditorFontSize(activeEditor, value);
            }}
          />
        </div>

        <div className="chapter-editor-toolbar-scroll ml-1 flex min-w-0 flex-1 items-center overflow-x-auto">
          <ToolbarDivider />
          <ToolbarButton active={state?.bold} disabled={!activeEditor} icon={<Bold size={15} />} label={editorCommandLabel("bold")} onRun={() => activeEditor && runEditorCommand(activeEditor, "bold")} />
          <ToolbarButton active={state?.italic} disabled={!activeEditor} icon={<Italic size={15} />} label={editorCommandLabel("italic")} onRun={() => activeEditor && runEditorCommand(activeEditor, "italic")} />
          <ToolbarButton active={state?.underline} disabled={!activeEditor} icon={<Underline size={15} />} label={editorCommandLabel("underline")} onRun={() => activeEditor && runEditorCommand(activeEditor, "underline")} />
          <ToolbarButton active={state?.strike} disabled={!activeEditor} icon={<Strikethrough size={15} />} label={editorCommandLabel("strike")} onRun={() => activeEditor && runEditorCommand(activeEditor, "strike")} />

          <ToolbarDivider />
          <ToolbarButton active={state?.blockquote} disabled={!activeEditor} icon={<Quote size={15} />} label="引用" onRun={() => activeEditor?.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton active={state?.bulletList} disabled={!activeEditor} icon={<List size={16} />} label="无序列表" onRun={() => activeEditor?.chain().focus().toggleBulletList().run()} />
          <ToolbarButton active={state?.orderedList} disabled={!activeEditor} icon={<ListOrdered size={16} />} label="有序列表" onRun={() => activeEditor?.chain().focus().toggleOrderedList().run()} />

          <ToolbarDivider />
          <ToolbarButton active={state?.textAlign === "left"} disabled={!activeEditor} icon={<AlignLeft size={16} />} label={editorCommandLabel("alignLeft")} onRun={() => activeEditor && runEditorCommand(activeEditor, "alignLeft")} />
          <ToolbarButton active={state?.textAlign === "center"} disabled={!activeEditor} icon={<AlignCenter size={16} />} label={editorCommandLabel("alignCenter")} onRun={() => activeEditor && runEditorCommand(activeEditor, "alignCenter")} />
          <ToolbarButton active={state?.textAlign === "right"} disabled={!activeEditor} icon={<AlignRight size={16} />} label={editorCommandLabel("alignRight")} onRun={() => activeEditor && runEditorCommand(activeEditor, "alignRight")} />
          <ToolbarButton active={state?.textAlign === "justify"} disabled={!activeEditor} icon={<AlignJustify size={16} />} label={editorCommandLabel("alignJustify")} onRun={() => activeEditor && runEditorCommand(activeEditor, "alignJustify")} />

          {activeEditor && (
            <>
              <ToolbarDivider />
              <EditorFormattingControls
                editor={activeEditor}
                linkRequestId={linkRequestId}
              />
            </>
          )}

          <ToolbarDivider />
          <ToolbarButton disabled={!activeEditor} icon={<RemoveFormatting size={15} />} label={editorCommandLabel("clearFormatting")} onRun={() => activeEditor && runEditorCommand(activeEditor, "clearFormatting")} />
          <ToolbarButton disabled={!activeEditor} icon={<Search size={15} />} label="查找 Mod+F" onRun={onOpenFind} />
          <ToolbarButton disabled={!activeEditor || !state?.canUndo} icon={<RotateCcw size={15} />} label={editorCommandLabel("undo")} onRun={() => activeEditor && runEditorCommand(activeEditor, "undo")} />
          <ToolbarButton disabled={!activeEditor || !state?.canRedo} icon={<Redo2 size={15} />} label={editorCommandLabel("redo")} onRun={() => activeEditor && runEditorCommand(activeEditor, "redo")} />
        </div>
      </div>

      <span className="mx-2 h-5 w-px shrink-0 bg-border" />
      <button
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent disabled:opacity-40"
        type="button"
        disabled={!activeEditor}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAskAi}
      >
        <Sparkles size={14} />
        <span className="hidden sm:inline">询问 AI</span>
      </button>
    </div>
  );
}
