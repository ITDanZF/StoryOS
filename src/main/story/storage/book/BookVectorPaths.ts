import { lstatSync } from "node:fs";
import path from "node:path";
import {
  ALIYUN_EMBEDDING_DIMENSIONS,
  ALIYUN_TEXT_EMBEDDING_MODEL,
  type AliyunEmbeddingDimensions,
} from "../../../../shared/contracts/settings/contracts.ts";

const SPACE_PREFIX = `${ALIYUN_TEXT_EMBEDDING_MODEL}-`;

export type BookVectorPaths = {
  readonly vectorsRoot: string;
  readonly metadataPath: string;
  readonly spacePath: string;
};

export function novelVectorSpaceId(dimensions: AliyunEmbeddingDimensions): string {
  return `${SPACE_PREFIX}${dimensions}`;
}

export function parseNovelVectorSpaceId(spaceId: string): AliyunEmbeddingDimensions {
  if (!spaceId.startsWith(SPACE_PREFIX)) {
    throw new Error(`Invalid novel vector space: ${spaceId}`);
  }
  const dimensions = Number(spaceId.slice(SPACE_PREFIX.length));
  if (!(ALIYUN_EMBEDDING_DIMENSIONS as readonly number[]).includes(dimensions)) {
    throw new Error(`Invalid novel vector space: ${spaceId}`);
  }
  return dimensions as AliyunEmbeddingDimensions;
}

export function getBookVectorPaths(bookRoot: string, spaceId: string): BookVectorPaths {
  const spaceDirectory = novelVectorSpaceId(parseNovelVectorSpaceId(spaceId));
  const root = requireBookDirectory(bookRoot);
  const vectorsRoot = contained(root, path.join(root, "vectors"));
  return Object.freeze({
    vectorsRoot,
    metadataPath: contained(root, path.join(vectorsRoot, "metadata.sqlite")),
    spacePath: contained(root, path.join(vectorsRoot, spaceDirectory)),
  });
}

function requireBookDirectory(bookRoot: string): string {
  if (typeof bookRoot !== "string" || bookRoot.trim() === "") {
    throw new Error("Book root path is required.");
  }
  const resolved = path.resolve(bookRoot);
  rejectSymlink(resolved);
  return resolved;
}

function contained(bookRoot: string, target: string): string {
  const resolved = path.resolve(target);
  const relative = path.relative(bookRoot, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Vector path escapes the book root: ${resolved}`);
  }
  let current = bookRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    rejectSymlink(current);
  }
  return resolved;
}

function rejectSymlink(target: string): void {
  try {
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error(`Vector path must not be a symbolic link: ${target}`);
    }
  } catch (error) {
    if (isMissingPath(error)) return;
    throw error;
  }
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
