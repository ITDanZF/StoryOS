const LIMITS = {
  document: 8_000,
  nodeTitle: 200,
  summary: 1_000,
  change: 2_000,
  relationType: 40,
  relationDescription: 2_000,
  participantName: 80,
  participantRole: 40,
  participantKind: 40,
  participantState: 2_000,
} as const;

function textLength(value: string): number {
  return Array.from(value).length;
}

export const STORY_RELATION_LABELS: Readonly<Record<string, string>> = {
  causes: "因果",
  requires: "前置",
  enables: "使可能",
  prevents: "阻止",
  reveals: "揭示",
  conceals: "隐瞒",
  foreshadows: "伏笔",
  contrasts: "对照",
  accompanies: "伴随",
};

const LABEL_TO_TYPE = new Map(Object.entries(STORY_RELATION_LABELS).map(([type, label]) => [label, type]));
const RESERVED_HEADINGS = new Set(["变化", "参与", "关系", "叙述"]);

export type StoryParticipant = {
  readonly name: string;
  readonly role: string;
  readonly kind: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
};

export type StoryRelationRef = {
  readonly type: string;
  readonly direction: "out" | "in";
  readonly otherTitle: string;
  readonly description: string;
};

export type StoryDocumentIssue = {
  readonly message: string;
  readonly blocking: boolean;
};

export type ParsedStoryDocument = {
  readonly title: string | null;
  readonly lead: string;
  readonly changeBefore: string;
  readonly changeAfter: string;
  readonly participants: readonly StoryParticipant[];
  readonly relations: readonly StoryRelationRef[];
  readonly issues: readonly StoryDocumentIssue[];
};

export type StoryDocumentInput = {
  readonly title: string;
  readonly lead?: string;
  readonly changeBefore?: string;
  readonly changeAfter?: string;
  readonly participants?: readonly StoryParticipant[];
  readonly relations?: readonly StoryRelationRef[];
  readonly telling?: string;
  readonly extra?: string;
};

export function relationLabel(type: string): string {
  return STORY_RELATION_LABELS[type] ?? type;
}

export function renderStoryDocument(input: StoryDocumentInput): string {
  const parts = [`# ${input.title.trim()}`];
  const lead = input.lead?.trim() ?? "";
  if (lead !== "") parts.push(lead);
  const extra = input.extra?.trim() ?? "";
  if (extra !== "") parts.push(extra);
  const change = changeSection(input.changeBefore ?? "", input.changeAfter ?? "");
  if (change !== "") parts.push(change);
  const participants = participantSection(input.participants ?? []);
  if (participants !== "") parts.push(participants);
  const relations = relationSection(input.relations ?? []);
  if (relations !== "") parts.push(relations);
  const telling = input.telling?.trim() ?? "";
  if (telling !== "") parts.push(`## 叙述\n${telling}`);
  return parts.join("\n\n");
}

export function parseStoryDocument(markdown: string): ParsedStoryDocument {
  const source = markdown.replace(/\r\n/g, "\n");
  if (textLength(source) > LIMITS.document) {
    return emptyParse([{ message: "文档超过上限", blocking: true }]);
  }
  const lines = source.split("\n");
  let title: string | null = null;
  let started = false;
  let currentName = "lead";
  const sections: { name: string; lines: string[] }[] = [];
  let currentLines: string[] = [];
  const issues: StoryDocumentIssue[] = [];
  const seenReserved = new Set<string>();

  const pushSection = () => {
    sections.push({ name: currentName, lines: currentLines });
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(\S.*?)\s*$/.exec(line);
    if (!started && line.trim() === "") continue;
    if (!started && heading?.[1] === "#") {
      title = heading[2]?.trim() ?? "";
      started = true;
      continue;
    }
    started = true;
    if (heading?.[1] === "##") {
      pushSection();
      currentName = heading[2]?.trim() ?? "";
      currentLines = [];
      if (RESERVED_HEADINGS.has(currentName)) {
        if (seenReserved.has(currentName)) {
          issues.push({ message: `「${currentName}」出现了两次`, blocking: true });
        }
        seenReserved.add(currentName);
      }
      continue;
    }
    currentLines.push(line);
  }
  pushSection();
  if (title === null) issues.push({ message: "文档缺少标题", blocking: false });
  if (title !== null && textLength(title) > LIMITS.nodeTitle) {
    issues.push({ message: "标题超过上限", blocking: true });
  }

  const lead = sections
    .filter((section) => section.name === "lead")
    .map((section) => section.lines.join("\n").trim())
    .filter((text) => text !== "")
    .join("\n\n");
  if (textLength(lead) > LIMITS.summary) {
    issues.push({ message: "开头超过摘要上限", blocking: true });
  }

  const change = readChange(sections.find((section) => section.name === "变化")?.lines ?? [], issues);
  const participants = readParticipants(sections.find((section) => section.name === "参与")?.lines ?? [], issues);
  const relations = readRelations(sections.find((section) => section.name === "关系")?.lines ?? [], issues);
  return { title, lead, ...change, participants, relations, issues };
}

