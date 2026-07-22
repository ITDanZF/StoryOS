export function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("Model response does not contain a JSON object.");
  }
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}
