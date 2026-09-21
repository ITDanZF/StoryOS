import { BookOpen, Lightbulb, PenLine, Sparkles } from "lucide-react";
import { cn } from "../../../../lib/utils.ts";

type ChatEmptyStateProps = {
  readonly loading?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly compact?: boolean;
  readonly suggestions?: readonly string[];
  readonly onPickSuggestion?: (suggestion: string) => void;
};

const defaultSuggestions = [
  "帮我梳理当前思路",
  "给出三个可执行方案",
  "检查是否有遗漏风险",
];

export default function ChatEmptyState({
  loading = false,
  title = "开始一段新对话",
  description = "输入问题后，AI 的分析、代码和创作建议会在这里清晰展示。",
  compact = false,
  suggestions = defaultSuggestions,
  onPickSuggestion,
}: ChatEmptyStateProps) {
  return (
    <div className={cn("flex min-h-full flex-col items-center justify-center px-5 text-center", compact ? "pb-8 pt-4" : "pb-36 pt-12 sm:pb-44")}>
      <span className={cn("grid place-items-center rounded-3xl bg-accent text-accent-foreground ring-1 ring-inset ring-accent-border", compact ? "mb-3 size-11" : "mb-5 size-14")}>
        <Sparkles size={compact ? 21 : 27} />
      </span>
      <h2 className={cn("m-0 font-semibold tracking-tight text-foreground", compact ? "text-base" : "text-xl sm:text-[22px]")}>
        {loading ? "正在载入工作台" : title}
      </h2>
      <p className={cn("mt-2 max-w-xl text-muted-foreground", compact ? "text-xs leading-5" : "text-xs leading-6 sm:text-[13px]")}>
        {loading ? "正在准备你的对话和项目上下文。" : description}
      </p>

      {!loading && suggestions.length > 0 && (
        <div className={cn("mt-5 grid w-full max-w-2xl gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3")}>
          {suggestions.map((suggestion, index) => {
            const Icon = index % 3 === 0 ? PenLine : index % 3 === 1 ? BookOpen : Lightbulb;
            const content = (
              <>
                <Icon className="mb-2 text-text-subtle group-hover:text-accent-foreground" size={15} />
                <span className="text-xs font-medium leading-5 text-text-secondary group-hover:text-accent-foreground">{suggestion}</span>
              </>
            );

            return onPickSuggestion ? (
              <button
                className="group rounded-2xl border border-border bg-card/80 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent-border hover:bg-accent/60 hover:shadow-md"
                key={suggestion}
                type="button"
                onClick={() => onPickSuggestion(suggestion)}
              >
                {content}
              </button>
            ) : (
              <div className="group rounded-2xl border border-border bg-card/80 p-3 text-left shadow-sm" key={suggestion}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
