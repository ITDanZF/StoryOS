const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "with",
  "一个",
  "以及",
  "了",
  "和",
  "在",
  "是",
  "有",
  "的",
  "与",
]);

function normalizedToken(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function cjkNgrams(content: string): string[] {
  const result: string[] = [];
  for (const match of content.matchAll(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
  )) {
    const characters = [...match[0]];
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= characters.length; index += 1) {
        result.push(characters.slice(index, index + size).join(""));
      }
    }
  }
  return result;
}

export function normalizeSearchText(content: string): string {
  return content
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(content: string): readonly string[] {
  const tokens: string[] = [];
  const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  for (const segment of segmenter.segment(content)) {
    if (!segment.isWordLike) continue;
    const token = normalizedToken(segment.segment);
    if (token.length > 0 && !STOP_WORDS.has(token)) tokens.push(token);
  }
  tokens.push(...cjkNgrams(normalizeSearchText(content)));
  return Object.freeze(tokens);
}

export function normalizedNgrams(
  content: string,
  size = 3,
): ReadonlySet<string> {
  const characters = [
    ...normalizeSearchText(content).replace(/[\p{P}\p{S}\s]/gu, ""),
  ];
  const values = new Set<string>();
  if (characters.length < size) {
    if (characters.length > 0) values.add(characters.join(""));
    return values;
  }
  for (let index = 0; index + size <= characters.length; index += 1) {
    values.add(characters.slice(index, index + size).join(""));
  }
  return values;
}