export function replaceRelationSection(markdown: string, relations: readonly StoryRelationRef[]): string {
  return replaceNamedSection(markdown, "关系", relationSection(relations));
}

export function rewriteStoryFields(
  markdown: string,
  fields: {
    readonly title: string;
    readonly lead: string;
    readonly changeBefore: string;
    readonly changeAfter: string;
    readonly participants: readonly StoryParticipant[];
  },
): string {
  const source = markdown.replace(/\r\n/g, "\n");
  const headingAt = source.search(/\n##\s+/);
  const rest = headingAt === -1 ? "" : source.slice(headingAt + 1);
  const body = replaceNamedSection(
    replaceNamedSection(rest, "变化", changeSection(fields.changeBefore, fields.changeAfter)),
    "参与",
    participantSection(fields.participants),
  ).trim();
  const preamble = [`# ${fields.title.trim()}`];
  if (fields.lead.trim() !== "") preamble.push(fields.lead.trim());
  const head = preamble.join("\n\n");
  return body === "" ? head : `${head}\n\n${body}`;
}

function replaceNamedSection(markdown: string, heading: string, rendered: string): string {
  const source = markdown.replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`).test(line));
  if (start < 0) {
    if (rendered === "") return source;
    return source.trimEnd() === "" ? rendered : `${source.trimEnd()}\n\n${rendered}`;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  const next = [...lines.slice(0, start), ...lines.slice(end)];
  const text = next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (rendered === "") return text;
  return text === "" ? rendered : `${text}\n\n${rendered}`;
}

function changeSection(before: string, after: string): string {
  const lines: string[] = [];
  if (before.trim() !== "") lines.push(`之前：${before.trim()}`);
  if (after.trim() !== "") lines.push(`之后：${after.trim()}`);
  return lines.length === 0 ? "" : `## 变化\n${lines.join("\n")}`;
}

function participantSection(participants: readonly StoryParticipant[]): string {
  if (participants.length === 0) return "";
  const lines = participants.map((participant) => {
    const parts = [participant.name.trim(), participant.role.trim(), participant.kind.trim()];
    if (participant.stateBefore.trim() !== "") parts.push(`之前：${participant.stateBefore.trim()}`);
    if (participant.stateAfter.trim() !== "") parts.push(`之后：${participant.stateAfter.trim()}`);
    return `- ${parts.join("｜")}`;
  });
  return `## 参与\n${lines.join("\n")}`;
}

function relationSection(relations: readonly StoryRelationRef[]): string {
  if (relations.length === 0) return "";
  const lines = relations.map((relation) => {
    const arrow = relation.direction === "out" ? "→" : "←";
    const description = relation.description.trim();
    const suffix = description === "" ? "" : `：${description}`;
    return `- ${relationLabel(relation.type)} ${arrow} [[${relation.otherTitle}]]${suffix}`;
  });
  return `## 关系\n${lines.join("\n")}`;
}

function readChange(lines: readonly string[], issues: StoryDocumentIssue[]): { changeBefore: string; changeAfter: string } {
  let changeBefore: string | null = null;
  let changeAfter: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const before = /^之前\s*[：:]\s*(.*)$/.exec(trimmed);
    const after = /^之后\s*[：:]\s*(.*)$/.exec(trimmed);
    if (before) {
      if (changeBefore !== null) issues.push({ message: "「之前」写了两次", blocking: true });
      changeBefore = before[1] ?? "";
      continue;
    }
    if (after) {
      if (changeAfter !== null) issues.push({ message: "「之后」写了两次", blocking: true });
      changeAfter = after[1] ?? "";
    }
  }
  const nextBefore = changeBefore ?? "";
  const nextAfter = changeAfter ?? "";
  if (textLength(nextBefore) > LIMITS.change) issues.push({ message: "变化之前超过上限", blocking: true });
  if (textLength(nextAfter) > LIMITS.change) issues.push({ message: "变化之后超过上限", blocking: true });
  return { changeBefore: nextBefore, changeAfter: nextAfter };
}

