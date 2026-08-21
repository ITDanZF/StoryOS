import { Fragment, type ReactNode } from "react";
import { cn } from "../../../../lib/utils.ts";

type MessageMarkdownProps = {
  readonly content: string;
  readonly compact?: boolean;
};

type CodeBlock = {
  readonly type: "code";
  readonly language: string | null;
  readonly code: string;
};

type TextBlock = {
  readonly type: "text";
  readonly lines: readonly string[];
};

type MarkdownBlock = CodeBlock | TextBlock;

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

function splitBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let textLines: string[] = [];
  let codeLines: string[] | null = null;
  let language: string | null = null;

  const flushText = () => {
    if (textLines.length === 0) return;
    blocks.push({ type: "text", lines: textLines });
    textLines = [];
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      if (codeLines) {
        blocks.push({ type: "code", language, code: codeLines.join("\n") });
        codeLines = null;
        language = null;
      } else {
        flushText();
        codeLines = [];
        language = fence[1] ?? null;
      }
      continue;
    }

    if (codeLines) codeLines.push(line);
    else textLines.push(line);
  }

  if (codeLines) blocks.push({ type: "code", language, code: codeLines.join("\n") });
  flushText();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${index}-strong`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.92em] text-neutral-800" key={`${index}-code`}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        nodes.push(
          <a className="font-medium text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900" href={link[2]} key={`${index}-link`} rel="noreferrer" target="_blank">
            {link[1]}
          </a>,
        );
      } else nodes.push(token);
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderTextLines(lines: readonly string[], compact: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let ordered = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    const ListTag = ordered ? "ol" : "ul";
    nodes.push(
      <ListTag className={cn("my-3 space-y-1.5 pl-5", ordered ? "list-decimal" : "list-disc")} key={`list-${nodes.length}`}>
        {listItems}
      </ListTag>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const HeadingTag = heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5";
      nodes.push(
        <HeadingTag className={cn("mb-2 mt-4 font-semibold tracking-tight text-neutral-950 first:mt-0", compact ? "text-sm" : "text-base")} key={`heading-${index}`}>
          {renderInline(heading[2])}
        </HeadingTag>,
      );
      return;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushList();
      nodes.push(
        <blockquote className="my-3 rounded-r-xl border-l-2 border-violet-200 bg-violet-50/60 px-3 py-2 text-neutral-600" key={`quote-${index}`}>
          {renderInline(quote[1])}
        </blockquote>,
      );
      return;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      nodes.push(<hr className="my-4 border-neutral-200" key={`hr-${index}`} />);
      return;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (unorderedItem || orderedItem) {
      const isOrdered = Boolean(orderedItem);
      if (listItems.length > 0 && ordered !== isOrdered) flushList();
      ordered = isOrdered;
      listItems.push(<li key={`item-${index}`}>{renderInline((unorderedItem ?? orderedItem)?.[1] ?? line)}</li>);
      return;
    }

    flushList();
    nodes.push(
      <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0" key={`p-${index}`}>
        {renderInline(line)}
      </p>,
    );
  });

  flushList();
  return nodes;
}

function CodeBlockView({ block, compact }: { readonly block: CodeBlock; readonly compact: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.code.trimEnd());
    } catch {
      // Clipboard failures are non-critical in the renderer.
    }
  };

  return (
    <figure className="my-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm">
      <figcaption className="flex h-8 items-center justify-between border-b border-white/10 px-3 text-[10px] text-neutral-400">
        <span className="font-medium uppercase tracking-[0.12em]">{block.language ?? "code"}</span>
        <button className="rounded-md px-2 py-1 text-neutral-300 hover:bg-white/10 hover:text-white" type="button" onClick={() => void copy()}>
          复制
        </button>
      </figcaption>
      <pre className={cn("overflow-auto p-3 font-mono leading-relaxed text-neutral-100", compact ? "text-[11px]" : "text-xs")}>
        <code>{block.code.trimEnd()}</code>
      </pre>
    </figure>
  );
}

export default function MessageMarkdown({ content, compact = false }: MessageMarkdownProps) {
  const blocks = splitBlocks(content);

  return (
    <div className={cn("min-w-0 break-words", compact ? "text-xs leading-[1.78]" : "text-[13px] leading-[1.82] sm:text-sm")}>
      {blocks.map((block, index) => (
        <Fragment key={index}>
          {block.type === "code"
            ? <CodeBlockView block={block} compact={compact} />
            : renderTextLines(block.lines, compact)}
        </Fragment>
      ))}
    </div>
  );
}
