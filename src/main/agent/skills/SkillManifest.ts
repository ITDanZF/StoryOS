import { z } from "zod";

export type SkillManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly triggers?: readonly string[];
  readonly tools?: readonly string[];
  readonly agent?: {
    readonly enabled?: boolean;
    readonly id?: string;
    readonly name?: string;
    readonly maxTurns?: number;
    readonly tools?: readonly string[];
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ParsedSkillFile = {
  readonly manifest: SkillManifest;
  readonly body: string;
};

export type SkillManifestValidationOptions = {
  readonly knownToolNames?: readonly string[];
};

const skillIdPattern = /^[a-z0-9][a-z0-9_-]*$/;
const nonEmptyString = z.string().trim().min(1);
const skillId = z.string().regex(skillIdPattern);

const skillManifestSchema = z.object({
  id: skillId,
  name: nonEmptyString,
  version: z.number().int().positive(),
  description: nonEmptyString,
  triggers: z.array(nonEmptyString).max(20).optional(),
  tools: z.array(nonEmptyString).optional(),
  agent: z.object({
    enabled: z.boolean().optional(),
    id: skillId.optional(),
    name: nonEmptyString.optional(),
    maxTurns: z.number().int().positive().optional(),
    tools: z.array(nonEmptyString).optional(),
  }).strict().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

function parseScalar(value: string): unknown {
  const trimmedValue = value.trim();

  if (trimmedValue === "[]") {
    return [];
  }

  const inlineArrayMatch = trimmedValue.match(/^\[(.*)]$/);
  if (inlineArrayMatch) {
    const [, arrayContent] = inlineArrayMatch;
    if (!arrayContent.trim()) {
      return [];
    }

    return arrayContent
      .split(",")
      .map((item) => parseScalar(item.trim()))
      .filter((item) => !(typeof item === "string" && item.length === 0));
  }

  if (trimmedValue === "true") {
    return true;
  }
  if (trimmedValue === "false") {
    return false;
  }
  if (/^-?\d+$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }
  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function countIndent(line: string): number {
  return line.length - line.trimStart().length;
}

type ParseResult = {
  readonly value: unknown;
  readonly nextIndex: number;
};

function parseArray(lines: readonly string[], startIndex: number, indent: number): ParseResult {
  const items: unknown[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(line);
    if (lineIndent < indent || !line.trimStart().startsWith("- ")) {
      break;
    }
    if (lineIndent > indent) {
      throw new Error(`Invalid nested array indentation: ${line}`);
    }

    const itemValue = line.trimStart().slice(2).trim();
    items.push(parseScalar(itemValue));
    index += 1;
  }

  return { value: items, nextIndex: index };
}

function parseBlockScalar(
  lines: readonly string[],
  startIndex: number,
  parentIndent: number,
  folded: boolean,
): ParseResult {
  const values: string[] = [];
  let index = startIndex;
  let blockIndent: number | null = null;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      values.push("");
      index += 1;
      continue;
    }

    const lineIndent = countIndent(line);
    if (lineIndent <= parentIndent) {
      break;
    }

    blockIndent ??= lineIndent;
    values.push(line.slice(Math.min(lineIndent, blockIndent)));
    index += 1;
  }

  const value = folded
    ? values.join(" ").replace(/\s+/g, " ").trim()
    : values.join("\n").trim();

  return { value, nextIndex: index };
}

function parseObject(lines: readonly string[], startIndex: number, indent: number): ParseResult {
  const objectValue: Record<string, unknown> = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new Error(`Invalid indentation: ${line}`);
    }

    const match = line.trimStart().match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const [, key, rawValue = ""] = match;
    const trimmedRawValue = rawValue.trim();
    if (trimmedRawValue === ">" || trimmedRawValue === "|") {
      const parsed = parseBlockScalar(
        lines,
        index + 1,
        lineIndent,
        trimmedRawValue === ">",
      );
      objectValue[key] = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (trimmedRawValue) {
      objectValue[key] = parseScalar(rawValue);
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex].trim()) {
      nextIndex += 1;
    }

    if (nextIndex >= lines.length) {
      objectValue[key] = {};
      index += 1;
      continue;
    }

    const nextIndent = countIndent(lines[nextIndex]);
    if (nextIndent <= lineIndent) {
      objectValue[key] = {};
      index += 1;
      continue;
    }

    const parsed = lines[nextIndex].trimStart().startsWith("- ")
      ? parseArray(lines, nextIndex, nextIndent)
      : parseObject(lines, nextIndex, nextIndent);
    objectValue[key] = parsed.value;
    index = parsed.nextIndex;
  }

  return { value: objectValue, nextIndex: index };
}

export function parseSkillFile(content: string): ParsedSkillFile {
  const normalizedContent = content.replace(/^\uFEFF/, "");
  const lines = normalizedContent.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    throw new Error("Skill file must start with frontmatter delimiter: ---. ");
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) {
    throw new Error("Skill file frontmatter is missing closing delimiter: ---. ");
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join("\n").trim();
  const parsedFrontmatter = parseObject(frontmatterLines, 0, 0).value;
  const manifest = validateSkillManifest(parsedFrontmatter);

  if (!body) {
    throw new Error(`Skill body is required: ${manifest.id}`);
  }

  return Object.freeze({ manifest, body });
}

export function validateSkillManifest(
  value: unknown,
  options: SkillManifestValidationOptions = {},
): SkillManifest {
  const manifest = skillManifestSchema.parse(value);
  const allToolNames = [
    ...(manifest.tools ?? []),
    ...(manifest.agent?.tools ?? []),
  ];
  const knownToolNames = options.knownToolNames
    ? new Set(options.knownToolNames)
    : null;

  for (const toolName of allToolNames) {
    if (knownToolNames && !knownToolNames.has(toolName)) {
      throw new Error(`Unknown tool in skill ${manifest.id}: ${toolName}`);
    }
  }

  if (manifest.agent?.tools && manifest.tools) {
    const declaredTools = new Set(manifest.tools);
    for (const toolName of manifest.agent.tools) {
      if (!declaredTools.has(toolName)) {
        throw new Error(
          `Agent tool ${toolName} must be declared in skill tools: ${manifest.id}`,
        );
      }
    }
  }

  return Object.freeze({
    ...manifest,
    triggers: manifest.triggers ? Object.freeze([...manifest.triggers]) : undefined,
    tools: manifest.tools ? Object.freeze([...manifest.tools]) : undefined,
    agent: manifest.agent
      ? Object.freeze({
          ...manifest.agent,
          tools: manifest.agent.tools
            ? Object.freeze([...manifest.agent.tools])
            : undefined,
        })
      : undefined,
    metadata: manifest.metadata ? Object.freeze({ ...manifest.metadata }) : undefined,
  });
}
