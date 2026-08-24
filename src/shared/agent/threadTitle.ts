const UNTITLED_THREAD_TITLES = new Set(["新对话", "开始新对话"]);
const LEADING_REQUEST_PHRASES = /^(?:我想请你|我想让你|我需要你|麻烦你|请帮我|请你|帮我|请)\s*/u;
const LEADING_GREETINGS = /^(?:你好|您好|嗨|hello|hi)[，,。.!！?？\s]*/iu;

export function isUntitledThreadTitle(title: string): boolean {
  return UNTITLED_THREAD_TITLES.has(title.trim());
}

export function deriveThreadTitle(prompt: string): string {
  let normalized = prompt
    .replace(/```[\s\S]*?```/g, " 代码 ")
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[#>*+\-\d.)\s]+/u, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized.replace(LEADING_GREETINGS, "");
  let previous = "";
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(LEADING_REQUEST_PHRASES, "");
  }

  const clauses = normalized
    .split(/[。！？!?；;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const candidate = clauses.find((item) => Array.from(item).length >= 4)
    ?? clauses[0]
    ?? "新对话";
  const cleaned = candidate.replace(/[，,：:\s]+$/u, "").trim();
  if (!cleaned) return "新对话";

  const characters = Array.from(cleaned);
  const maximum = /[\u3400-\u9fff]/u.test(cleaned) ? 24 : 44;
  return characters.length > maximum
    ? `${characters.slice(0, maximum).join("")}…`
    : cleaned;
}
