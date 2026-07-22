import type { SkillDefinition } from "./SkillTypes.ts";

export type SkillSelection = {
  readonly skill: SkillDefinition;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly matchedTerms: readonly string[];
};

export type SkillResolveRequest = {
  readonly input: string;
  readonly skills: readonly SkillDefinition[];
  readonly activeSkillIds?: readonly string[];
  readonly disabledSkillIds?: readonly string[];
  readonly maxSkills?: number;
  readonly minScore?: number;
};

export type SkillResolverOptions = {
  readonly maxSkills?: number;
  readonly minScore?: number;
};

const DEFAULT_MAX_SKILLS = 2;
const DEFAULT_MIN_SCORE = 50;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(input: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) {
    return false;
  }

  if (/^[a-z0-9_-]+$/.test(normalizedTerm)) {
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}($|\\s)`).test(input);
  }

  return input.includes(normalizedTerm);
}

function tokenize(text: string): readonly string[] {
  return Object.freeze(
    normalizeText(text)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function headingText(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => /^#{1,2}\s+/.test(line))
    .map((line) => line.replace(/^#{1,2}\s+/, ""))
    .join("\n");
}

function addMatch(input: {
  readonly reasons: string[];
  readonly matchedTerms: Set<string>;
  readonly reason: string;
  readonly term: string;
}): void {
  input.reasons.push(input.reason);
  input.matchedTerms.add(input.term);
}

function normalizeSkillIds(skillIds: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((skillIds ?? []).map((skillId) => skillId.trim()).filter(Boolean));
}

function scoreSkill(
  skill: SkillDefinition,
  normalizedInput: string,
  manual: boolean,
): SkillSelection | null {
  let score = 0;
  const reasons: string[] = [];
  const matchedTerms = new Set<string>();
  const { manifest } = skill;

  if (manual) {
    score += 1000;
    addMatch({
      reasons,
      matchedTerms,
      reason: "manual activation",
      term: manifest.id,
    });
  }

  if (containsTerm(normalizedInput, manifest.id)) {
    score += 120;
    addMatch({ reasons, matchedTerms, reason: "id match", term: manifest.id });
  }

  if (containsTerm(normalizedInput, manifest.name)) {
    score += 100;
    addMatch({ reasons, matchedTerms, reason: "name match", term: manifest.name });
  }

  for (const trigger of manifest.triggers ?? []) {
    if (containsTerm(normalizedInput, trigger)) {
      score += 90;
      addMatch({ reasons, matchedTerms, reason: "trigger match", term: trigger });
      continue;
    }

    const triggerTokens = tokenize(trigger);
    if (
      triggerTokens.length > 1 &&
      triggerTokens.every((token) => containsTerm(normalizedInput, token))
    ) {
      score += 50;
      addMatch({ reasons, matchedTerms, reason: "trigger tokens match", term: trigger });
    }
  }

  for (const token of tokenize(manifest.description)) {
    if (containsTerm(normalizedInput, token)) {
      score += 25;
      addMatch({ reasons, matchedTerms, reason: "description keyword match", term: token });
      break;
    }
  }

  for (const token of tokenize(headingText(skill.body))) {
    if (containsTerm(normalizedInput, token)) {
      score += 10;
      addMatch({ reasons, matchedTerms, reason: "heading keyword match", term: token });
      break;
    }
  }

  if (score <= 0) {
    return null;
  }

  return Object.freeze({
    skill,
    score,
    reasons: Object.freeze(reasons),
    matchedTerms: Object.freeze([...matchedTerms]),
  });
}

export default class SkillResolver {
  constructor(private readonly options: SkillResolverOptions = {}) {}

  resolve(request: SkillResolveRequest): readonly SkillSelection[] {
    const maxSkills = request.maxSkills ?? this.options.maxSkills ?? DEFAULT_MAX_SKILLS;
    const minScore = request.minScore ?? this.options.minScore ?? DEFAULT_MIN_SCORE;
    const normalizedInput = normalizeText(request.input);

    if (!normalizedInput) {
    return Object.freeze([]);
  }

    const activeSkillIds = normalizeSkillIds(request.activeSkillIds);
    const disabledSkillIds = normalizeSkillIds(request.disabledSkillIds);

    return Object.freeze(
      request.skills
        .filter((skill) =>
          activeSkillIds.has(skill.manifest.id) || !disabledSkillIds.has(skill.manifest.id),
        )
        .map((skill) => scoreSkill(skill, normalizedInput, activeSkillIds.has(skill.manifest.id)))
        .filter((selection): selection is SkillSelection =>
          selection !== null && selection.score >= minScore,
        )
        .sort((left, right) =>
          right.score - left.score ||
          left.skill.manifest.id.localeCompare(right.skill.manifest.id),
        )
        .slice(0, maxSkills),
    );
  }
}

export { normalizeText as normalizeSkillMatchText };