function readParticipants(lines: readonly string[], issues: StoryDocumentIssue[]): StoryParticipant[] {
  const participants: StoryParticipant[] = [];
  const names = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const item = /^[-*]\s+(.+)$/.exec(trimmed);
    if (!item?.[1]) {
      issues.push({ message: `参与者这一行无法读取：${trimmed}`, blocking: false });
      continue;
    }
    const parts = item[1].split(/[|｜]/).map((part) => part.trim());
    const name = parts[0] ?? "";
    if (name === "") {
      issues.push({ message: "参与者缺少名字", blocking: false });
      continue;
    }
    if (names.has(name)) {
      issues.push({ message: `参与者「${name}」重复`, blocking: false });
      continue;
    }
    let stateBefore = "";
    let stateAfter = "";
    let readable = true;
    for (const part of parts.slice(3)) {
      const before = /^之前\s*[：:]\s*(.*)$/.exec(part);
      const after = /^之后\s*[：:]\s*(.*)$/.exec(part);
      if (before) stateBefore = before[1] ?? "";
      else if (after) stateAfter = after[1] ?? "";
      else readable = false;
    }
    if (!readable) {
      issues.push({ message: `参与者这一行无法读取：${trimmed}`, blocking: false });
      continue;
    }
    const participant = {
      name,
      role: parts[1] ?? "",
      kind: parts[2] ?? "",
      stateBefore,
      stateAfter,
    };
    const limited = participantLimit(participant);
    if (limited) {
      issues.push({ message: limited, blocking: true });
      continue;
    }
    names.add(name);
    participants.push(participant);
  }
  return participants;
}

function readRelations(lines: readonly string[], issues: StoryDocumentIssue[]): StoryRelationRef[] {
  const relations: StoryRelationRef[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const match = /^[-*]\s+(.+?)\s+(→|->|←|<-)\s+\[\[(.+?)\]\]\s*(?:[：:]\s*(.*))?$/.exec(trimmed);
    if (!match?.[1] || !match[2] || !match[3]) {
      issues.push({ message: `关系这一行无法读取：${trimmed}`, blocking: false });
      continue;
    }
    const type = relationType(match[1]);
    const otherTitle = match[3].trim();
    const description = match[4]?.trim() ?? "";
    if (type === "" || otherTitle === "") {
      issues.push({ message: `关系这一行无法读取：${trimmed}`, blocking: false });
      continue;
    }
    if (textLength(type) > LIMITS.relationType) {
      issues.push({ message: "关系类型超过上限", blocking: true });
      continue;
    }
    if (textLength(description) > LIMITS.relationDescription) {
      issues.push({ message: "关系说明超过上限", blocking: true });
      continue;
    }
    const direction = match[2] === "→" || match[2] === "->" ? "out" : "in";
    const key = `${type}\u001f${direction}\u001f${otherTitle}`;
    if (seen.has(key)) {
      issues.push({ message: `关系「${otherTitle}」重复`, blocking: false });
      continue;
    }
    seen.add(key);
    relations.push({ type, direction, otherTitle, description });
  }
  return relations;
}

function relationType(label: string): string {
  const trimmed = label.trim();
  return LABEL_TO_TYPE.get(trimmed) ?? trimmed;
}

function participantLimit(participant: StoryParticipant): string | null {
  if (textLength(participant.name) > LIMITS.participantName) return "参与者名字超过上限";
  if (textLength(participant.role) > LIMITS.participantRole) return "参与者角色超过上限";
  if (textLength(participant.kind) > LIMITS.participantKind) return "参与者种类超过上限";
  if (textLength(participant.stateBefore) > LIMITS.participantState) return "参与者之前的状态超过上限";
  if (textLength(participant.stateAfter) > LIMITS.participantState) return "参与者之后的状态超过上限";
  return null;
}

function emptyParse(issues: readonly StoryDocumentIssue[]): ParsedStoryDocument {
  return { title: null, lead: "", changeBefore: "", changeAfter: "", participants: [], relations: [], issues };
}
