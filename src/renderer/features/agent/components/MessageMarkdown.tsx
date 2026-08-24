import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "../../../../lib/utils.ts";

type MessageMarkdownProps = {
  readonly content: string;
  readonly compact?: boolean;
};

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function languageOf(node: ReactNode): string | null {
  const code = Children.toArray(node).find((child) => isValidElement(child));
  if (!isValidElement<{ className?: string }>(code)) return null;
  return code.props.className?.match(/language-([\w-]+)/)?.[1] ?? null;
}

function CodeBlock({ children }: ComponentPropsWithoutRef<"pre">) {
  const code = textOf(children).replace(/\n$/, "");
  const language = languageOf(children);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard availability is platform-dependent and does not affect rendering.
    }
  };

  return (
    <figure className="my-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      <figcaption className="flex h-8 items-center justify-between border-b border-white/10 px-3 text-[10px] text-neutral-400">
        <span className="font-medium uppercase tracking-[0.12em]">{language ?? "code"}</span>
        <button className="rounded-md px-2 py-1 text-neutral-300 hover:bg-white/10 hover:text-white" type="button" onClick={() => void copy()}>
          复制
        </button>
      </figcaption>
      <pre className="m-0 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-neutral-100">
        {children}
      </pre>
    </figure>
  );
}

const components: Components = {
  h1: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold tracking-tight text-neutral-950 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 text-[15px] font-semibold tracking-tight text-neutral-950 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-semibold tracking-tight text-neutral-900 first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-1.5 mt-4 text-sm font-medium text-neutral-900 first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-neutral-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-neutral-500">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-violet-200 bg-violet-50/50 px-3 py-2 text-neutral-600">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-neutral-200" />,
  a: ({ children, href }) => (
    <a className="font-medium text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-500" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-semibold text-neutral-700">{children}</th>,
  td: ({ children }) => <td className="border-b border-neutral-100 px-3 py-2 align-top">{children}</td>,
  pre: CodeBlock,
  code: ({ children, className }) => className?.startsWith("language-")
    ? <code className={className}>{children}</code>
    : <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.92em] text-neutral-800">{children}</code>,
};

export default function MessageMarkdown({ content, compact = false }: MessageMarkdownProps) {
  return (
    <div className={cn(
      "min-w-0 break-words text-neutral-800",
      compact ? "text-sm leading-6" : "text-sm leading-[1.75]",
    )}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
